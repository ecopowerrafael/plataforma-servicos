import { type Prisma, type PrismaClient } from '../../database-client/client.js';

const include = { primaryUnit: { select: { publicId: true } } } as const;

export class CustomerRepository {
  public constructor(private readonly client: PrismaClient) {}

  public async list(
    where: Prisma.CustomerWhereInput,
    page: number,
    limit: number,
    orderBy: Prisma.CustomerOrderByWithRelationInput,
  ) {
    const [total, items] = await this.client.$transaction([
      this.client.customer.count({ where }),
      this.client.customer.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include,
      }),
    ]);
    return { total, items };
  }

  public find(tenantId: bigint, publicId: string) {
    return this.client.customer.findFirst({ where: { tenantId, publicId }, include });
  }
  public findByEmail(tenantId: bigint, email: string) {
    return this.client.customer.findFirst({ where: { tenantId, email }, include });
  }
  public findByContact(tenantId: bigint, phone: string | null, email: string | null) {
    const or: Prisma.CustomerWhereInput[] = [];
    if (phone !== null) or.push({ phone });
    if (email !== null) or.push({ email });
    if (or.length === 0) return Promise.resolve(null);
    return this.client.customer.findFirst({ where: { tenantId, OR: or }, include });
  }
  public create(data: Prisma.CustomerUncheckedCreateInput) {
    return this.client.customer.create({ data, include });
  }
  public update(id: bigint, data: Prisma.CustomerUncheckedUpdateInput) {
    return this.client.customer.update({ where: { id }, data, include });
  }
  public findUnit(tenantId: bigint, publicId: string) {
    return this.client.businessUnit.findFirst({
      where: { tenantId, publicId, status: 'ACTIVE' },
      select: { id: true },
    });
  }
  public tenantProfile(tenantId: bigint) {
    return this.client.tenant.findUnique({
      where: { id: tenantId },
      select: { businessProfile: true },
    });
  }
  public fields(tenantId: bigint) {
    return this.client.tenantCustomFieldDefinition.findMany({
      where: { tenantId, scope: 'CUSTOMER' },
      select: {
        publicId: true,
        key: true,
        label: true,
        description: true,
        type: true,
        scope: true,
        required: true,
        active: true,
        sortOrder: true,
        options: true,
        validation: true,
        source: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
    });
  }
  public audit(data: Prisma.AuditLogUncheckedCreateInput) {
    return this.client.auditLog.create({ data });
  }
}
