import { type Prisma, type PrismaClient, type Professional } from '../../database-client/client.js';
import { PlanEntitlementService } from '../tenants/plan-entitlement.service.js';
export type ProfessionalRecord = Professional & {
  primaryUnit: { publicId: string } | null;
  tenant: { publicId: string };
  user: { publicId: string } | null;
};
export interface ProfessionalRepository {
  list(
    where: Prisma.ProfessionalWhereInput,
    page: number,
    limit: number,
  ): Promise<{ total: number; items: ProfessionalRecord[] }>;
  find(tenantId: bigint, publicId: string): Promise<ProfessionalRecord | null>;
  findByUserId(tenantId: bigint, userId: bigint): Promise<ProfessionalRecord | null>;
  create(data: Prisma.ProfessionalUncheckedCreateInput): Promise<ProfessionalRecord>;
  update(id: bigint, data: Prisma.ProfessionalUncheckedUpdateInput): Promise<ProfessionalRecord>;
  findUnit(tenantId: bigint, publicId: string): Promise<{ id: bigint } | null>;
  findMember(tenantId: bigint, userPublicId: string): Promise<{ id: bigint } | null>;
  fields(tenantId: bigint): Promise<
    {
      key: string;
      type: string;
      required: boolean;
      active: boolean;
      options: Prisma.JsonValue | null;
    }[]
  >;
  audit(data: Prisma.AuditLogUncheckedCreateInput): Promise<void>;
}
const include = {
  tenant: { select: { publicId: true } },
  primaryUnit: { select: { publicId: true } },
  user: { select: { publicId: true } },
} as const;
export class PrismaProfessionalRepository implements ProfessionalRepository {
  public constructor(private readonly client: PrismaClient) {}
  public async list(where: Prisma.ProfessionalWhereInput, page: number, limit: number) {
    const [total, items] = await this.client.$transaction([
      this.client.professional.count({ where }),
      this.client.professional.findMany({
        where,
        include,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { total, items };
  }
  public find(tenantId: bigint, publicId: string) {
    return this.client.professional.findFirst({ where: { tenantId, publicId }, include });
  }
  public findByUserId(tenantId: bigint, userId: bigint) {
    return this.client.professional.findFirst({ where: { tenantId, userId }, include });
  }
  public create(data: Prisma.ProfessionalUncheckedCreateInput) {
    return this.client.$transaction(async (transaction) => {
      await new PlanEntitlementService().assertCanCreateProfessional(transaction, BigInt(data.tenantId));
      return transaction.professional.create({ data, include });
    });
  }
  public update(id: bigint, data: Prisma.ProfessionalUncheckedUpdateInput) {
    return this.client.professional.update({ where: { id }, data, include });
  }
  public findUnit(tenantId: bigint, publicId: string) {
    return this.client.businessUnit.findFirst({
      where: { tenantId, publicId, status: 'ACTIVE' },
      select: { id: true },
    });
  }
  public async findMember(tenantId: bigint, userPublicId: string) {
    const membership = await this.client.tenantMembership.findFirst({
      where: { tenantId, user: { publicId: userPublicId } },
      select: { userId: true },
    });
    return membership === null ? null : { id: membership.userId };
  }
  public fields(tenantId: bigint) {
    return this.client.tenantCustomFieldDefinition.findMany({
      where: { tenantId, scope: 'PROFESSIONAL' },
      select: { key: true, type: true, required: true, active: true, options: true },
    });
  }
  public async audit(data: Prisma.AuditLogUncheckedCreateInput) {
    await this.client.auditLog.create({ data });
  }
}
