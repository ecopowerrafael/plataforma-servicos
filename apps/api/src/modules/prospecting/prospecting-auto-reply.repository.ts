import { type PrismaClient } from '../../database-client/client.js';

/**
 * Repositório para operações de auto-reply e validações.
 */
export class ProspectingAutoReplyRepository {
  public constructor(private readonly client: PrismaClient) {}

  /**
   * Buscar mensagens AUTO_REPLY pendentes.
   */
  public async findPendingAutoReplies(limit: number) {
    return this.client.prospectingMessage.findMany({
      where: {
        purpose: 'AUTO_REPLY',
        status: 'PENDING',
        scheduledAt: {
          lte: new Date(),
        },
      },
      include: {
        campaign: {
          select: {
            id: true,
            status: true,
            autoReplyEnabled: true,
          },
        },
        lead: {
          select: {
            id: true,
            status: true,
          },
        },
        objection: {
          select: {
            id: true,
            isActive: true,
            autoReplyAllowed: true,
          },
        },
      },
      orderBy: {
        scheduledAt: 'asc',
      },
      take: limit,
    });
  }

  /**
   * Contar auto-replies enviadas hoje.
   */
  public async countAutoRepliesPerDay(startOfDay: Date): Promise<number> {
    const result = await this.client.prospectingMessage.count({
      where: {
        purpose: 'AUTO_REPLY',
        direction: 'OUTBOUND',
        status: { in: ['SENT', 'DELIVERED', 'READ'] },
        sentAt: {
          gte: startOfDay,
        },
      },
    });
    return result;
  }

  /**
   * Contar auto-replies enviadas a um lead.
   */
  public async countAutoRepliesPerLead(leadId: bigint): Promise<number> {
    const result = await this.client.prospectingMessage.count({
      where: {
        leadId,
        purpose: 'AUTO_REPLY',
        direction: 'OUTBOUND',
        status: { in: ['SENT', 'DELIVERED', 'READ'] },
      },
    });
    return result;
  }

  /**
   * Buscar última auto-reply enviada ao lead.
   */
  public async findLastAutoReplyToLead(leadId: bigint) {
    return this.client.prospectingMessage.findFirst({
      where: {
        leadId,
        purpose: 'AUTO_REPLY',
        direction: 'OUTBOUND',
        status: { in: ['SENT', 'DELIVERED', 'READ'] },
      },
      orderBy: {
        sentAt: 'desc',
      },
      select: {
        sentAt: true,
      },
    });
  }

  /**
   * Cancelar mensagem com motivo.
   */
  public async cancelMessage(messageId: bigint, reason: string) {
    return this.client.prospectingMessage.update({
      where: { id: messageId },
      data: {
        status: 'CANCELED',
        cancelReason: reason,
      },
    });
  }

  /**
   * Atualizar para SENDING.
   */
  public async markSending(messageId: bigint) {
    return this.client.prospectingMessage.update({
      where: { id: messageId },
      data: {
        status: 'SENDING',
        sendingStartedAt: new Date(),
      },
    });
  }

  /**
   * Atualizar para SENT/DELIVERED/READ após provider.
   */
  public async updateDeliveryStatus(
    messageId: bigint,
    status: string,
    externalMessageId?: string,
  ) {
    const data: any = { status };
    if (externalMessageId) {
      data.externalMessageId = externalMessageId;
    }
    if (status === 'SENT') {
      data.sentAt = new Date();
    }
    return this.client.prospectingMessage.update({
      where: { id: messageId },
      data,
    });
  }

  /**
   * Agendar retry.
   */
  public async scheduleRetry(messageId: bigint, nextAttemptAt: Date, attemptNumber: number) {
    return this.client.prospectingMessage.update({
      where: { id: messageId },
      data: {
        status: 'PENDING',
        nextAttemptAt,
        attemptNumber,
      },
    });
  }

  /**
   * Marcar como DELIVERY_UNCERTAIN.
   */
  public async markDeliveryUncertain(messageId: bigint) {
    return this.client.prospectingMessage.update({
      where: { id: messageId },
      data: {
        status: 'DELIVERY_UNCERTAIN',
        errorCode: 'DELIVERY_STATUS_UNKNOWN',
      },
    });
  }
}
