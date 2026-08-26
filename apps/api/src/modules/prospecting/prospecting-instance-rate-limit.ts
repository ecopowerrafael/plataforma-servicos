import { type PrismaClient } from '../../database-client/client.js';

/**
 * Gerencia o rate-limit global da instância WhatsApp.
 */
export class ProspectingInstanceRateLimit {
  public constructor(private readonly client: PrismaClient) {}

  /**
   * Tentar fazer claim do send-slot global da instância.
   * Retorna true se conseguiu (affectedRows=1).
   */
  public async claimSendSlot(
    instanceId: string,
    reservedUntil: Date,
    now: Date,
  ): Promise<boolean> {
    if (!instanceId) {
      return false;
    }

    const result = await this.client.prospectingWhatsAppConfig.updateMany({
      where: {
        instanceId,
        isActive: true,
        OR: [
          { nextSendAt: null },
          { nextSendAt: { lte: now } },
        ],
      },
      data: {
        nextSendAt: reservedUntil,
      },
    });

    return result.count === 1;
  }

  /**
   * Liberar o send-slot (para usar em DRY_RUN ou cancelamento).
   */
  public async releaseSendSlot(instanceId: string): Promise<void> {
    if (!instanceId) {
      return;
    }

    await this.client.prospectingWhatsAppConfig.updateMany({
      where: {
        instanceId,
        isActive: true,
      },
      data: {
        nextSendAt: null,
      },
    });
  }

  /**
   * Obter configuração de instância.
   */
  public async getConfig(instanceId: string) {
    return this.client.prospectingWhatsAppConfig.findUnique({
      where: { instanceId },
      select: {
        id: true,
        nextSendAt: true,
        isActive: true,
      },
    });
  }
}
