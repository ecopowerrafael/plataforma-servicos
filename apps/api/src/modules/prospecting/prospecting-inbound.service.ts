import { type PrismaClient } from '../../database-client/client.js';
import { type ProspectingWhatsAppConfigService } from './prospecting-whatsapp-config.service.js';
import { normalizeWhatsAppPhone } from '../integrations/whatsapp-phone.js';
import { ProspectingObjectionEngine } from './prospecting-objection-engine.js';

interface ProspectingInboundPayload {
  instanceId: string | null;
  externalMessageId: string | null;
  fromPhone: string | null;
  body: string | null | undefined;
  fromMe?: boolean;
  timestamp: Date | null | undefined;
  eventType: string | null;
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
  ) {}

  /**
   * Processa inbound recebido do webhook global.
   */
  public async processInbound(payload: ProspectingInboundPayload): Promise<ProspectingInboundResult> {
    if (!this.client || !this.configService) {
      return { handled: false, reason: 'SERVICE_NOT_CONFIGURED' };
    }

    // Ignorar eventos que não são mensagens recebidas
    if (payload.fromMe === true) {
      return { handled: false, reason: 'FROM_ME' };
    }

    // Apenas 'message' é inbound recebido nesta etapa
    if (payload.eventType !== 'message') {
      return { handled: false, reason: 'NOT_MESSAGE_EVENT' };
    }

    // Corpo vazio ou sem texto
    if (!payload.body || (typeof payload.body === 'string' && payload.body.trim() === '')) {
      return { handled: false, reason: 'EMPTY_BODY' };
    }

    // Verificar se instanceId é da Prospecting
    const config = await this.configService.getConfig();
    if (!config || config.instanceId !== payload.instanceId) {
      return { handled: false, reason: 'INSTANCE_MISMATCH' };
    }

    // Normalizar telefone
    if (!payload.fromPhone) {
      return { handled: false, reason: 'INVALID_PHONE' };
    }

    const normalizedPhone = normalizeWhatsAppPhone(payload.fromPhone);
    if (!normalizedPhone) {
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
        return { handled: true, reason: 'DUPLICATE_MESSAGE' };
      }
    }

    // Encontrar Lead elegível
    const leadData = await this.findEligibleLead(normalizedPhone);
    if (!leadData) {
      return { handled: false, reason: 'LEAD_NOT_FOUND' };
    }

    // Criar mensagem INBOUND
    const message = await this.client.prospectingMessage.create({
      data: {
        publicId: require('node:crypto').randomUUID(),
        campaignId: leadData.campaignId,
        leadId: leadData.id,
        direction: 'INBOUND',
        status: 'RECEIVED',
        body: (payload.body as string) || '',
        externalMessageId: payload.externalMessageId || null,
      },
    });

    // Atualizar Lead
    const now = new Date();
    await this.client.prospectingLead.update({
      where: { id: leadData.id },
      data: {
        lastInboundAt: now,
        respondedAt: leadData.respondedAt || now,
        status: 'RESPONDED',
      },
    });

    // Verificar pauseOnReply
    const campaign = await this.client.prospectingCampaign.findUnique({
      where: { id: leadData.campaignId },
    });

    if (campaign?.pauseOnReply) {
      await this.client.prospectingLead.update({
        where: { id: leadData.id },
        data: { nextActionAt: null },
      });
    }

    // Criar human lock
    const lockMinutes = 60;
    await this.client.prospectingLead.update({
      where: { id: leadData.id },
      data: {
        humanLockUntil: new Date(now.getTime() + lockMinutes * 60_000),
        humanLockReason: 'Resposta recebida do lead',
      },
    });

    // Verificar opt-out (tem prioridade sobre objection engine)
    const isOptOut = this.detectOptOut(payload.body as string);
    if (isOptOut) {
      await this.handleOptOut(leadData.id, leadData.campaignId, normalizedPhone);
      return {
        handled: true,
        leadPublicId: leadData.publicId,
        campaignPublicId: campaign?.publicId || '',
      };
    }

    // Classificar via Objection Engine (async, não bloqueia resposta de webhook)
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

    return {
      handled: true,
      leadPublicId: leadData.publicId,
      campaignPublicId: campaign?.publicId || '',
    };
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
          publicId: require('node:crypto').randomUUID(),
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
