import { type Prisma, type PrismaClient } from '../../database-client/client.js';

export class PrismaBusinessUnitOperatingHoursRepository {
  public constructor(private readonly client: PrismaClient) {}

  public findUnit(tenantId: bigint, publicId: string) {
    return this.client.businessUnit.findFirst({ where: { tenantId, publicId } });
  }

  public list(tenantId: bigint, unitId: bigint) {
    return this.client.businessUnitOperatingHours.findMany({
      where: { tenantId, unitId },
      orderBy: [{ weekday: 'asc' }, { startsAt: 'asc' }],
    });
  }

  public async replace(
    tenantId: bigint,
    unitId: bigint,
    periods: Prisma.BusinessUnitOperatingHoursUncheckedCreateInput[],
  ) {
    await this.client.$transaction([
      this.client.businessUnitOperatingHours.deleteMany({ where: { tenantId, unitId } }),
      this.client.businessUnitOperatingHours.createMany({ data: periods }),
    ]);
    return this.list(tenantId, unitId);
  }

  public audit(data: Prisma.AuditLogUncheckedCreateInput) {
    return this.client.auditLog.create({ data });
  }
}
