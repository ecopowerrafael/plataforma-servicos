import {
  type Prisma,
  type PrismaClient,
  type ServiceCategory,
} from '../../database-client/client.js';

export interface ServiceCategoryRepository {
  list(
    where: Prisma.ServiceCategoryWhereInput,
    page: number,
    limit: number,
  ): Promise<{ total: number; categories: ServiceCategory[] }>;
  find(tenantId: bigint, publicId: string): Promise<ServiceCategory | null>;
  create(data: Prisma.ServiceCategoryUncheckedCreateInput): Promise<ServiceCategory>;
  update(id: bigint, data: Prisma.ServiceCategoryUncheckedUpdateInput): Promise<ServiceCategory>;
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
      }),
    ]);
    return { total, categories };
  }
  public find(tenantId: bigint, publicId: string) {
    return this.client.serviceCategory.findFirst({ where: { tenantId, publicId } });
  }
  public create(data: Prisma.ServiceCategoryUncheckedCreateInput) {
    return this.client.serviceCategory.create({ data });
  }
  public update(id: bigint, data: Prisma.ServiceCategoryUncheckedUpdateInput) {
    return this.client.serviceCategory.update({ where: { id }, data });
  }
  public async recordAudit(data: Prisma.AuditLogUncheckedCreateInput) {
    await this.client.auditLog.create({ data });
  }
}
