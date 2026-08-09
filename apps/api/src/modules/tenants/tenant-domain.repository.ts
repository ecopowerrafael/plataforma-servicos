import { randomUUID } from 'node:crypto';

import { Prisma, type PrismaClient } from '../../database-client/client.js';

export class TenantDomainRepository {
  public constructor(private readonly client: PrismaClient) {}
  public tenant(tenantId: bigint) {
    return this.client.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  }
  public async featureEnabled(tenantId: bigint): Promise<boolean> {
    const subscription = await this.client.tenantSubscription.findFirst({
      where: { tenantId, effectiveKey: 'EFFECTIVE' },
      include: { plan: { include: { limits: { where: { key: 'custom_domain.enabled' } } } } },
    });
    return subscription?.plan.limits[0]?.booleanValue === true;
  }
  public list(tenantId: bigint) {
    return this.client.tenantDomain.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });
  }
  public find(tenantId: bigint, publicId: string) {
    return this.client.tenantDomain.findFirst({ where: { tenantId, publicId } });
  }
  public resolve(hostname: string) {
    return this.client.tenantDomain.findFirst({
      where: { hostname, status: 'ACTIVE', tenant: { status: 'ACTIVE' } },
      select: { tenant: { select: { slug: true } } },
    });
  }
  public async create(data: {
    tenantId: bigint;
    hostname: string;
    type: 'CUSTOM' | 'SUBDOMAIN';
    verificationToken: string;
    active: boolean;
  }) {
    try {
      return await this.client.tenantDomain.create({
        data: {
          publicId: randomUUID(),
          tenantId: data.tenantId,
          hostname: data.hostname,
          type: data.type,
          verificationToken: data.verificationToken,
          status: data.active ? 'ACTIVE' : 'PENDING',
          verifiedAt: data.active ? new Date() : null,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        return null;
      throw error;
    }
  }
  public activate(id: bigint) {
    return this.client.tenantDomain.update({
      where: { id },
      data: { status: 'ACTIVE', verifiedAt: new Date(), lastError: null },
    });
  }
  public fail(id: bigint, lastError: string) {
    return this.client.tenantDomain.update({
      where: { id },
      data: { status: 'FAILED', lastError },
    });
  }
  public remove(id: bigint) {
    return this.client.tenantDomain.delete({ where: { id } });
  }
  public audit(data: Prisma.AuditLogUncheckedCreateInput) {
    return this.client.auditLog.create({ data });
  }
}
