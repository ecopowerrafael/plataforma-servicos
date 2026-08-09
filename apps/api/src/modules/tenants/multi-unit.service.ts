import { type MultiUnitRepository } from './multi-unit.repository.js';

type Repository = Pick<
  MultiUnitRepository,
  'units' | 'appointmentMetrics' | 'customerMetrics' | 'professionalMetrics'
>;

export class MultiUnitService {
  public constructor(private readonly repository: Repository) {}

  public async overview(
    tenantId: bigint,
    allowedUnitPublicIds: string[] | null,
    from: Date,
    to: Date,
  ) {
    const units = await this.repository.units(tenantId, allowedUnitPublicIds);
    const ids = units.map(({ id }) => id);
    const [appointments, customers, professionals] = await Promise.all([
      this.repository.appointmentMetrics(tenantId, ids, from, to),
      this.repository.customerMetrics(tenantId, ids),
      this.repository.professionalMetrics(tenantId, ids),
    ]);
    return {
      units: units.map((unit) => {
        const rows = appointments.filter(({ unitId }) => unitId === unit.id);
        const completed = rows.find(({ status }) => status === 'COMPLETED');
        return {
          unitPublicId: unit.publicId,
          unitName: unit.name,
          isHeadquarters: unit.isHeadquarters,
          appointments: rows.reduce((total, row) => total + row._count._all, 0),
          completedAppointments: completed?._count._all ?? 0,
          revenueCents: (completed?._sum.priceCents ?? 0n).toString(),
          customers:
            customers.find(({ primaryUnitId }) => primaryUnitId === unit.id)?._count._all ?? 0,
          professionals: professionals.find(({ unitId }) => unitId === unit.id)?._count._all ?? 0,
        };
      }),
    };
  }
}
