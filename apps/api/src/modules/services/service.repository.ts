import { type Prisma, type PrismaClient, type Service } from '../../database-client/client.js';
import { PlanEntitlementService } from '../tenants/plan-entitlement.service.js';

export type ServiceRecord = Service & { category: { publicId: string } | null };

export interface ServiceRepository {
  list(
    where: Prisma.ServiceWhereInput,
    page: number,
    limit: number,
  ): Promise<{ total: number; services: ServiceRecord[] }>;
  find(tenantId: bigint, publicId: string): Promise<ServiceRecord | null>;
  findWithTenant(
    tenantId: bigint,
    publicId: string,
  ): Promise<(ServiceRecord & { tenant: { publicId: string } }) | null>;
  create(data: Prisma.ServiceUncheckedCreateInput): Promise<ServiceRecord>;
  update(id: bigint, data: Prisma.ServiceUncheckedUpdateInput): Promise<ServiceRecord>;
  findCategory?(
    tenantId: bigint,
    publicId: string,
  ): Promise<{ id: bigint; active: boolean } | null>;
  recordAudit(data: Prisma.AuditLogUncheckedCreateInput): Promise<void>;
}

export class PrismaServiceRepository implements ServiceRepository {
  public constructor(private readonly client: PrismaClient) {}

  public async list(where: Prisma.ServiceWhereInput, page: number, limit: number) {
    const [total, services] = await this.client.$transaction([
      this.client.service.count({ where }),
      this.client.service.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: { category: { select: { publicId: true } } },
      }),
    ]);
    return { total, services };
  }

  public find(tenantId: bigint, publicId: string): Promise<ServiceRecord | null> {
    return this.client.service.findFirst({
      where: { tenantId, publicId },
      include: { category: { select: { publicId: true } } },
    });
  }

  public findWithTenant(
    tenantId: bigint,
    publicId: string,
  ): Promise<(ServiceRecord & { tenant: { publicId: string } }) | null> {
    return this.client.service.findFirst({
      where: { tenantId, publicId },
      include: { tenant: { select: { publicId: true } }, category: { select: { publicId: true } } },
    });
  }

  public create(data: Prisma.ServiceUncheckedCreateInput): Promise<ServiceRecord> {
    return this.client.$transaction(async (transaction) => {
      await new PlanEntitlementService().assertCanCreateService(transaction, BigInt(data.tenantId));
      return transaction.service.create({
        data,
        include: { category: { select: { publicId: true } } },
      });
    });
  }

  public update(id: bigint, data: Prisma.ServiceUncheckedUpdateInput): Promise<ServiceRecord> {
    return this.client.service.update({
      where: { id },
      data,
      include: { category: { select: { publicId: true } } },
    });
  }

  public findCategory(tenantId: bigint, publicId: string) {
    return this.client.serviceCategory.findFirst({
      where: { tenantId, publicId },
      select: { id: true, active: true },
    });
  }

  public async recordAudit(data: Prisma.AuditLogUncheckedCreateInput): Promise<void> {
    await this.client.auditLog.create({ data });
  }
}
