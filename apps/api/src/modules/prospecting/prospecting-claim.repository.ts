import { type PrismaClient } from '../../database-client/client.js';

/**
 * Repositório para operações atômicas de claim no ProspectingLead.
 * Usa UPDATE condicional para garantir que apenas um worker consegue processar.
 */
export class ProspectingClaimRepository {
  public constructor(private readonly client: PrismaClient) {}

  /**
   * Tenta fazer claim atômico de um lead.
   * Retorna o lead se conseguiu, null se já está processado por outro worker.
   */
  public async claimLead(
    leadId: bigint,
    workerId: string,
    lockTtlSeconds: number,
  ): Promise<{ claimed: boolean; lead?: any }> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + lockTtlSeconds * 1000);

    try {
      // Tentar atualizar apenas se nenhum outro worker está processando ou lock expirou
      const result = await this.client.prospectingLead.updateMany({
        where: {
          id: leadId,
          OR: [
            { processingWorkerId: null },
            { processingExpiresAt: { lt: now } },
          ],
        },
        data: {
          processingWorkerId: workerId,
          processingStartedAt: now,
          processingExpiresAt: expiresAt,
        },
      });

      if (result.count === 0) {
        return { claimed: false };
      }

      // Se conseguiu, buscar o lead para garantir que retornamos versão atualizada
      const lead = await this.client.prospectingLead.findUnique({
        where: { id: leadId },
        include: {
          campaign: true,
        },
      });

      return { claimed: true, lead };
    } catch {
      return { claimed: false };
    }
  }

  /**
   * Libera o lock de um lead.
   * Somente libera se o workerId coincidir (segurança).
   */
  public async releaseLead(leadId: bigint, workerId: string): Promise<boolean> {
    const result = await this.client.prospectingLead.updateMany({
      where: {
        id: leadId,
        processingWorkerId: workerId,
      },
      data: {
        processingWorkerId: null,
        processingStartedAt: null,
        processingExpiresAt: null,
      },
    });

    return result.count > 0;
  }

  /**
   * Verifica se um lead está bloqueado por outro worker.
   */
  public async isLockedByOtherWorker(
    leadId: bigint,
    workerId: string,
    now: Date = new Date(),
  ): Promise<boolean> {
    const lead = await this.client.prospectingLead.findUnique({
      where: { id: leadId },
      select: {
        processingWorkerId: true,
        processingExpiresAt: true,
      },
    });

    if (!lead) return false;

    // Se não tem lock, não está bloqueado
    if (!lead.processingWorkerId) return false;

    // Se é o mesmo worker, não está bloqueado
    if (lead.processingWorkerId === workerId) return false;

    // Se lock expirou, não está bloqueado
    if (lead.processingExpiresAt && lead.processingExpiresAt < now) return false;

    // Está bloqueado por outro worker com lock ativo
    return true;
  }

  /**
   * Tenta reservar atomicamente o próximo slot de envio da campanha.
   * Apenas um worker consegue reservar por vez.
   * Retorna true se conseguiu reservar, false se campanha já tem slot reservado.
   */
  public async claimCampaignSendSlot(
    campaignId: bigint,
    reservedUntil: Date,
    now: Date = new Date(),
  ): Promise<boolean> {
    const result = await this.client.prospectingCampaign.updateMany({
      where: {
        id: campaignId,
        OR: [{ nextSendAt: null }, { nextSendAt: { lte: now } }],
      },
      data: { nextSendAt: reservedUntil },
    });

    return result.count > 0;
  }

  /**
   * Libera o slot de envio da campanha (anula a reserva).
   */
  public async releaseCampaignSendSlot(campaignId: bigint): Promise<boolean> {
    const result = await this.client.prospectingCampaign.updateMany({
      where: { id: campaignId },
      data: { nextSendAt: null },
    });

    return result.count > 0;
  }
}
