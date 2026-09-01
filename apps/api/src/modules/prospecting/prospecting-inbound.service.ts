import { randomUUID } from 'node:crypto';
import { type PrismaClient } from '../../database-client/client.js';
import { type Environment } from '../../config/environment.js';
import { type ProspectingWhatsAppConfigService } from './prospecting-whatsapp-config.service.js';
import { normalizeWhatsAppPhone } from '../integrations/whatsapp-phone.js';
import { ProspectingObjectionEngine } from './prospecting-objection-engine.js';
import { ProspectingFlowEngine } from './prospecting-flow-engine.service.js';

interface ProspectingInboundPayload {
  instanceId: string | null;
  externalMessageId: string | null;
  fromPhone: string | null;
  body: string | null | undefined;
  fromMe?: boolean;
  timestamp: Date | null | undefined;
  eventType: string | null;
  referencedMessageId?: string | null;
  selectedIndex?: number | null;
}

interface ProspectingInboundResult {
  handled: boolean;
  reason?: string;
  leadPublicId?: string;
  campaignPublicId?: string;
}

/**
 * Serviço de ingestão de mensagens inbound para Prospecting.
 * Recebe payloads já normalizados e encaminha para o fluxo apropriado.
 */
export class ProspectingInboundService {
  public constructor(
    private readonly client?: PrismaClient | null,
    private readonly configService?: ProspectingWhatsAppConfigService | null,
    private readonly environment?: Environment | null,
  ) {}

  /**
   * Obtém configuração de instância Prospecting.
   */
  public async getConfig() {
    return this.configService?.getConfig?.();
  }

  /**
   * Processa inbound recebido do webhook global.
   */
  public async processInbound(payload: ProspectingInboundPayload): Promise<ProspectingInboundResult> {
    const trace = {
      eventType: payload.eventType,
      fromMe: payload.fromMe,
      hasBody: !!payload.body,
      body: typeof payload.body === 'string' ? payload.body.slice(0, 50) : payload.body,
      fromPhone: payload.fromPhone,
      instanceIdProvided: !!payload.instanceId,
    };

    if (!this.client || !this.configService) {
      console.log('[ProspectingInboundTrace]', { ...trace, result: 'SERVICE_NOT_CONFIGURED' });
      return { handled: false, reason: 'SERVICE_NOT_CONFIGURED' };
    }

    // Ignorar eventos que não são mensagens recebidas
    if (payload.fromMe === true) {
      console.log('[ProspectingInboundTrace]', { ...trace, result: 'FROM_ME' });
      return { handled: false, reason: 'FROM_ME' };
    }

    // Aceitar MESSAGE_RECEIVED (texto normal) ou MESSAGE_ACTION (clique de botão)
    if (payload.eventType !== 'MESSAGE_RECEIVED' && payload.eventType !== 'MESSAGE_ACTION') {
      console.log('[ProspectingInboundTrace]', { ...trace, result: 'NOT_MESSAGE_EVENT' });
      return { handled: false, reason: 'NOT_MESSAGE_EVENT' };
    }

    // Para MESSAGE_RECEIVED: obrigatório body
    // Para MESSAGE_ACTION: usa selectedDisplayText que já foi normalizado para body
    if (!payload.body || (typeof payload.body === 'string' && payload.body.trim() === '')) {
      if (payload.eventType === 'MESSAGE_ACTION') {
        console.log('[ProspectingInboundTrace]', { ...trace, result: 'MESSAGE_ACTION_MISSING_BUTTON_TEXT' });
        return { handled: false, reason: 'MESSAGE_ACTION_MISSING_BUTTON_TEXT' };
      }
      console.log('[ProspectingInboundTrace]', { ...trace, result: 'EMPTY_BODY' });
      return { handled: false, reason: 'EMPTY_BODY' };
    }

    // Verificar se instanceId é da Prospecting
    const config = await this.configService.getConfig();
    const instanceMatch = config && config.instanceId === payload.instanceId;
    if (!config || !instanceMatch) {
      console.log('[ProspectingInboundTrace]', {
        ...trace,
        configExists: !!config,
        configInstanceId: config?.instanceId,
        result: 'INSTANCE_MISMATCH'
      });
      return { handled: false, reason: 'INSTANCE_MISMATCH' };
    }

    // Normalizar telefone
    if (!payload.fromPhone) {
      console.log('[ProspectingInboundTrace]', { ...trace, result: 'INVALID_PHONE' });
      return { handled: false, reason: 'INVALID_PHONE' };
    }

    const normalizedPhone = normalizeWhatsAppPhone(payload.fromPhone);
    if (!normalizedPhone) {
      console.log('[ProspectingInboundTrace]', { ...trace, normalizeAttempt: payload.fromPhone, result: 'INVALID_PHONE' });
      return { handled: false, reason: 'INVALID_PHONE' };
    }

    // Idempotência via externalMessageId
    if (payload.externalMessageId) {
      const existing = await this.client.prospectingMessage.findFirst({
        where: {
          externalMessageId: payload.externalMessageId,
          direction: 'INBOUND',
        },
      });

      if (existing) {
        console.log('[ProspectingInboundTrace]', { ...trace, result: 'DUPLICATE_MESSAGE' });
        return { handled: true, reason: 'DUPLICATE_MESSAGE' };
      }
    }

    // Encontrar Lead elegível
    // PRIORIDADE 1: referencedMessageId → outbound message → lead exato
    let leadData = null;
    let desambiguationMethod = 'none';

    if (payload.referencedMessageId) {
      leadData = await this.findEligibleLeadByReferencedMessage(
        payload.referencedMessageId,
        normalizedPhone
      );
      if (leadData) {
        desambiguationMethod = 'referenced_message';
      }
    }

    // PRIORIDADE 2-3: telefone
    if (!leadData) {
      leadData = await this.findEligibleLead(normalizedPhone);
      if (leadData) {
        desambiguationMethod = 'phone';
      }
    }

    if (!leadData) {
      console.log('[ProspectingInboundTrace]', {
        ...trace,
        normalizedPhone,
        referencedMessageId: payload.referencedMessageId,
        desambiguationMethod,
        result: 'LEAD_NOT_FOUND'
      });
      return { handled: false, reason: 'LEAD_NOT_FOUND' };
    }

    // Log desambiguação
    console.log('[ProspectingInboundTrace]', {
      ...trace,
      normalizedPhone,
      referencedMessageId: payload.referencedMessageId,
      desambiguationMethod,
      leadPublicId: leadData.publicId,
      desambiguationSuccess: true
    });

    // Criar mensagem INBOUND
    let message;
    try {
      console.log('[STAGE] INBOUND_MESSAGE_CREATE_START');
      console.log('[STAGE_DATA]', {
        leadId: String(leadData.id),
        campaignId: String(leadData.campaignId),
        externalMessageId: payload.externalMessageId ?? null,
        bodyLength: payload.body ? (payload.body as string).length : 0,
      });

      message = await this.client.prospectingMessage.create({
        data: {
          publicId: randomUUID(),
          campaignId: leadData.campaignId,
          leadId: leadData.id,
          direction: 'INBOUND',
          status: 'RECEIVED',
          body: (payload.body as string) || '',
          externalMessageId: payload.externalMessageId || null,
        },
      });

      console.log('[STAGE] INBOUND_MESSAGE_CREATE_OK', {
        messagePublicId: message.publicId,
      });
    } catch (error: any) {
      console.error('[STAGE] INBOUND_MESSAGE_CREATE_FAILED');
      console.error('[STAGE_ERROR]', {
        errorName: String(error?.name ?? ''),
        errorCode: String(error?.code ?? ''),
        errorMessage: String(error?.message ?? ''),
        leadPublicId: leadData.publicId,
        campaignId: String(leadData.campaignId),
      });
      throw error;
    }

    // Atualizar Lead
    const now = new Date();
    try {
      console.log('[STAGE] LEAD_RESPONDED_UPDATE_START');
      console.log('[STAGE_DATA]', { leadId: String(leadData.id) });

      await this.client.prospectingLead.update({
        where: { id: leadData.id },
        data: {
          lastInboundAt: now,
          respondedAt: leadData.respondedAt || now,
          status: 'RESPONDED',
        },
      });

      console.log('[STAGE] LEAD_RESPONDED_UPDATE_OK');
    } catch (error: any) {
      console.error('[STAGE] LEAD_RESPONDED_UPDATE_FAILED');
      console.error('[STAGE_ERROR]', {
        errorName: String(error?.name ?? ''),
        errorCode: String(error?.code ?? ''),
        errorMessage: String(error?.message ?? ''),
        leadPublicId: leadData.publicId,
      });
      throw error;
    }

    // Verificar pauseOnReply
    let campaign;
    try {
      console.log('[STAGE] CAMPAIGN_FETCH_START');
      console.log('[STAGE_DATA]', { campaignId: String(leadData.campaignId) });

      campaign = await this.client.prospectingCampaign.findUnique({
        where: { id: leadData.campaignId },
      });

      console.log('[STAGE] CAMPAIGN_FETCH_OK', {
        campaignPublicId: campaign?.publicId,
        pauseOnReply: campaign?.pauseOnReply,
      });
    } catch (error: any) {
      console.error('[STAGE] CAMPAIGN_FETCH_FAILED');
      console.error('[STAGE_ERROR]', {
        errorName: String(error?.name ?? ''),
        campaignId: String(leadData.campaignId),
      });
      throw error;
    }

    try {
      console.log('[STAGE] PAUSE_ON_REPLY_START', { pauseOnReply: campaign?.pauseOnReply });

      if (campaign?.pauseOnReply) {
        await this.client.prospectingLead.update({
          where: { id: leadData.id },
          data: { nextActionAt: null },
        });
      }

      console.log('[STAGE] PAUSE_ON_REPLY_OK');
    } catch (error: any) {
      console.error('[STAGE] PAUSE_ON_REPLY_FAILED');
      console.error('[STAGE_ERROR]', {
        errorName: String(error?.name ?? ''),
        leadPublicId: leadData.publicId,
      });
      throw error;
    }

    // Criar human lock (automático de resposta inbound)
    try {
      console.log('[STAGE] HUMAN_LOCK_START');

      const lockMinutes = 60;
      await this.client.prospectingLead.update({
        where: { id: leadData.id },
        data: {
          humanLockUntil: new Date(now.getTime() + lockMinutes * 60_000),
          humanLockReason: 'Resposta recebida do lead',
          humanLockType: 'INBOUND_REPLY',
        },
      });

      console.log('[STAGE] HUMAN_LOCK_OK');
    } catch (error: any) {
      console.error('[STAGE] HUMAN_LOCK_FAILED');
      console.error('[STAGE_ERROR]', {
        errorName: String(error?.name ?? ''),
        leadPublicId: leadData.publicId,
      });
      throw error;
    }

    // Verificar opt-out (tem prioridade sobre objection engine e flow engine)
    let isOptOut = false;
    try {
      console.log('[STAGE] OPT_OUT_CHECK_START');
      console.log('[STAGE_DATA]', { body: (payload.body as string).slice(0, 50) });

      isOptOut = this.detectOptOut(payload.body as string);

      console.log('[STAGE] OPT_OUT_CHECK_OK', { isOptOut });
    } catch (error: any) {
      console.error('[STAGE] OPT_OUT_CHECK_FAILED');
      console.error('[STAGE_ERROR]', {
        errorName: String(error?.name ?? ''),
        errorMessage: String(error?.message ?? ''),
      });
      throw error;
    }

    if (isOptOut) {
      await this.handleOptOut(leadData.id, leadData.campaignId, normalizedPhone);
      return {
        handled: true,
        leadPublicId: leadData.publicId,
        campaignPublicId: campaign?.publicId || '',
      };
    }

    // Log de sucesso até aqui
    console.log('[ProspectingInboundTrace]', {
      eventType: payload.eventType,
      fromMe: payload.fromMe,
      normalizedPhone,
      leadPublicId: leadData.publicId,
      campaignPublicId: campaign?.publicId,
      flowId: campaign?.flowId != null ? String(campaign.flowId) : null,
      campaignStatus: campaign?.status,
      result: 'LEAD_FOUND_PROCEEDING'
    });

    // Flow Engine (se feature flag ativa e campaign possui flow)
    const flowEnabled = this.environment?.PROSPECTING_FLOW_ENABLED === true;
    if (flowEnabled && campaign?.flowId) {
      const execution = await this.client.prospectingFlowExecution.findUnique({
        where: {
          campaignId_leadId_flowId: {
            campaignId: campaign.id,
            leadId: leadData.id,
            flowId: campaign.flowId,
          },
        },
        include: {
          currentStep: {
            include: {
              options: {
                include: {
                  patterns: true,
                },
              },
            },
          },
        },
      });

      if (execution && execution.status === 'WAITING') {
        const flowEngine = new ProspectingFlowEngine(this.client);

        // OPÇÃO 2: Tentar resolver por index primeiro (MESSAGE_ACTION)
        let selectedOptionPublicId: string | undefined;
        if (payload.eventType === 'MESSAGE_ACTION' && payload.referencedMessageId && payload.selectedIndex !== null && payload.selectedIndex !== undefined) {
          const indexResolution = await this.findMatchingOptionByIndex(
            payload.referencedMessageId,
            payload.selectedIndex,
            execution
          );
          if (indexResolution.optionPublicId) {
            selectedOptionPublicId = indexResolution.optionPublicId;
            console.log('[IndexResolution] Resolved via index', {
              optionPublicId: selectedOptionPublicId,
              selectedIndex: payload.selectedIndex,
            });
          }
        }

        const flowResult = await flowEngine.processStepResponse({
          execution,
          step: execution.currentStep,
          inboundMessage: message,
          selectedOptionPublicId,
        });

        // Recarregar execution para obter status final
        const updatedExecution = await this.client.prospectingFlowExecution.findUnique({
          where: { id: execution.id },
        });

        // Gerenciar humanLock baseado em status final
        if (flowResult.executionAdvanced && updatedExecution) {
          if (updatedExecution.status === 'ACTIVE') {
            // Limpar INBOUND_REPLY para permitir próximo outbound
            await this.client.prospectingLead.update({
              where: { id: leadData.id },
              data: {
                humanLockUntil: null,
                humanLockType: null,
                humanLockReason: null,
              },
            });
          } else if (updatedExecution.status === 'COMPLETED') {
            // Completado: limpar lock e nextActionAt
            await this.client.prospectingLead.update({
              where: { id: leadData.id },
              data: {
                humanLockUntil: null,
                humanLockType: null,
                humanLockReason: null,
                nextActionAt: null,
              },
            });
          }
          // Se MANUAL: NÃO limpar FLOW_MANUAL lock
        }

        return {
          handled: true,
          leadPublicId: leadData.publicId,
          campaignPublicId: campaign?.publicId || '',
        };
      }
    }

    // Classificar via Objection Engine (async, não bloqueia resposta de webhook)
    // Somente se sem flow
    if (!flowEnabled || !campaign?.flowId) {
      try {
        const engine = new ProspectingObjectionEngine(this.client);
        await engine.classify({
          campaignId: leadData.campaignId,
          leadId: leadData.id,
          messageId: message.id,
          inboundMessageId: message.id,
          text: payload.body as string,
        });
      } catch (error) {
        // Log but don't fail webhook
        console.error('[ProspectingInbound] Classification error:', error);
      }
    }

    return {
      handled: true,
      leadPublicId: leadData.publicId,
      campaignPublicId: campaign?.publicId || '',
    };
  }

  /**
   * Resolver opção por índice usando snapshot do outbound.
   * Implementa padrão TENANT: index-based resolution.
   */
  private async findMatchingOptionByIndex(
    referencedMessageId: string,
    selectedIndex: number | null | undefined,
    execution: any
  ): Promise<{ optionPublicId: string | null; reason: string }> {
    // Validações básicas
    if (!referencedMessageId) {
      return { optionPublicId: null, reason: 'NO_REFERENCED_MESSAGE' };
    }

    if (selectedIndex === null || selectedIndex === undefined || !Number.isInteger(selectedIndex) || selectedIndex < 0) {
      return { optionPublicId: null, reason: 'INVALID_SELECTED_INDEX' };
    }

    if (!this.client) {
      return { optionPublicId: null, reason: 'SERVICE_NOT_CONFIGURED' };
    }

    // Encontrar outbound message com ID da mensagem original
    let outbound;
    try {
      outbound = await this.client!.prospectingMessage.findFirst({
        where: {
          externalMessageId: referencedMessageId,
          direction: 'OUTBOUND',
          campaignId: execution.campaignId,
          status: 'SENT',
        },
      });
    } catch (error) {
      console.error('[findMatchingOptionByIndex] Error fetching outbound:', error);
      return { optionPublicId: null, reason: 'OUTBOUND_FETCH_ERROR' };
    }

    if (!outbound) {
      return { optionPublicId: null, reason: 'OUTBOUND_NOT_FOUND' };
    }

    // Validar que optionIds está presente
    if (!outbound.optionIds || !Array.isArray(outbound.optionIds)) {
      return { optionPublicId: null, reason: 'OUTBOUND_NO_OPTION_IDS' };
    }

    // Validar índice está dentro dos limites
    if (selectedIndex >= outbound.optionIds.length) {
      return { optionPublicId: null, reason: 'SELECTED_INDEX_OUT_OF_BOUNDS' };
    }

    const optionPublicId = outbound.optionIds[selectedIndex];
    if (typeof optionPublicId !== 'string') {
      return { optionPublicId: null, reason: 'OPTION_ID_INVALID_TYPE' };
    }

    // Encontrar option pelo publicId
    let option;
    try {
      option = await this.client!.prospectingFlowOption.findUnique({
        where: { publicId: optionPublicId },
      });
    } catch (error) {
      console.error('[findMatchingOptionByIndex] Error fetching option:', error);
      return { optionPublicId: null, reason: 'OPTION_FETCH_ERROR' };
    }

    if (!option) {
      return { optionPublicId: null, reason: 'OPTION_NOT_FOUND' };
    }

    // CRÍTICO: Validar que opção pertence ao step ATUAL
    // Impede executar opção antiga se fluxo avançou
    if (option.stepId !== execution.currentStepId) {
      console.warn('[findMatchingOptionByIndex] Stale option response', {
        optionStepId: String(option.stepId),
        currentStepId: String(execution.currentStepId),
      });
      return { optionPublicId: null, reason: 'STALE_OPTION_RESPONSE' };
    }

    console.log('[findMatchingOptionByIndex] Success', {
      optionPublicId,
      selectedIndex,
      outboundId: String(outbound.id),
    });

    return { optionPublicId, reason: 'SUCCESS' };
  }

  /**
   * Atualizar status de mensagem outbound baseado em eventos de delivery.
   */
  public async updateOutboundDeliveryStatus(
    externalMessageId: string,
    eventType: 'delivered' | 'read' | 'failed',
    errorMessage?: string,
  ): Promise<ProspectingInboundResult> {
    if (!this.client) {
      return { handled: false, reason: 'SERVICE_NOT_CONFIGURED' };
    }

    const message = await this.client.prospectingMessage.findFirst({
      where: {
        externalMessageId,
        direction: 'OUTBOUND',
      },
    });

    if (!message) {
      return { handled: false, reason: 'MESSAGE_NOT_FOUND' };
    }

    // Não regedir status: READ é final
    const currentRank = this.statusRank((message.status as string) || '');
    const newRank = this.statusRank(eventType === 'delivered' ? 'DELIVERED' : eventType === 'read' ? 'READ' : 'FAILED');

    if (newRank < currentRank) {
      return { handled: true, reason: 'STATUS_NOT_REGRESSED' };
    }

    const data: any = {};
    if (eventType === 'delivered') {
      data.status = 'DELIVERED';
      data.deliveredAt = new Date();
    } else if (eventType === 'read') {
      data.status = 'READ';
      data.readAt = new Date();
    } else if (eventType === 'failed') {
      data.status = 'FAILED';
      data.failedAt = new Date();
      if (errorMessage) {
        data.errorMessage = errorMessage;
      }
    }

    await this.client.prospectingMessage.update({
      where: { id: message.id },
      data,
    });

    return { handled: true };
  }

  /**
   * Encontra Lead elegível por referencedMessageId (mensagem outbound original).
   * Usado para desambiguar quando há múltiplos WAITING_REPLY para o mesmo telefone.
   */
  private async findEligibleLeadByReferencedMessage(
    referencedMessageId: string,
    normalizedPhone: string,
  ): Promise<{ id: bigint; campaignId: bigint; respondedAt: Date | null; publicId: string } | null> {
    if (!this.client) {
      return null;
    }

    // Buscar mensagem outbound original pelo ID
    const outboundMessage = await this.client.prospectingMessage.findFirst({
      where: {
        externalMessageId: referencedMessageId,
        direction: 'OUTBOUND',
      },
      select: {
        id: true,
        leadId: true,
        campaignId: true,
      },
    });

    if (!outboundMessage) {
      console.log('[ProspectingInboundTrace]', {
        referencedMessageId,
        result: 'REFERENCED_MESSAGE_NOT_FOUND',
      });
      return null;
    }

    // Validar que o lead é elegível
    const maxDays = 30;
    const minLastOutboundAt = new Date(Date.now() - maxDays * 24 * 60 * 60 * 1000);

    const lead = await this.client.prospectingLead.findUnique({
      where: { id: outboundMessage.leadId },
      select: {
        id: true,
        campaignId: true,
        respondedAt: true,
        publicId: true,
        normalizedPhone: true,
        status: true,
        lastOutboundAt: true,
        campaign: {
          select: {
            status: true,
          },
        },
      },
    });

    // Validações de elegibilidade
    const isEligible =
      lead &&
      lead.normalizedPhone === normalizedPhone &&
      ['WAITING_REPLY', 'FOLLOW_UP', 'CONTACTED', 'SCHEDULED', 'PENDING'].includes(lead.status) &&
      lead.lastOutboundAt &&
      lead.lastOutboundAt >= minLastOutboundAt &&
      ['RUNNING', 'PAUSED'].includes(lead.campaign?.status || '');

    if (!isEligible) {
      console.log('[ProspectingInboundTrace]', {
        referencedMessageId,
        leadFound: !!lead,
        phoneMismatch: lead && lead.normalizedPhone !== normalizedPhone,
        statusInvalid: lead && !['WAITING_REPLY', 'FOLLOW_UP', 'CONTACTED', 'SCHEDULED', 'PENDING'].includes(lead.status),
        stale: lead && lead.lastOutboundAt && lead.lastOutboundAt < minLastOutboundAt,
        campaignInvalid: lead && !['RUNNING', 'PAUSED'].includes(lead.campaign?.status || ''),
        result: 'REFERENCED_LEAD_NOT_ELIGIBLE',
      });
      return null;
    }

    console.log('[ProspectingInboundTrace]', {
      referencedMessageId,
      leadPublicId: lead.publicId,
      result: 'FOUND_BY_REFERENCED_MESSAGE',
    });

    return {
      id: lead.id,
      campaignId: lead.campaignId,
      respondedAt: lead.respondedAt,
      publicId: lead.publicId,
    };
  }

  /**
   * Encontra Lead elegível por normalizedPhone.
   */
  private async findEligibleLead(
    normalizedPhone: string,
  ): Promise<{ id: bigint; campaignId: bigint; respondedAt: Date | null; publicId: string } | null> {
    if (!this.client) {
      return null;
    }

    const maxDays = 30;
    const minLastOutboundAt = new Date(Date.now() - maxDays * 24 * 60 * 60 * 1000);

    const leads = await this.client.prospectingLead.findMany({
      where: {
        normalizedPhone,
        status: {
          in: ['WAITING_REPLY', 'FOLLOW_UP', 'CONTACTED', 'SCHEDULED', 'PENDING'],
        },
        lastOutboundAt: {
          gte: minLastOutboundAt,
        },
        campaign: {
          status: {
            in: ['RUNNING', 'PAUSED'],
          },
        },
      },
      select: {
        id: true,
        campaignId: true,
        respondedAt: true,
        publicId: true,
        status: true,
      },
    });

    if (leads.length === 0) {
      return null;
    }

    // Priorizar WAITING_REPLY
    const waitingReply = leads.filter((l) => l.status === 'WAITING_REPLY');
    if (waitingReply.length === 1) {
      const lead = waitingReply[0]!;
      return {
        id: lead.id,
        campaignId: lead.campaignId,
        respondedAt: lead.respondedAt,
        publicId: lead.publicId,
      };
    }

    if (waitingReply.length > 1) {
      console.warn(`[ProspectingInbound] Ambiguous WAITING_REPLY leads for phone ${normalizedPhone}`);
      return null;
    }

    // Se apenas 1 lead, usar
    if (leads.length === 1) {
      const lead = leads[0]!;
      return {
        id: lead.id,
        campaignId: lead.campaignId,
        respondedAt: lead.respondedAt,
        publicId: lead.publicId,
      };
    }

    console.warn(`[ProspectingInbound] Ambiguous leads for phone ${normalizedPhone}`);
    return null;
  }

  /**
   * Detecta opt-out em mensagem normalizada.
   */
  private detectOptOut(body: string): boolean {
    const normalized = this.normalizeInboundText(body);
    const optOutPatterns = [
      'sair',
      'parar',
      'stop',
      'cancelar',
      'nao quero',
      'não quero',
      'remover',
      'descadastrar',
    ];

    for (const pattern of optOutPatterns) {
      if (normalized.includes(pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Normalizar texto para comparação de opt-out.
   */
  private normalizeInboundText(text: string): string {
    return text
      .trim()
      .toLowerCase()
      .replace(/[àáâãäå]/g, 'a')
      .replace(/[èéêë]/g, 'e')
      .replace(/[ìíîï]/g, 'i')
      .replace(/[òóôõö]/g, 'o')
      .replace(/[ùúûü]/g, 'u')
      .replace(/[ç]/g, 'c')
      .replace(/\s+/g, ' ');
  }

  /**
   * Processar opt-out: criar suppression, marcar lead como SUPPRESSED.
   */
  private async handleOptOut(leadId: bigint, campaignId: bigint, normalizedPhone: string): Promise<void> {
    if (!this.client) {
      return;
    }

    const now = new Date();

    try {
      await this.client.prospectingSuppression.create({
        data: {
          publicId: randomUUID(),
          campaignId,
          normalizedPhone,
          reason: 'OPT_OUT',
          createdAt: now,
        },
      });
    } catch {
      // Suppression já existe
    }

    await this.client.prospectingLead.update({
      where: { id: leadId },
      data: {
        status: 'SUPPRESSED',
        suppressedAt: now,
        suppressionReason: 'OPT_OUT',
        nextActionAt: null,
      },
    });
  }

  /**
   * Ranking de status para evitar regressão.
   */
  private statusRank(status: string): number {
    const ranks: Record<string, number> = {
      SENDING: 1,
      SENT: 2,
      DELIVERED: 3,
      READ: 4,
      FAILED: 0,
    };
    return ranks[status] ?? 0;
  }
}
