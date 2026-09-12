import { type PrismaClient } from '../../database-client/client.js';
import { ProspectingAutoReplyRepository } from './prospecting-auto-reply.repository.js';

interface ValidateAutoReplyResult {
  valid: boolean;
  cancelReason?: string;
}

interface ProcessAutoReplyInput {
  messageId: bigint;
  campaignId: bigint;
  leadId: bigint;
  objectionId: bigint;
  body: string;
  maxSendAttempts: number;
  maxAutoRepliesPerDay: number;
  maxAutoRepliesPerLead: number;
  autoReplyCooldownSeconds: number;
  dryRun: boolean;
  startOfDay: Date;
  now: Date;
}

/**
 * Processa validação e decisões de auto-reply.
 */
export class ProspectingAutoReplyProcessor {
  private readonly repo: ProspectingAutoReplyRepository;

  public constructor(private readonly client: PrismaClient) {
    this.repo = new ProspectingAutoReplyRepository(client);
  }

  /**
   * Validar se auto-reply pode ser enviada.
   */
  public async validateAutoReply(
    input: Omit<ProcessAutoReplyInput, 'body'>,
  ): Promise<ValidateAutoReplyResult> {
    // Campaign deve estar RUNNING
    const campaign = await this.client.prospectingCampaign.findUnique({
      where: { id: input.campaignId },
      select: {
        status: true,
        autoReplyEnabled: true,
      },
    });

    if (!campaign) {
      return { valid: false, cancelReason: 'CAMPAIGN_NOT_FOUND' };
    }

    if (campaign.status !== 'RUNNING') {
      const reason =
        campaign.status === 'PAUSED'
          ? 'CAMPAIGN_PAUSED'
          : campaign.status === 'COMPLETED'
            ? 'CAMPAIGN_COMPLETED'
            : 'CAMPAIGN_CANCELED';
      return { valid: false, cancelReason: reason };
    }

    if (!campaign.autoReplyEnabled) {
      return { valid: false, cancelReason: 'AUTO_REPLY_DISABLED' };
    }

    // Lead não deve estar em status final
    const lead = await this.client.prospectingLead.findUnique({
      where: { id: input.leadId },
      select: {
        status: true,
        humanLockType: true,
      },
    });

    if (!lead) {
      return { valid: false, cancelReason: 'LEAD_NOT_FOUND' };
    }

    const blockingLeadStatuses = ['SUPPRESSED', 'NEEDS_REVIEW', 'LOST', 'WON'];
    if (blockingLeadStatuses.includes(lead.status)) {
      return { valid: false, cancelReason: lead.status };
    }

    // MANUAL lock bloqueia automação
    if (lead.humanLockType === 'MANUAL') {
      return { valid: false, cancelReason: 'HUMAN_TAKEOVER' };
    }
    // INBOUND_REPLY lock (automático) não bloqueia auto-reply da mesma conversa

    // Objection deve estar ativa e com permissão
    const objection = await this.client.prospectingObjection.findUnique({
      where: { id: input.objectionId },
      select: {
        isActive: true,
        autoReplyAllowed: true,
      },
    });

    if (!objection || !objection.isActive) {
      return { valid: false, cancelReason: 'OBJECTION_DISABLED' };
    }

    if (!objection.autoReplyAllowed) {
      return { valid: false, cancelReason: 'OBJECTION_AUTO_REPLY_DISABLED' };
    }

    // Verificar limite diário
    const dailyCount = await this.repo.countAutoRepliesPerDay(input.startOfDay);
    if (dailyCount >= input.maxAutoRepliesPerDay) {
      return { valid: false, cancelReason: 'AUTO_REPLY_DAILY_LIMIT' };
    }

    // Verificar limite por lead
    const leadCount = await this.repo.countAutoRepliesPerLead(input.leadId);
    if (leadCount >= input.maxAutoRepliesPerLead) {
      return { valid: false, cancelReason: 'AUTO_REPLY_LEAD_LIMIT' };
    }

    // Verificar cooldown
    const lastAutoReply = await this.repo.findLastAutoReplyToLead(input.leadId);
    if (lastAutoReply?.sentAt) {
      const cooldownExpiration = new Date(
        lastAutoReply.sentAt.getTime() + input.autoReplyCooldownSeconds * 1000,
      );
      if (input.now < cooldownExpiration) {
        return { valid: false, cancelReason: 'COOLDOWN' };
      }
    }

    return { valid: true };
  }

  /**
   * Reagendar com cooldown se necessário.
   */
  public async rescheduleForCooldown(
    messageId: bigint,
    cooldownSeconds: number,
    now: Date,
  ) {
    const nextAttempt = new Date(now.getTime() + cooldownSeconds * 1000);
    await this.repo.scheduleRetry(messageId, nextAttempt, 1); // attemptNumber reset/maintained
  }

  /**
   * Processar sucesso de envio.
   */
  public async handleSuccess(messageId: bigint, externalMessageId?: string) {
    await this.repo.updateDeliveryStatus(messageId, 'SENT', externalMessageId);
  }

  /**
   * Processar falha retryable.
   */
  public async handleRetryable(
    messageId: bigint,
    attemptNumber: number,
    maxAttempts: number,
    backoffSeconds: number,
    now: Date,
  ) {
    if (attemptNumber >= maxAttempts) {
      // Max attempts atingido, marcar como FAILED
      await this.repo.cancelMessage(messageId, 'MAX_ATTEMPTS');
      return;
    }

    // Agendar retry
    const nextAttempt = new Date(now.getTime() + backoffSeconds * 1000);
    await this.repo.scheduleRetry(messageId, nextAttempt, attemptNumber + 1);
  }

  /**
   * Processar falha definitiva.
   */
  public async handleDefinitiveFailure(messageId: bigint, errorMessage: string) {
    await this.repo.cancelMessage(messageId, `SEND_FAILED: ${errorMessage}`);
  }

  /**
   * Processar stale SENDING.
   */
  public async handleStaleSending(messageId: bigint) {
    await this.repo.markDeliveryUncertain(messageId);
  }
}
