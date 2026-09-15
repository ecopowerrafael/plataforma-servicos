import {
  type AgendaOverviewResponse,
  type AppointmentPaymentState,
  type TenantDashboardResponse,
  type TenantReportResponse,
} from '@plataforma/shared';

import { type Prisma, type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import {
  discountsByAppointment,
  netPriceCents,
  paidByAppointment,
} from '../payments/appointment-balance.js';

type AppointmentStatus =
  'PENDING' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED' | 'NO_SHOW';

/** Status de cobrança online que ainda não viraram recebimento confirmado. */
const OPEN_GATEWAY_STATUSES = ['PENDING', 'PROCESSING', 'FAILED', 'EXPIRED'] as const;
/** Agendamentos que não geram expectativa de receita. */
const NON_BILLABLE_STATUSES = new Set<AppointmentStatus>(['CANCELED', 'NO_SHOW']);

export interface AgendaOverviewInput {
  from: string;
  to: string;
  professionalPublicId?: string | undefined;
  servicePublicId?: string | undefined;
  unitPublicId?: string | undefined;
  offsetMinutes: number;
}

function emptyStatusCounts(): Record<AppointmentStatus, number> {
  return { PENDING: 0, CONFIRMED: 0, IN_PROGRESS: 0, COMPLETED: 0, CANCELED: 0, NO_SHOW: 0 };
}

const sumMap = (map: Map<bigint, bigint>, key: bigint) => map.get(key) ?? 0n;

export class AppointmentOperationsService {
  public constructor(private readonly client: PrismaClient) {}

  /**
   * Agrega, em uma única chamada, os indicadores da Visão da agenda: totais por status,
   * ranking por profissional, distribuição por hora local e situação financeira do período.
   * O financeiro só é calculado quando o usuário tem permissão de leitura de pagamentos.
   */
  public async agendaOverview(
    tenantId: bigint,
    input: AgendaOverviewInput,
    options: { includeFinancial: boolean },
  ): Promise<AgendaOverviewResponse> {
    const from = new Date(input.from);
    const to = new Date(input.to);
    const where: Prisma.AppointmentWhereInput = {
      tenantId,
      startsAt: { gte: from, lte: to },
      ...(await this.overviewFilters(tenantId, input)),
    };
    const appointments = await this.client.appointment.findMany({
      where,
      select: {
        id: true,
        publicId: true,
        status: true,
        startsAt: true,
        priceCents: true,
        professionalId: true,
      },
      orderBy: { startsAt: 'asc' },
    });

    const byStatusCounts = emptyStatusCounts();
    const byHourCounts = new Map<number, number>();
    const byProfessionalCounts = new Map<bigint, number>();
    for (const appointment of appointments) {
      byStatusCounts[appointment.status] += 1;
      const localHour = new Date(
        appointment.startsAt.getTime() - input.offsetMinutes * 60_000,
      ).getUTCHours();
      byHourCounts.set(localHour, (byHourCounts.get(localHour) ?? 0) + 1);
      byProfessionalCounts.set(
        appointment.professionalId,
        (byProfessionalCounts.get(appointment.professionalId) ?? 0) + 1,
      );
    }

    const professionals =
      byProfessionalCounts.size === 0
        ? []
        : await this.client.professional.findMany({
            where: { tenantId, id: { in: [...byProfessionalCounts.keys()] } },
            select: { id: true, publicId: true, name: true },
          });

    const financialData = options.includeFinancial
      ? await this.overviewFinancial(tenantId, appointments)
      : null;

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      totals: {
        appointments: appointments.length,
        pending: byStatusCounts.PENDING,
        confirmed: byStatusCounts.CONFIRMED,
        inProgress: byStatusCounts.IN_PROGRESS,
        completed: byStatusCounts.COMPLETED,
        canceled: byStatusCounts.CANCELED,
        noShow: byStatusCounts.NO_SHOW,
      },
      financial: financialData?.financial ?? null,
      byStatus: (Object.keys(byStatusCounts) as AppointmentStatus[]).map((status) => ({
        status,
        total: byStatusCounts[status],
      })),
      byProfessional: professionals
        .map((professional) => ({
          professionalPublicId: professional.publicId,
          professionalName: professional.name,
          total: byProfessionalCounts.get(professional.id) ?? 0,
        }))
        .sort((a, b) => b.total - a.total),
      byHour: [...byHourCounts.entries()]
        .map(([hour, total]) => ({ hour, total }))
        .sort((a, b) => a.hour - b.hour),
      payments: financialData?.payments ?? [],
    };
  }

  private async overviewFilters(
    tenantId: bigint,
    input: AgendaOverviewInput,
  ): Promise<Prisma.AppointmentWhereInput> {
    const [professional, service, unit] = await Promise.all([
      input.professionalPublicId === undefined
        ? null
        : this.client.professional.findFirst({
            where: { tenantId, publicId: input.professionalPublicId },
            select: { id: true },
          }),
      input.servicePublicId === undefined
        ? null
        : this.client.service.findFirst({
            where: { tenantId, publicId: input.servicePublicId },
            select: { id: true },
          }),
      input.unitPublicId === undefined
        ? null
        : this.client.businessUnit.findFirst({
            where: { tenantId, publicId: input.unitPublicId },
            select: { id: true },
          }),
    ]);
    if (input.professionalPublicId !== undefined && professional === null)
      throw this.filterNotFound('Profissional não encontrado para este estabelecimento.');
    if (input.servicePublicId !== undefined && service === null)
      throw this.filterNotFound('Serviço não encontrado para este estabelecimento.');
    if (input.unitPublicId !== undefined && unit === null)
      throw this.filterNotFound('Unidade não encontrada para este estabelecimento.');
    return {
      ...(professional === null ? {} : { professionalId: professional.id }),
      ...(service === null ? {} : { serviceId: service.id }),
      ...(unit === null ? {} : { unitId: unit.id }),
    };
  }

  /**
   * Receita prevista usa o preço líquido (descontos de cupom e fidelidade), a mesma base do
   * PaymentService. Receita recebida vem exclusivamente de pagamentos PAID — previsão nunca
   * é apresentada como recebimento.
   */
  private async overviewFinancial(
    tenantId: bigint,
    appointments: {
      id: bigint;
      publicId: string;
      status: AppointmentStatus;
      priceCents: bigint;
    }[],
  ) {
    const ids = appointments.map((appointment) => appointment.id);
    // Preço líquido e total pago vêm da fonte única de saldo do agendamento.
    const [paidMap, discountMap, openCharges] = await Promise.all([
      paidByAppointment(this.client, tenantId, ids),
      discountsByAppointment(this.client, tenantId, ids),
      ids.length === 0
        ? Promise.resolve([] as { appointmentId: bigint }[])
        : this.client.paymentGatewayCharge.findMany({
            where: {
              tenantId,
              appointmentId: { in: ids },
              status: { in: [...OPEN_GATEWAY_STATUSES] },
            },
            select: { appointmentId: true },
          }),
    ]);
    const withOpenCharge = new Set(openCharges.map((charge) => charge.appointmentId));

    let expectedCents = 0n;
    let receivedCents = 0n;
    const payments = appointments.map((appointment) => {
      const discount = sumMap(discountMap, appointment.id);
      const netPrice = netPriceCents(appointment.priceCents, discount);
      const received = sumMap(paidMap, appointment.id);
      const billable = !NON_BILLABLE_STATUSES.has(appointment.status);
      if (billable) expectedCents += netPrice;
      receivedCents += received;
      const state: AppointmentPaymentState =
        netPrice === 0n || received >= netPrice
          ? 'PAID'
          : received > 0n
            ? 'PARTIAL'
            : withOpenCharge.has(appointment.id)
              ? 'ONLINE_PENDING'
              : 'ON_SITE';
      return {
        appointmentPublicId: appointment.publicId,
        expectedCents: netPrice.toString(),
        receivedCents: received.toString(),
        state,
      };
    });

    return {
      financial: {
        expectedCents: expectedCents.toString(),
        receivedCents: receivedCents.toString(),
        openCents: (expectedCents > receivedCents ? expectedCents - receivedCents : 0n).toString(),
      },
      payments,
    };
  }

  private filterNotFound(message: string) {
    return new AppError({ code: 'AGENDA_OVERVIEW_FILTER_NOT_FOUND', message, statusCode: 404 });
  }

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
    grouped: { serviceId: bigint | null; _count: { _all: number } }[],
  ) {
    if (grouped.length === 0) return [];
    const serviceIds = grouped
      .map((entry) => entry.serviceId)
      .filter((id): id is bigint => id !== null);
    if (serviceIds.length === 0) return [];
    const services = await this.client.service.findMany({
      where: { tenantId, id: { in: serviceIds } },
      select: { id: true, publicId: true, name: true },
    });
    return grouped
      .map((entry) => {
        if (entry.serviceId === null) return null;
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
