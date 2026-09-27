import { type Prisma, type PrismaClient } from '../../database-client/client.js';

export class CustomerAuthRepository {
  public constructor(private readonly client: PrismaClient) {}

  /** Invalida pedidos anteriores e registra o novo token (apenas o hash). */
  public async createPasswordReset(input: {
    tenantId: bigint;
    customerId: bigint;
    tokenHash: string;
    expiresAt: Date;
    now: Date;
    ipAddress: string | null;
  }) {
    await this.client.$transaction(async (transaction) => {
      await transaction.customerPasswordResetToken.updateMany({
        where: { customerId: input.customerId, usedAt: null },
        data: { usedAt: input.now },
      });
      await transaction.customerPasswordResetToken.create({
        data: {
          tenantId: input.tenantId,
          customerId: input.customerId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          requestedIp: input.ipAddress,
        },
      });
    });
  }

  /**
   * Consome o token e troca a senha na mesma transação: uso único garantido
   * pelo `updateMany` condicionado a `usedAt: null`.
   */
  public consumePasswordReset(
    tenantId: bigint,
    tokenHash: string,
    passwordHash: string,
    now: Date,
  ): Promise<boolean> {
    return this.client.$transaction(async (transaction) => {
      const token = await transaction.customerPasswordResetToken.findUnique({
        where: { tokenHash },
      });
      if (token?.tenantId !== tenantId) return false;
      if (token.usedAt !== null || token.expiresAt <= now) return false;
      const claimed = await transaction.customerPasswordResetToken.updateMany({
        where: { id: token.id, usedAt: null },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) return false;
      await transaction.customer.update({
        where: { id: token.customerId },
        data: { passwordHash },
      });
      // Sessões antigas caem junto com a troca de senha.
      await transaction.customerSession.updateMany({
        where: { customerId: token.customerId, revokedAt: null },
        data: { revokedAt: now, revocationReason: 'PASSWORD_RESET' },
      });
      return true;
    });
  }

  public createSession(data: Prisma.CustomerSessionUncheckedCreateInput) {
    return this.client.customerSession.create({ data });
  }

  public findActiveSessionByTokenHash(tokenHash: string) {
    return this.client.customerSession.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { customer: true },
    });
  }

  public touchSession(id: bigint, lastSeenAt: Date) {
    return this.client.customerSession.update({ where: { id }, data: { lastSeenAt } });
  }

  public revokeSession(id: bigint, reason: string) {
    return this.client.customerSession.update({
      where: { id },
      data: { revokedAt: new Date(), revocationReason: reason },
    });
  }

  public audit(data: Prisma.AuditLogUncheckedCreateInput) {
    return this.client.auditLog.create({ data });
  }
}
