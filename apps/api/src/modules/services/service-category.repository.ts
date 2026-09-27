import {
  type Prisma,
  type PrismaClient,
  type ServiceCategory,
} from '../../database-client/client.js';

export type ServiceCategoryRecord = ServiceCategory & { _count: { services: number } };

export interface ServiceCategoryRepository {
  list(
    where: Prisma.ServiceCategoryWhereInput,
    page: number,
    limit: number,
  ): Promise<{ total: number; categories: ServiceCategoryRecord[] }>;
  find(tenantId: bigint, publicId: string): Promise<ServiceCategoryRecord | null>;
  create(data: Prisma.ServiceCategoryUncheckedCreateInput): Promise<ServiceCategoryRecord>;
  update(
    id: bigint,
    data: Prisma.ServiceCategoryUncheckedUpdateInput,
  ): Promise<ServiceCategoryRecord>;
  recordAudit(data: Prisma.AuditLogUncheckedCreateInput): Promise<void>;
}

export class PrismaServiceCategoryRepository implements ServiceCategoryRepository {
  public constructor(private readonly client: PrismaClient) {}
  public async list(where: Prisma.ServiceCategoryWhereInput, page: number, limit: number) {
    const [total, categories] = await this.client.$transaction([
      this.client.serviceCategory.count({ where }),
      this.client.serviceCategory.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { services: true } } },
      }),
    ]);
    return { total, categories };
  }
  public find(tenantId: bigint, publicId: string) {
    return this.client.serviceCategory.findFirst({
      where: { tenantId, publicId },
      include: { _count: { select: { services: true } } },
    });
  }
  public create(data: Prisma.ServiceCategoryUncheckedCreateInput) {
    return this.client.serviceCategory.create({
      data,
      include: { _count: { select: { services: true } } },
    });
  }
  public update(id: bigint, data: Prisma.ServiceCategoryUncheckedUpdateInput) {
    return this.client.serviceCategory.update({
      where: { id },
      data,
      include: { _count: { select: { services: true } } },
    });
  }
  public async recordAudit(data: Prisma.AuditLogUncheckedCreateInput) {
    await this.client.auditLog.create({ data });
  }
}
