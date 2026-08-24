import { randomUUID } from 'node:crypto';

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
  createWithAutomaticUser(
    tenantId: bigint,
    professionalData: Omit<Prisma.ProfessionalUncheckedCreateInput, 'tenantId'>,
    roleId: bigint,
  ): Promise<ProfessionalRecord>;
  update(id: bigint, data: Prisma.ProfessionalUncheckedUpdateInput): Promise<ProfessionalRecord>;
  findUnit(tenantId: bigint, publicId: string): Promise<{ id: bigint } | null>;
  findMember(tenantId: bigint, userPublicId: string): Promise<{ id: bigint } | null>;
  findRoleByCode(tenantId: bigint, code: string): Promise<{ id: bigint } | null>;
  fields(tenantId: bigint): Promise<
    {
      key: string;
      type: string;
      required: boolean;
      active: boolean;
      options: Prisma.JsonValue | null;
    }[]
  >;
  updateUserPassword(userPublicId: string, passwordHash: string): Promise<{ id: bigint }>;
  findUserIdByPublicId(userPublicId: string): Promise<{ id: bigint } | null>;
  updateUserEmail(userPublicId: string, email: string): Promise<{ id: bigint }>;
  autoLinkUserByEmail(email: string): Promise<bigint | null>;
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
      const professional = await transaction.professional.create({ data, include });
      const periods = [1, 2, 3, 4, 5, 6].flatMap((weekday) => [
        { publicId: randomUUID(), tenantId: professional.tenantId, professionalId: professional.id, weekday, startsAt: '09:00', endsAt: '12:00', active: true },
        { publicId: randomUUID(), tenantId: professional.tenantId, professionalId: professional.id, weekday, startsAt: '13:00', endsAt: '18:00', active: true },
      ]);
      await transaction.professionalWorkSchedule.createMany({ data: periods });
      return professional;
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
  public async findRoleByCode(tenantId: bigint, code: string) {
    return this.client.role.findFirst({
      where: { code, tenantId },
      select: { id: true },
    });
  }
  public async updateUserPassword(userPublicId: string, passwordHash: string) {
    return this.client.user.update({
      where: { publicId: userPublicId },
      data: { passwordHash, passwordChangedAt: new Date() },
      select: { id: true },
    });
  }
  public async findUserIdByPublicId(userPublicId: string) {
    return this.client.user.findUnique({
      where: { publicId: userPublicId },
      select: { id: true },
    });
  }
  public async updateUserEmail(userPublicId: string, email: string) {
    const normalizedEmail = email.toLowerCase().trim();
    return this.client.user.update({
      where: { publicId: userPublicId },
      data: { email, normalizedEmail },
      select: { id: true },
    });
  }
  public async autoLinkUserByEmail(email: string): Promise<bigint | null> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.client.user.findUnique({
      where: { normalizedEmail },
      select: { id: true },
    });
    return user?.id ?? null;
  }
  public async createWithAutomaticUser(
    tenantId: bigint,
    professionalData: Omit<Prisma.ProfessionalUncheckedCreateInput, 'tenantId'>,
    roleId: bigint,
  ): Promise<ProfessionalRecord> {
    return this.client.$transaction(async (tx) => {
      await new PlanEntitlementService().assertCanCreateProfessional(tx, tenantId);

      const normalizedEmail = professionalData.email
        ? professionalData.email.toLowerCase().trim()
        : null;

      let userId: bigint | null = null;
      if (normalizedEmail) {
        const existingUser = await tx.user.findUnique({
          where: { normalizedEmail },
          select: { id: true },
        });
        userId = existingUser?.id ?? null;

        if (!existingUser) {
          const newUser = await tx.user.create({
            data: {
              publicId: randomUUID(),
              email: professionalData.email!,
              normalizedEmail,
              status: 'ACTIVE',
            },
            select: { id: true },
          });
          userId = newUser.id;

          const membershipExists = await tx.tenantMembership.findFirst({
            where: { tenantId, userId: newUser.id },
            select: { id: true },
          });

          if (!membershipExists) {
            await tx.tenantMembership.create({
              data: {
                publicId: randomUUID(),
                tenantId,
                userId: newUser.id,
                roleId,
                status: 'ACTIVE',
              },
            });
          }
        }
      }

      const professional = await tx.professional.create({
        data: { ...professionalData, tenantId, userId },
        include,
      });

      const periods = [1, 2, 3, 4, 5, 6].flatMap((weekday) => [
        { publicId: randomUUID(), tenantId: professional.tenantId, professionalId: professional.id, weekday, startsAt: '09:00', endsAt: '12:00', active: true },
        { publicId: randomUUID(), tenantId: professional.tenantId, professionalId: professional.id, weekday, startsAt: '13:00', endsAt: '18:00', active: true },
      ]);
      await tx.professionalWorkSchedule.createMany({ data: periods });

      return professional;
    });
  }
}
