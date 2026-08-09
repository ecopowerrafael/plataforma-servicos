import { type Prisma, type PrismaClient } from '../../database-client/client.js';

export class PrismaBusinessUnitDateOverridesRepository {
  public constructor(private readonly client: PrismaClient) {}

  public findUnit(tenantId: bigint, publicId: string) {
    return this.client.businessUnit.findFirst({ where: { tenantId, publicId } });
  }

  public list(tenantId: bigint, unitId: bigint, from: Date, to: Date) {
    return this.client.businessUnitDateOverride.findMany({
      where: { tenantId, unitId, date: { gte: from, lte: to } },
      orderBy: [{ date: 'asc' }, { startsAt: 'asc' }],
    });
  }

  public findByDate(tenantId: bigint, unitId: bigint, date: Date) {
    return this.client.businessUnitDateOverride.findMany({
      where: { tenantId, unitId, date },
      orderBy: { startsAt: 'asc' },
    });
  }

  public async replace(
    tenantId: bigint,
    unitId: bigint,
    date: Date,
    rows: Prisma.BusinessUnitDateOverrideUncheckedCreateInput[],
  ) {
    await this.client.$transaction([
      this.client.businessUnitDateOverride.deleteMany({ where: { tenantId, unitId, date } }),
      this.client.businessUnitDateOverride.createMany({ data: rows }),
    ]);
    return this.findByDate(tenantId, unitId, date);
  }

  public async remove(tenantId: bigint, unitId: bigint, date: Date) {
    await this.client.businessUnitDateOverride.deleteMany({ where: { tenantId, unitId, date } });
  }

  public audit(data: Prisma.AuditLogUncheckedCreateInput) {
    return this.client.auditLog.create({ data });
  }
}
