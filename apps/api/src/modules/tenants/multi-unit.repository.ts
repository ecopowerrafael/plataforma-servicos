import { type PrismaClient } from '../../database-client/client.js';

export class MultiUnitRepository {
  public constructor(private readonly client: PrismaClient) {}

  public units(tenantId: bigint, allowedPublicIds: string[] | null) {
    return this.client.businessUnit.findMany({
      where: {
        tenantId,
        ...(allowedPublicIds === null ? {} : { publicId: { in: allowedPublicIds } }),
      },
      orderBy: [{ isHeadquarters: 'desc' }, { name: 'asc' }],
      select: { id: true, publicId: true, name: true, isHeadquarters: true },
    });
  }

  public appointmentMetrics(tenantId: bigint, unitIds: bigint[], from: Date, to: Date) {
    return this.client.appointment.groupBy({
      by: ['unitId', 'status'],
      where: { tenantId, unitId: { in: unitIds }, startsAt: { gte: from, lte: to } },
      _count: { _all: true },
      _sum: { priceCents: true },
    });
  }

  public customerMetrics(tenantId: bigint, unitIds: bigint[]) {
    return this.client.customer.groupBy({
      by: ['primaryUnitId'],
      where: { tenantId, primaryUnitId: { in: unitIds } },
      _count: { _all: true },
    });
  }

  public professionalMetrics(tenantId: bigint, unitIds: bigint[]) {
    return this.client.professionalUnit.groupBy({
      by: ['unitId'],
      where: { tenantId, unitId: { in: unitIds }, active: true },
      _count: { _all: true },
    });
  }
}
