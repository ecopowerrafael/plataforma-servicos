import { type Prisma, type PrismaClient } from '../../database-client/client.js';

export class CustomerAuthRepository {
  public constructor(private readonly client: PrismaClient) {}

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
