import { type PrismaClient } from '../../database-client/client.js';
import { randomUUID } from 'node:crypto';
import { type Environment } from '../../config/environment.js';

interface ScheduleAutoReplyInput {
  campaignId: bigint;
  leadId: bigint;
  inboundMessageId: bigint;
  objectionId: bigint;
  suggestedResponse: string;
  purpose?: 'AUTO_REPLY' | 'REALTIME_REPLY';
  action?: string;
}

interface ScheduleAutoReplyResult {
  scheduled: boolean;
  reason?: string;
  messageId?: bigint;
}

/**
 * Agenda respostas automáticas determinísticas.
 */
export class ProspectingAutoReplyScheduler {
  private minDelaySeconds: number;
  private maxDelaySeconds: number;

  public constructor(
    private readonly client?: PrismaClient | null,
    minDelay?: number,
    maxDelay?: number,
    private readonly environment?: Environment | null,
  ) {
    this.minDelaySeconds = minDelay ?? 10;
    this.maxDelaySeconds = maxDelay ?? 30;
  }

  /**
   * Agenda auto-reply se todas as condições forem satisfeitas.
   */
  public async scheduleAutoReply(input: ScheduleAutoReplyInput): Promise<ScheduleAutoReplyResult> {
    if (!this.client) {
      return { scheduled: false, reason: 'SERVICE_NOT_CONFIGURED' };
    }

    const dryRun = this.environment?.PROSPECTING_DRY_RUN ?? process.env.PROSPECTING_DRY_RUN === 'true';
    const workerDisabled = this.environment
      ? this.environment.PROSPECTING_WORKER_ENABLED !== true
      : process.env.PROSPECTING_WORKER_ENABLED === 'false';

    if (dryRun) {
      return { scheduled: false, reason: 'DRY_RUN' };
    }
    if (workerDisabled) {
      return { scheduled: false, reason: 'WORKER_DISABLED' };
    }

    // Validar campaign.autoReplyEnabled
    const campaign = await this.client.prospectingCampaign.findUnique({
      where: { id: input.campaignId },
      select: {
        autoReplyEnabled: true,
        status: true,
      },
    });

    if (!campaign?.autoReplyEnabled) {
      return { scheduled: false, reason: 'AUTO_REPLY_DISABLED' };
    }

    if (campaign.status !== 'RUNNING') {
      return { scheduled: false, reason: 'CAMPAIGN_NOT_RUNNING' };
    }

    // Validar objection.autoReplyAllowed + suggestedResponse
    const objection = await this.client.prospectingObjection.findUnique({
      where: { id: input.objectionId },
      select: {
        autoReplyAllowed: true,
        isActive: true,
      },
    });

    if (!objection?.autoReplyAllowed || !objection.isActive) {
      return { scheduled: false, reason: 'OBJECTION_NOT_ALLOWED' };
    }

    if (!input.suggestedResponse || input.suggestedResponse.trim() === '') {
      return { scheduled: false, reason: 'NO_RESPONSE_TEXT' };
    }

    // Validar Lead status
    const lead = await this.client.prospectingLead.findUnique({
      where: { id: input.leadId },
      select: {
        status: true,
      },
    });

    if (!lead) {
      return { scheduled: false, reason: 'LEAD_NOT_FOUND' };
    }

    // O status comercial não bloqueia o atendente permanente.
    const blockingStatuses = ['SUPPRESSED', 'MANUAL'];
    if (blockingStatuses.includes(lead.status)) {
      return { scheduled: false, reason: 'LEAD_BLOCKED' };
    }

    // Verificar se já existe auto-reply para este inbound
    const purpose = input.purpose ?? 'AUTO_REPLY';
    const idempotencyKey = purpose === 'REALTIME_REPLY'
      ? `realtime:${input.inboundMessageId.toString()}:${input.action ?? 'OBJECTION'}`
      : undefined;
    const existingAutoReply = await this.client.prospectingMessage.findFirst({
      where: {
        leadId: input.leadId,
        objectionId: input.objectionId,
        purpose,
        replyToMessageId: input.inboundMessageId,
      },
    });

    if (existingAutoReply) {
      return { scheduled: false, reason: 'ALREADY_SCHEDULED' };
    }

    // Calcular delay aleatório
    const delaySeconds = Math.floor(
      Math.random() * (this.maxDelaySeconds - this.minDelaySeconds + 1) + this.minDelaySeconds,
    );
    const scheduledAt = new Date(Date.now() + delaySeconds * 1000);

    // Criar mensagem pendente; respostas de objeção podem ser entregues em realtime.
    const message = await this.client.prospectingMessage.create({
      data: {
        publicId: randomUUID(),
        campaignId: input.campaignId,
        leadId: input.leadId,
        direction: 'OUTBOUND',
        purpose,
        status: 'PENDING',
        body: input.suggestedResponse,
        objectionId: input.objectionId,
        scheduledAt,
        nextAttemptAt: scheduledAt,
        replyToMessageId: input.inboundMessageId,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      },
    });

    return {
      scheduled: true,
      messageId: message.id,
    };
  }

  /**
   * Renderizar placeholders simples na response.
   */
  public renderResponse(text: string, lead: { nameSnapshot?: string; [key: string]: any }): string {
    let rendered = text;

    // {{nome}}
    if (lead.nameSnapshot) {
      rendered = rendered.replace(/\{\{nome\}\}/gi, lead.nameSnapshot);
    }

    // Outros placeholders podem ser adicionados aqui

    return rendered;
  }
}
