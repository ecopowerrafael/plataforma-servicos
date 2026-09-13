import { randomUUID } from 'node:crypto';
import { type PrismaClient } from '../../database-client/client.js';
import { type Environment } from '../../config/environment.js';
import { type ProspectingWhatsAppConfigService } from './prospecting-whatsapp-config.service.js';
import { normalizeWhatsAppPhone } from '../integrations/whatsapp-phone.js';
import { ProspectingObjectionEngine } from './prospecting-objection-engine.js';
import { ProspectingFlowEngine } from './prospecting-flow-engine.service.js';
import { type ProspectingRealtimeReplyService } from './prospecting-realtime-reply.service.js';

interface ProspectingInboundPayload {
  instanceId: string | null;
  externalMessageId: string | null;
  fromPhone: string | null;
  body: string | null | undefined;
  messageType?: string | null;
  fromMe?: boolean;
  timestamp: Date | null | undefined;
  eventType: string | null;
  referencedMessageId?: string | null;
  selectedIndex?: number | null;
  senderName?: string | null;
  isGroup?: boolean;
}

interface ProspectingInboundResult {
  handled: boolean;
  reason?: string;
  router?: 'FLOW_BUTTON' | 'FLOW_TEXT' | 'OBJECTION' | 'UNMATCHED' | 'ATTENDANT_FALLBACK';
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
    private readonly realtimeReply?: ProspectingRealtimeReplyService | null,
  ) {}

  /**
   * Obtém configuração de instância Prospecting.
   */
  public async getConfig() {
    return this.configService?.getConfig?.();
  }

  private isLeadConversationallyEligible(
    status: string,
    _executions: Array<{ status: string; campaignId?: bigint }> = [],
  ): boolean {
    // O status comercial não controla a conversa. Somente supressão/takeover
    // explícitos impedem o atendente permanente.
    return !['SUPPRESSED', 'MANUAL'].includes(status);
  }

  /**
   * Processa inbound recebido do webhook global.
   */
  public async processInbound(payload: ProspectingInboundPayload): Promise<ProspectingInboundResult> {
    const trace = {
      eventType: payload.eventType,
      fromMe: payload.fromMe,
      hasBody: !!payload.body,
      instanceIdProvided: !!payload.instanceId,
    };

    if (payload.isGroup) return { handled: true, reason: 'GROUP_MESSAGE' };

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
    // 'message' é mantido como alias legado do webhook W-API.
    const isReceivedMessage = payload.eventType === 'MESSAGE_RECEIVED' || payload.eventType === 'message';
    if (!isReceivedMessage && payload.eventType !== 'MESSAGE_ACTION') {
      console.log('[ProspectingInboundTrace]', { ...trace, result: 'NOT_MESSAGE_EVENT' });
      return { handled: false, reason: 'NOT_MESSAGE_EVENT' };
    }

    // Para MESSAGE_RECEIVED: obrigatório body
    // Para MESSAGE_ACTION: usa selectedDisplayText que já foi normalizado para body
    const isMediaWithoutCaption = ['IMAGE', 'VIDEO', 'imageMessage', 'videoMessage'].includes(payload.messageType ?? '');
    if ((!payload.body || (typeof payload.body === 'string' && payload.body.trim() === '')) && !isMediaWithoutCaption) {
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
      console.log('[ProspectingInboundTrace]', { ...trace, result: 'INVALID_PHONE' });
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

    // Opt-out é a precedência máxima: não criar conversa nem encaminhar a
    // mensagem para FlowEngine, ObjectionEngine ou atendente automático.
    const inboundIsOptOut = !isMediaWithoutCaption && this.detectOptOut(payload.body as string);
    const opensAttendantMenu = !isMediaWithoutCaption && ['menu', 'ajuda', 'atendimento', 'comecar novamente'].includes(this.normalizeInboundText(payload.body as string));


    // Encontrar o contexto da conversa. O status comercial não é um filtro.
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
        desambiguationMethod = 'conversation_context';
      }
    }
    // O comando explícito reinicia a navegação do atendente, mas não ultrapassa
    // a precedência de uma referência determinística de botão.
    if (opensAttendantMenu && !payload.referencedMessageId) leadData = null;

    if (!leadData) {
      if (inboundIsOptOut) {
        console.log('[ProspectingInboundTrace]', { ...trace, router: 'OPT_OUT', result: 'OPT_OUT_PRECEDENCE' });
        return { handled: true, reason: 'OPT_OUT' };
      }
      if (config.attendantEnabled) {
        const now = new Date();
        const senderName = this.sanitizeSenderName(payload.senderName);
        const contact = await this.client.prospectingContact.upsert({
          where: { normalizedPhone },
          create: { publicId: randomUUID(), normalizedPhone, displayName: senderName, firstInboundAt: now, lastInboundAt: now },
          update: { lastInboundAt: now, ...(senderName ? { displayName: senderName } : {}) },
        });
        const startStep = config.attendantFlowId
          ? await this.client.prospectingFlowStep.findFirst({ where: { flowId: BigInt(config.attendantFlowId), isStart: true }, orderBy: { position: 'asc' }, select: { id: true, message: true, options: { orderBy: { position: 'asc' }, select: { publicId: true, label: true } } } })
          : null;
        const conversation = await this.client.prospectingConversation.findFirst({
          where: { contactId: contact.id, instanceId: payload.instanceId!, status: 'ACTIVE' },
          orderBy: { updatedAt: 'desc' },
        }) ?? await this.client.prospectingConversation.create({
          data: { publicId: randomUUID(), contactId: contact.id, instanceId: payload.instanceId!, status: 'ACTIVE', flowId: startStep ? BigInt(config.attendantFlowId!) : null, currentStepId: startStep?.id ?? null, context: { owner: 'PROSPECTING_ATTENDANT' } },
        });
        const inbound = await this.client.prospectingMessage.create({
          data: { publicId: randomUUID(), campaignId: null, leadId: null, conversationId: conversation.id, direction: 'INBOUND', status: 'RECEIVED', body: payload.body as string, externalMessageId: payload.externalMessageId ?? null },
        });
        const conversationContext = (conversation.context ?? {}) as Record<string, unknown>;
        if (!this.isWithinAttendantHours(config.businessHoursStart, config.businessHoursEnd)) {
          const outsideMessage = config.outsideHoursMessage;
          if (outsideMessage && this.realtimeReply) {
            const reply = await this.realtimeReply.send({ inboundMessageId: inbound.id, conversationId: conversation.id, phone: normalizedPhone, body: outsideMessage, action: 'OUTSIDE_HOURS' });
            console.log('[ProspectingRealtime]', { router: 'OUTSIDE_HOURS', replyQueued: reply.queued, replySent: reply.sent, retryScheduled: reply.retryScheduled });
          }
          return { handled: true, router: 'ATTENDANT_FALLBACK', reason: 'OUTSIDE_BUSINESS_HOURS' };
        }
        let flowReply: string | null = null;
        let attendantButtons: Array<{ publicId: string; label: string }> = [];
        let attendantMenu: string | null = typeof conversationContext.menu === 'string' ? conversationContext.menu : null;
        if (payload.eventType === 'MESSAGE_ACTION' && payload.referencedMessageId && payload.selectedIndex != null) {
          const previous = await this.client.prospectingMessage.findFirst({ where: { externalMessageId: payload.referencedMessageId, direction: 'OUTBOUND', conversationId: conversation.id }, select: { optionIds: true } });
          const ids = Array.isArray(previous?.optionIds) ? previous.optionIds : [];
          const selectedId = ids[payload.selectedIndex];
          const selectedOption = typeof selectedId === 'string' ? await this.client.prospectingFlowOption.findUnique({ where: { publicId: selectedId }, include: { patterns: true } }) : null;
          if (selectedOption && selectedOption.stepId === conversation.currentStepId) {
            const next = selectedOption.nextStepId ? await this.client.prospectingFlowStep.findUnique({ where: { id: selectedOption.nextStepId }, include: { options: { orderBy: { position: 'asc' }, select: { publicId: true, label: true } } } }) : null;
            await this.client.prospectingConversation.update({ where: { id: conversation.id }, data: { currentStepId: next?.id ?? null, lastInboundAt: now } });
            flowReply = selectedOption.actionType === 'MANUAL' ? (config.humanTransferMessage ?? next?.message ?? null) : next?.message ?? null;
            attendantButtons = next?.options ?? [];
            if (selectedOption.actionType === 'MANUAL') attendantMenu = 'MANUAL';
          }
        }
        if (opensAttendantMenu && startStep) {
          await this.client.prospectingConversation.update({ where: { id: conversation.id }, data: { currentStepId: startStep.id, flowId: BigInt(config.attendantFlowId!), lastInboundAt: now } });
          attendantMenu = null;
          flowReply = this.interpolateAttendantMessage(startStep.message, contact.displayName);
          attendantButtons = startStep.options;
        }
        if (!isMediaWithoutCaption && conversation.currentStepId && !opensAttendantMenu && !flowReply) {
          const step = await this.client.prospectingFlowStep.findUnique({ where: { id: conversation.currentStepId }, include: { options: { include: { patterns: true } } } });
          const text = this.normalizeInboundText(payload.body as string);
          const match = step?.options.flatMap((option: any) => option.patterns.map((pattern: any) => ({ option, pattern })))
            .sort((a: any, b: any) => (b.pattern.priority ?? 0) - (a.pattern.priority ?? 0))
            .find(({ pattern }: any) => pattern.patternType === 'EXACT' ? text === this.normalizeInboundText(pattern.pattern) : pattern.patternType === 'STARTS_WITH' ? text.startsWith(this.normalizeInboundText(pattern.pattern)) : pattern.patternType === 'ENDS_WITH' ? text.endsWith(this.normalizeInboundText(pattern.pattern)) : text.includes(this.normalizeInboundText(pattern.pattern)));
          if (match?.option) {
            const next = match.option.nextStepId ? await this.client.prospectingFlowStep.findUnique({ where: { id: match.option.nextStepId }, include: { options: { orderBy: { position: 'asc' }, select: { publicId: true, label: true } } } }) : null;
            await this.client.prospectingConversation.update({ where: { id: conversation.id }, data: { currentStepId: next?.id ?? null, flowId: conversation.flowId, lastInboundAt: now } });
            flowReply = match.option.actionType === 'MANUAL'
              ? (config.humanTransferMessage ?? next?.message ?? null)
              : next?.message ?? null;
            if (flowReply) flowReply = this.interpolateAttendantMessage(flowReply, contact.displayName);
            attendantButtons = next?.options ?? [];
            if (match.option.actionType === 'MANUAL') attendantMenu = 'MANUAL';
          }
        }
        const greeting = config.useContactName && contact.displayName
          ? this.interpolateAttendantMessage(`${config.greetingMessage ?? 'Olá'} ${contact.displayName}!`, contact.displayName)
          : this.interpolateAttendantMessage(config.greetingMessage ?? '', contact.displayName);
        const replyBody = flowReply
          ?? (isMediaWithoutCaption && config.mediaFallbackMessage
          ? config.mediaFallbackMessage
          : conversationContext.greetingSent ? (config.fallbackMessage ?? config.invalidMessage) : this.interpolateAttendantMessage(startStep?.message ?? greeting ?? '', contact.displayName));
        const replyAction = flowReply ? 'FLOW_TEXT' : conversationContext.greetingSent ? 'ATTENDANT_FALLBACK' : 'ATTENDANT_GREETING';
        const menuOptions = !isMediaWithoutCaption && (attendantButtons.length > 0 || (!conversationContext.greetingSent && !flowReply))
          ? ((attendantButtons.length ? attendantButtons : startStep?.options) ?? [])
          : [];
        const persistedContext = { ...conversationContext, greetingSent: true, ...(attendantMenu ? { menu: attendantMenu } : {}) };
        if (attendantMenu === 'MANUAL') {
          await this.client.prospectingConversation.update({ where: { id: conversation.id }, data: { status: 'MANUAL', context: { ...persistedContext, transferredToHuman: true } } });
        }
        if (replyBody && this.realtimeReply) {
          const reply = await this.realtimeReply.send({ inboundMessageId: inbound.id, conversationId: conversation.id, phone: normalizedPhone, body: replyBody, action: replyAction, ...(menuOptions.length ? { buttons: menuOptions.map((option: any) => ({ label: option.label })), optionIds: menuOptions.map((option: any) => option.publicId) } : {}) });
          await this.client.prospectingConversation.update({ where: { id: conversation.id }, data: { lastInboundAt: now, context: persistedContext } });
          console.log('[ProspectingRealtime]', { router: flowReply ? 'FLOW_TEXT' : 'PROSPECTING_ATTENDANT', replyQueued: reply.queued, replySent: reply.sent, retryScheduled: reply.retryScheduled });
          return reply.sent
            ? { handled: true, router: 'ATTENDANT_FALLBACK' as const }
            : { handled: true, router: 'ATTENDANT_FALLBACK' as const, reason: reply.reason ?? 'GREETING_SEND_FAILED' };
        }
        return { handled: true, router: 'ATTENDANT_FALLBACK', reason: 'GREETING_NOT_CONFIGURED' };
      }
      console.log('[ProspectingInboundTrace]', {
        ...trace,
        referencedMessageId: payload.referencedMessageId,
        desambiguationMethod,
        result: 'LEAD_NOT_FOUND'
      });
      return { handled: false, reason: 'LEAD_NOT_FOUND' };
    }

    // Log desambiguação
    console.log('[ProspectingInboundTrace]', {
      ...trace,
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
      isOptOut = inboundIsOptOut;

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
      leadPublicId: leadData.publicId,
      campaignPublicId: campaign?.publicId,
      flowId: campaign?.flowId != null ? String(campaign.flowId) : null,
      campaignStatus: campaign?.status,
      result: 'LEAD_FOUND_PROCEEDING'
    });

    // Após uma hora sem interação, a próxima mensagem inicia uma nova sessão
    // do Atendente Agendei. A regra só vale para conversas ativas e nunca
    // ultrapassa opt-out, SUPPRESSED ou takeover MANUAL já tratados acima.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const contact = await this.client.prospectingContact.findUnique({ where: { normalizedPhone } });
    const activeConversation = contact
      ? await this.client.prospectingConversation.findFirst({ where: { contactId: contact.id, instanceId: payload.instanceId!, status: 'ACTIVE' }, orderBy: { updatedAt: 'desc' } })
      : null;
    const lastInteraction = activeConversation
      ? [activeConversation.lastInboundAt, activeConversation.lastOutboundAt, activeConversation.updatedAt].filter((value): value is Date => value instanceof Date).sort((a, b) => b.getTime() - a.getTime())[0]
      : null;
    if (isReceivedMessage && config.attendantEnabled && config.attendantFlowId && (!lastInteraction || lastInteraction < oneHourAgo) && this.realtimeReply) {
      const attendantStart = await this.client.prospectingFlowStep.findFirst({
        where: { flowId: BigInt(config.attendantFlowId), isStart: true }, orderBy: { position: 'asc' },
        include: { options: { orderBy: { position: 'asc' }, select: { publicId: true, label: true } } },
      });
      if (attendantStart) {
        if (activeConversation) await this.client.prospectingConversation.update({ where: { id: activeConversation.id }, data: { flowId: attendantStart.flowId, currentStepId: attendantStart.id, context: { owner: 'PROSPECTING_ATTENDANT', resetReason: 'INACTIVE_OVER_ONE_HOUR' } } });
        const reply = await this.realtimeReply.send({ campaignId: leadData.campaignId, leadId: leadData.id, inboundMessageId: message.id, phone: normalizedPhone, body: attendantStart.message, action: 'ATTENDANT_GREETING', buttons: attendantStart.options.map((option) => ({ label: option.label })), optionIds: attendantStart.options.map((option) => option.publicId) });
        console.log('[ProspectingRealtime]', { router: 'ATTENDANT_GREETING', reason: 'INACTIVE_OVER_ONE_HOUR', replyQueued: reply.queued, replySent: reply.sent, retryScheduled: reply.retryScheduled });
        return { handled: true, router: 'ATTENDANT_FALLBACK', leadPublicId: leadData.publicId, campaignPublicId: campaign?.publicId || '' };
      }
    }

    // ROTEAMENTO: opt-out já foi tratado acima; fluxo aguardando tem precedência
    const flowEnabled = this.environment?.PROSPECTING_FLOW_ENABLED === true;
    const execution = flowEnabled && campaign?.flowId
      ? await this.client.prospectingFlowExecution.findUnique({
          where: { campaignId_leadId_flowId: { campaignId: campaign.id, leadId: leadData.id, flowId: campaign.flowId } },
          include: { currentStep: { include: { options: { include: { patterns: true } } } } },
        })
      : null;

    // A) MESSAGE_ACTION (BUTTON_REPLY) → FlowEngine
    if (payload.eventType === 'MESSAGE_ACTION') {
      if (execution?.status === 'WAITING') {
        const flowEngine = new ProspectingFlowEngine(this.client);

        // Resolver opção por index (OPÇÃO 2)
        let selectedOptionPublicId: string | undefined;
        if (payload.referencedMessageId && payload.selectedIndex !== null && payload.selectedIndex !== undefined) {
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
          include: { currentStep: { select: { message: true } } },
        });

        if (flowResult.executionAdvanced && updatedExecution?.currentStep?.message && this.realtimeReply) {
          const reply = await this.realtimeReply.send({
            campaignId: leadData.campaignId, leadId: leadData.id, inboundMessageId: message.id,
            phone: normalizedPhone, body: updatedExecution.currentStep.message, action: 'FLOW_BUTTON',
          });
          console.log('[ProspectingRealtime]', { router: 'FLOW_BUTTON', replyQueued: reply.queued, replySent: reply.sent, retryScheduled: reply.retryScheduled });
        }

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
          router: 'FLOW_BUTTON',
          leadPublicId: leadData.publicId,
          campaignPublicId: campaign?.publicId || '',
        };
      }
      // MESSAGE_ACTION sem execution WAITING não segue adiante (não cai em ObjectionEngine)
      return {
        handled: true,
        router: 'FLOW_BUTTON',
        leadPublicId: leadData.publicId,
        campaignPublicId: campaign?.publicId || '',
      };
    }

    // B) Texto: primeiro tenta a etapa atual do fluxo; só cai em objeção sem match.
    if (isReceivedMessage) {
      if (execution?.status === 'WAITING') {
        const flowEngine = new ProspectingFlowEngine(this.client);
        const flowResult = await flowEngine.processStepResponse({
          execution,
          step: execution.currentStep,
          inboundMessage: message,
        });
        if (flowResult.executionAdvanced && flowResult.newStepId && this.realtimeReply) {
          const nextStep = await this.client.prospectingFlowStep.findUnique({ where: { id: flowResult.newStepId }, select: { message: true } });
          if (nextStep?.message) {
            const reply = await this.realtimeReply.send({ campaignId: leadData.campaignId, leadId: leadData.id, inboundMessageId: message.id, phone: normalizedPhone, body: nextStep.message, action: 'FLOW_TEXT' });
            console.log('[ProspectingRealtime]', { router: 'FLOW_TEXT', replyQueued: reply.queued, replySent: reply.sent, retryScheduled: reply.retryScheduled });
          }
        }
        if (flowResult.executionAdvanced || flowResult.reason !== 'NO_OPTION_MATCH') {
          console.log('[ProspectingInboundTrace]', { ...trace, router: 'FLOW_TEXT', result: flowResult.reason ?? 'FLOW_ADVANCED' });
          return { handled: true, router: 'FLOW_TEXT', leadPublicId: leadData.publicId, campaignPublicId: campaign?.publicId || '' };
        }
      }
      // Leads de campanhas também podem iniciar/reabrir o atendente. Só usamos
      // esta entrada para mensagens explícitas de abertura; demais textos seguem
      // normalmente para a classificação de objeções.
      const normalizedOpening = this.normalizeInboundText(payload.body as string);
      if (config.attendantEnabled && config.attendantFlowId && ['oi', 'ola', 'menu', 'ajuda', 'atendimento'].includes(normalizedOpening) && this.realtimeReply) {
        const attendantStart = await this.client.prospectingFlowStep.findFirst({
          where: { flowId: BigInt(config.attendantFlowId), isStart: true },
          orderBy: { position: 'asc' },
          include: { options: { orderBy: { position: 'asc' }, select: { publicId: true, label: true } } },
        });
        if (attendantStart) {
          const reply = await this.realtimeReply.send({
            campaignId: leadData.campaignId, leadId: leadData.id, inboundMessageId: message.id,
            phone: normalizedPhone, body: this.interpolateAttendantMessage(attendantStart.message, this.sanitizeSenderName(payload.senderName)), action: 'ATTENDANT_GREETING',
            buttons: attendantStart.options.map((option) => ({ label: option.label })),
            optionIds: attendantStart.options.map((option) => option.publicId),
          });
          console.log('[ProspectingRealtime]', { router: 'ATTENDANT_GREETING', replyQueued: reply.queued, replySent: reply.sent, retryScheduled: reply.retryScheduled });
          return { handled: true, router: 'ATTENDANT_FALLBACK', leadPublicId: leadData.publicId, campaignPublicId: campaign?.publicId || '' };
        }
      }
      try {
        const result = await new ProspectingObjectionEngine(this.client, this.environment).classify({
          campaignId: leadData.campaignId,
          leadId: leadData.id,
          messageId: message.id,
          inboundMessageId: message.id,
          text: payload.body as string,
          autoReplyPurpose: 'REALTIME_REPLY',
          autoReplyAction: 'OBJECTION',
        });
        let replySent = false;
        let replyReason: string | undefined;
        if (result.matched && result.suggestedResponse && this.realtimeReply) {
          const reply = await this.realtimeReply.send({
            campaignId: leadData.campaignId,
            leadId: leadData.id,
            inboundMessageId: message.id,
            phone: normalizedPhone,
            body: result.suggestedResponse,
            action: 'OBJECTION',
          });
          replySent = reply.sent;
          replyReason = reply.reason;
          console.log('[ProspectingRealtime]', { router: 'OBJECTION', replyQueued: reply.queued, replySent: reply.sent, retryScheduled: reply.retryScheduled, reason: reply.reason });
        }
        console.log('[ProspectingInboundTrace]', { ...trace, router: result.matched ? 'OBJECTION' : 'UNMATCHED', matched: result.matched, objectionCode: result.objectionCode, autoReplyScheduled: result.autoReplyScheduled, replySent, reason: replyReason ?? result.autoReplyReason });
        if (!result.matched && config.fallbackMessage && this.realtimeReply) {
          const reply = await this.realtimeReply.send({
            campaignId: leadData.campaignId, leadId: leadData.id, inboundMessageId: message.id,
            phone: normalizedPhone, body: config.fallbackMessage, action: 'ATTENDANT_FALLBACK',
          });
          console.log('[ProspectingRealtime]', { router: 'ATTENDANT_FALLBACK', replyQueued: reply.queued, replySent: reply.sent, retryScheduled: reply.retryScheduled });
          return { handled: true, router: 'ATTENDANT_FALLBACK', leadPublicId: leadData.publicId, campaignPublicId: campaign?.publicId || '' };
        }
        return { handled: true, router: result.matched ? 'OBJECTION' : 'UNMATCHED', leadPublicId: leadData.publicId, campaignPublicId: campaign?.publicId || '' };
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

  private sanitizeSenderName(value: string | null | undefined): string | null {
    if (!value) return null;
    const sanitized = value.replace(/[\u0000-\u001F\u007F]/gu, '').replace(/\s+/gu, ' ').trim().slice(0, 180);
    return sanitized || null;
  }

  private interpolateAttendantMessage(message: string, displayName: string | null): string {
    const name = displayName?.trim() ?? '';
    return message.replace(/\{\{\s*nome\s*\}\}/giu, name);
  }

  private isWithinAttendantHours(start: number | undefined, end: number | undefined): boolean {
    if (start == null || end == null) return true;
    const timezone = this.environment?.PROSPECTING_TIMEZONE ?? 'America/Sao_Paulo';
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
    const current = hour * 60 + minute;
    return start <= end ? current >= start && current <= end : current >= start || current <= end;
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
    // Não filtrar por status: MESSAGE_READ pode acontecer antes do BUTTON_REPLY
    let outbound;
    try {
      outbound = await this.client!.prospectingMessage.findFirst({
        where: {
          externalMessageId: referencedMessageId,
          direction: 'OUTBOUND',
          campaignId: execution.campaignId,
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
    if (outboundMessage.leadId === null) return null;

    // Validar que o lead é elegível
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
      this.isLeadConversationallyEligible(lead.status) &&
      true;

    if (!isEligible) {
      console.log('[ProspectingInboundTrace]', {
        referencedMessageId,
        leadFound: !!lead,
        phoneMismatch: lead && lead.normalizedPhone !== normalizedPhone,
        statusInvalid: lead && !this.isLeadConversationallyEligible(lead.status),
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

    const leads = await this.client.prospectingLead.findMany({
      where: {
        normalizedPhone,
        status: { not: 'SUPPRESSED' },
      },
      orderBy: [{ lastInboundAt: 'desc' }, { lastOutboundAt: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        campaignId: true,
        respondedAt: true,
        publicId: true,
        status: true,
        flowExecutions: {
          where: { status: { in: ['WAITING', 'ACTIVE'] } },
          select: { id: true, campaignId: true, status: true },
        },
      },
    });

    if (leads.length === 0) {
      return null;
    }

    // Escolha determinística: contexto mais recente, sem “Ambiguous leads”.
    const eligibleLeads = leads.filter((l) => this.isLeadConversationallyEligible(l.status, l.flowExecutions));
    eligibleLeads.sort((a, b) => {
      const aWaiting = a.status === 'WAITING_REPLY' ? 1 : 0;
      const bWaiting = b.status === 'WAITING_REPLY' ? 1 : 0;
      return bWaiting - aWaiting || Number(b.id - a.id);
    });
    const lead = eligibleLeads[0];
    if (!lead) return null;
    console.log('[ProspectingInboundResolution]', {
      resolutionMethod: 'latest_context',
      candidateCount: eligibleLeads.length,
    });
    return { id: lead.id, campaignId: lead.campaignId, respondedAt: lead.respondedAt, publicId: lead.publicId };
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
