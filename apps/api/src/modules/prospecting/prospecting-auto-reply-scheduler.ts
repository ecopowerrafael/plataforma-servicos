import { type PrismaClient } from '../../database-client/client.js';
import { randomUUID } from 'node:crypto';

interface ScheduleAutoReplyInput {
  campaignId: bigint;
  leadId: bigint;
  inboundMessageId: bigint;
  objectionId: bigint;
  suggestedResponse: string;
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

    // Não responder a status finais
    const blockingStatuses = ['SUPPRESSED', 'NEEDS_REVIEW', 'WON', 'LOST'];
    if (blockingStatuses.includes(lead.status)) {
      return { scheduled: false, reason: 'LEAD_BLOCKED' };
    }

    // Verificar se já existe auto-reply para este inbound
    const existingAutoReply = await this.client.prospectingMessage.findFirst({
      where: {
        leadId: input.leadId,
        objectionId: input.objectionId,
        purpose: 'AUTO_REPLY',
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

    // Criar mensagem AUTO_REPLY PENDING
    const message = await this.client.prospectingMessage.create({
      data: {
        publicId: randomUUID(),
        campaignId: input.campaignId,
        leadId: input.leadId,
        direction: 'OUTBOUND',
        purpose: 'AUTO_REPLY',
        status: 'PENDING',
        body: input.suggestedResponse,
        objectionId: input.objectionId,
        scheduledAt,
        nextAttemptAt: scheduledAt,
        replyToMessageId: input.inboundMessageId,
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
