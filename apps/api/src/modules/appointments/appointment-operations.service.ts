import { type TenantDashboardResponse, type TenantReportResponse } from '@plataforma/shared';

import { type PrismaClient } from '../../database-client/client.js';

type AppointmentStatus =
  'PENDING' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED' | 'NO_SHOW';

function emptyStatusCounts(): Record<AppointmentStatus, number> {
  return { PENDING: 0, CONFIRMED: 0, IN_PROGRESS: 0, COMPLETED: 0, CANCELED: 0, NO_SHOW: 0 };
}

export class AppointmentOperationsService {
  public constructor(private readonly client: PrismaClient) {}

  public async dashboard(tenantId: bigint, date?: string): Promise<TenantDashboardResponse> {
    const day = date ?? new Date().toISOString().slice(0, 10);
    const from = new Date(`${day}T00:00:00.000Z`);
    const to = new Date(`${day}T23:59:59.999Z`);
    const now = new Date();

    const [statusGrouped, checkedIn, fitIn, upcoming, professionalGrouped, unitGrouped] =
      await Promise.all([
        this.client.appointment.groupBy({
          by: ['status'],
          where: { tenantId, startsAt: { gte: from, lte: to } },
          _count: { _all: true },
        }),
        this.client.appointment.count({
          where: { tenantId, startsAt: { gte: from, lte: to }, checkedInAt: { not: null } },
        }),
        this.client.appointment.count({
          where: { tenantId, startsAt: { gte: from, lte: to }, isFitIn: true },
        }),
        this.client.appointment.count({
          where: {
            tenantId,
            startsAt: { gte: from > now ? from : now, lte: to },
            status: { in: ['PENDING', 'CONFIRMED'] },
          },
        }),
        this.client.appointment.groupBy({
          by: ['professionalId'],
          where: { tenantId, startsAt: { gte: from, lte: to } },
          _count: { _all: true },
        }),
        this.client.appointment.groupBy({
          by: ['unitId'],
          where: { tenantId, startsAt: { gte: from, lte: to } },
          _count: { _all: true },
        }),
      ]);

    const byStatus = emptyStatusCounts();
    let total = 0;
    for (const entry of statusGrouped) {
      byStatus[entry.status] = entry._count._all;
      total += entry._count._all;
    }

    const byProfessional = await this.resolveProfessionalBreakdown(tenantId, professionalGrouped);
    const byUnit = await this.resolveUnitBreakdown(tenantId, unitGrouped);

    return {
      date: day,
      today: {
        total,
        upcoming,
        byStatus,
        checkedIn,
        fitIn,
        byProfessional,
        byUnit,
      },
    };
  }

  public async report(
    tenantId: bigint,
    from: string,
    to: string,
    unitPublicId?: string,
  ): Promise<TenantReportResponse> {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    const unit =
      unitPublicId === undefined
        ? null
        : await this.client.businessUnit.findFirst({ where: { tenantId, publicId: unitPublicId } });
    if (unitPublicId !== undefined && unit === null)
      throw new Error('Unidade não encontrada para este estabelecimento.');
    const where = {
      tenantId,
      startsAt: { gte: fromDate, lte: toDate },
      ...(unit === null ? {} : { unitId: unit.id }),
    };
    const [
      statusGrouped,
      professionalGrouped,
      serviceGrouped,
      unitGrouped,
      newCustomers,
      completed,
    ] = await Promise.all([
      this.client.appointment.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.client.appointment.groupBy({
        by: ['professionalId'],
        where,
        _count: { _all: true },
      }),
      this.client.appointment.groupBy({
        by: ['serviceId'],
        where,
        _count: { _all: true },
      }),
      this.client.appointment.groupBy({
        by: ['unitId'],
        where,
        _count: { _all: true },
      }),
      this.client.customer.count({
        where: { tenantId, createdAt: { gte: fromDate, lte: toDate } },
      }),
      this.client.appointment.findMany({
        where: { ...where, status: 'COMPLETED' },
        select: { customerId: true, priceCents: true },
      }),
    ]);

    const byStatus = emptyStatusCounts();
    let total = 0;
    for (const entry of statusGrouped) {
      byStatus[entry.status] = entry._count._all;
      total += entry._count._all;
    }

    const byProfessional = await this.resolveProfessionalBreakdown(tenantId, professionalGrouped);
    const byService = await this.resolveServiceBreakdown(tenantId, serviceGrouped);
    const byUnit = await this.resolveUnitBreakdown(tenantId, unitGrouped);
    const customerIds = [...new Set(completed.map((entry) => entry.customerId))];
    const returningCustomers =
      customerIds.length === 0
        ? 0
        : new Set(
            (
              await this.client.appointment.findMany({
                where: { tenantId, customerId: { in: customerIds }, startsAt: { lt: fromDate } },
                select: { customerId: true },
              })
            ).map((entry) => entry.customerId),
          ).size;
    const completedRevenueCents = completed.reduce((sum, entry) => sum + entry.priceCents, 0n);

    return {
      from,
      to,
      total,
      byStatus,
      byProfessional,
      byService,
      byUnit,
      newCustomers,
      cancellationRate: total === 0 ? 0 : byStatus.CANCELED / total,
      noShowRate: total === 0 ? 0 : byStatus.NO_SHOW / total,
      completed: completed.length,
      completionRate: total === 0 ? 0 : completed.length / total,
      completedRevenueCents: completedRevenueCents.toString(),
      returningCustomers,
    };
  }

  private async resolveProfessionalBreakdown(
    tenantId: bigint,
    grouped: { professionalId: bigint; _count: { _all: number } }[],
  ) {
    if (grouped.length === 0) return [];
    const professionals = await this.client.professional.findMany({
      where: { tenantId, id: { in: grouped.map((entry) => entry.professionalId) } },
      select: { id: true, publicId: true, name: true },
    });
    return grouped
      .map((entry) => {
        const professional = professionals.find((item) => item.id === entry.professionalId);
        return professional === undefined
          ? null
          : {
              professionalPublicId: professional.publicId,
              professionalName: professional.name,
              total: entry._count._all,
            };
      })
      .filter((value): value is NonNullable<typeof value> => value !== null)
      .sort((a, b) => b.total - a.total);
  }

  private async resolveServiceBreakdown(
    tenantId: bigint,
    grouped: { serviceId: bigint; _count: { _all: number } }[],
  ) {
    if (grouped.length === 0) return [];
    const services = await this.client.service.findMany({
      where: { tenantId, id: { in: grouped.map((entry) => entry.serviceId) } },
      select: { id: true, publicId: true, name: true },
    });
    return grouped
      .map((entry) => {
        const service = services.find((item) => item.id === entry.serviceId);
        return service === undefined
          ? null
          : {
              servicePublicId: service.publicId,
              serviceName: service.name,
              total: entry._count._all,
            };
      })
      .filter((value): value is NonNullable<typeof value> => value !== null)
      .sort((a, b) => b.total - a.total);
  }

  private async resolveUnitBreakdown(
    tenantId: bigint,
    grouped: { unitId: bigint | null; _count: { _all: number } }[],
  ) {
    const unitIds = grouped.map((entry) => entry.unitId).filter((id): id is bigint => id !== null);
    const units =
      unitIds.length === 0
        ? []
        : await this.client.businessUnit.findMany({
            where: { tenantId, id: { in: unitIds } },
            select: { id: true, publicId: true, name: true },
          });
    return grouped
      .map((entry) => {
        if (entry.unitId === null)
          return { unitPublicId: null, unitName: 'Sem unidade', total: entry._count._all };
        const unit = units.find((item) => item.id === entry.unitId);
        return unit === undefined
          ? null
          : { unitPublicId: unit.publicId, unitName: unit.name, total: entry._count._all };
      })
      .filter((value): value is NonNullable<typeof value> => value !== null)
      .sort((a, b) => b.total - a.total);
  }
}
