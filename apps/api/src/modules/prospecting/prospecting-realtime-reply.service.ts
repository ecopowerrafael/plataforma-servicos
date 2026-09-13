import { randomUUID } from 'node:crypto';
import { type PrismaClient } from '../../database-client/client.js';
import { type ProspectingMessageSender } from './prospecting-message-sender.js';

export interface RealtimeReplyInput {
  campaignId: bigint;
  leadId: bigint;
  inboundMessageId: bigint;
  phone: string;
  body: string;
  action: string;
}

export interface RealtimeReplyResult {
  queued: boolean;
  sent: boolean;
  retryScheduled: boolean;
  reason?: string;
  messageId?: bigint;
  externalMessageId?: string | null;
}

/** Persiste e tenta entregar respostas do atendente sem depender do polling comercial. */
export class ProspectingRealtimeReplyService {
  public constructor(
    private readonly client: PrismaClient,
    private readonly sender: ProspectingMessageSender,
  ) {}

  public async send(input: RealtimeReplyInput): Promise<RealtimeReplyResult> {
    const idempotencyKey = `realtime:${input.inboundMessageId.toString()}:${input.action}`;
    const existing = await this.client.prospectingMessage.findFirst({
      where: { idempotencyKey, purpose: 'REALTIME_REPLY' },
      select: { id: true, status: true, externalMessageId: true },
    });
    if (existing?.status === 'SENT' || existing?.status === 'DELIVERED' || existing?.status === 'READ') {
      return { queued: true, sent: true, retryScheduled: false, messageId: existing.id, externalMessageId: existing.externalMessageId };
    }

    const message = existing ?? await this.client.prospectingMessage.create({
      data: {
        publicId: randomUUID(), campaignId: input.campaignId, leadId: input.leadId,
        direction: 'OUTBOUND', purpose: 'REALTIME_REPLY', status: 'PENDING',
        body: input.body, idempotencyKey, scheduledAt: new Date(), nextAttemptAt: new Date(),
        replyToMessageId: input.inboundMessageId,
      },
      select: { id: true, status: true, externalMessageId: true },
    });

    const claim = await this.client.prospectingMessage.updateMany({
      where: { id: message.id, status: 'PENDING' },
      data: { status: 'SENDING', sendingStartedAt: new Date() },
    });
    if (claim.count !== 1) return { queued: true, sent: false, retryScheduled: true, messageId: message.id, reason: 'CLAIMED_BY_OTHER' };

    const result = await this.sender.sendText({ phone: input.phone, body: input.body });
    if (result.success) {
      await this.client.prospectingMessage.update({ where: { id: message.id }, data: { status: 'SENT', sentAt: new Date(), externalMessageId: result.externalMessageId } });
      return { queued: true, sent: true, retryScheduled: false, messageId: message.id, externalMessageId: result.externalMessageId };
    }

    const deliveryData: Record<string, unknown> = result.retryable
      ? { status: 'PENDING', nextAttemptAt: new Date(Date.now() + 60_000) }
      : { status: 'FAILED', failedAt: new Date() };
    if (result.errorCode) deliveryData.errorCode = result.errorCode;
    if (result.errorMessage) deliveryData.errorMessage = result.errorMessage;
    await this.client.prospectingMessage.update({
      where: { id: message.id },
      data: deliveryData,
    });
    const response: RealtimeReplyResult = { queued: true, sent: false, retryScheduled: !!result.retryable, messageId: message.id };
    if (result.errorCode) response.reason = result.errorCode;
    return response;
  }
}
