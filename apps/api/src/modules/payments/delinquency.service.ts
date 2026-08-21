import { DelinquencyResponseSchema, type DelinquencyQuery } from '@plataforma/shared';

import {
  balanceCents,
  discountsByAppointment,
  netPriceCents,
  receivableStatesByAppointment,
  type ReceivableState,
} from './appointment-balance.js';
import { activeDebtsByAppointment } from '../collections/debt-balance.js';
import { type Prisma, type PrismaClient } from '../../database-client/client.js';

export class DelinquencyService {
  public constructor(private readonly client: PrismaClient) {}

  /**
   * Saldo em aberto dos atendimentos. Não existe vencimento no domínio: isto é exposição
   * financeira atual, não atraso. O valor devido vem da fonte canônica de saldo.
   */
  public async list(tenantId: bigint, query: DelinquencyQuery) {
    const where: Prisma.AppointmentWhereInput = {
      tenantId,
      status: { not: 'CANCELED', ...(query.status === undefined ? {} : { equals: query.status }) },
      ...(query.from === undefined && query.to === undefined
        ? {}
        : {
            startsAt: {
              ...(query.from === undefined ? {} : { gte: new Date(query.from) }),
              ...(query.to === undefined ? {} : { lte: new Date(query.to) }),
            },
          }),
      ...(query.unitPublicId === undefined ? {} : { unit: { publicId: query.unitPublicId } }),
      ...(query.customerPublicId === undefined
        ? {}
        : { customer: { publicId: query.customerPublicId } }),
      ...(query.professionalPublicId === undefined
        ? {}
        : { professional: { publicId: query.professionalPublicId } }),
      ...(query.search === undefined
        ? {}
        : {
            OR: [
              { protocol: { contains: query.search } },
              { customer: { name: { contains: query.search } } },
            ],
          }),
    };

    const appointments = await this.client.appointment.findMany({
      where,
      orderBy: { startsAt: 'desc' },
      select: {
        id: true,
        publicId: true,
        protocol: true,
        status: true,
        startsAt: true,
        priceCents: true,
        customer: { select: { publicId: true, name: true } },
        professional: { select: { publicId: true, name: true } },
        service: { select: { name: true } },
        unit: { select: { publicId: true, name: true } },
        payments: { where: { status: 'PAID' }, select: { amountCents: true } },
      },
    });

    // Valor devido e situação da cobrança vêm das mesmas funções usadas pelo resto do sistema.
    const ids = appointments.map((appointment) => appointment.id);
    const [discounts, states, activeDebts] = await Promise.all([
      discountsByAppointment(this.client, tenantId, ids),
      receivableStatesByAppointment(this.client, tenantId, ids),
      activeDebtsByAppointment(this.client, tenantId, ids),
    ]);

    const open = appointments.flatMap((appointment) => {
      const paidCents = appointment.payments.reduce((total, item) => total + item.amountCents, 0n);
      const discountCents = discounts.get(appointment.id) ?? 0n;
      const balance = balanceCents(appointment.priceCents, discountCents, paidCents);
      if (balance <= 0n) return [];
      const state: ReceivableState = states.get(appointment.id) ?? 'ON_SITE';
      const debt = activeDebts.get(appointment.id);
      return [
        {
          appointmentPublicId: appointment.publicId,
          protocol: appointment.protocol,
          status: appointment.status,
          startsAt: appointment.startsAt.toISOString(),
          customerPublicId: appointment.customer.publicId,
          customerName: appointment.customer.name,
          professionalPublicId: appointment.professional.publicId,
          professionalName: appointment.professional.name,
          unitPublicId: appointment.unit?.publicId ?? null,
          unitName: appointment.unit?.name ?? null,
          serviceName: appointment.service.name,
          priceCents: appointment.priceCents.toString(),
          netPriceCents: netPriceCents(appointment.priceCents, discountCents).toString(),
          discountCents: discountCents.toString(),
          paidCents: paidCents.toString(),
          balanceCents: balance.toString(),
          state,
          debtPublicId: debt?.publicId ?? null,
          debtStatus: debt?.status ?? null,
          debtCurrentBalanceCents: debt === undefined ? null : debt.currentBalanceCents.toString(),
        },
      ];
    });

    const summary = open.reduce(
      (totals, item) => {
        const value = BigInt(item.balanceCents);
        totals.totalBalanceCents += value;
        totals.count += 1;
        if (item.state === 'ONLINE_PENDING') totals.onlinePendingCents += value;
        else if (item.state === 'ONLINE_FAILED') totals.onlineFailedCents += value;
        else totals.onSiteCents += value;
        return totals;
      },
      {
        totalBalanceCents: 0n,
        count: 0,
        onlinePendingCents: 0n,
        onlineFailedCents: 0n,
        onSiteCents: 0n,
      },
    );

    const filtered = query.state === undefined
      ? open
      : open.filter((item) => item.state === query.state);
    const page = query.page ?? 1;
    const limit = query.limit;
    const items =
      limit === undefined ? filtered : filtered.slice((page - 1) * limit, page * limit);

    return DelinquencyResponseSchema.parse({
      items,
      totalBalanceCents: summary.totalBalanceCents.toString(),
      summary: {
        totalBalanceCents: summary.totalBalanceCents.toString(),
        count: summary.count,
        onlinePendingCents: summary.onlinePendingCents.toString(),
        onlineFailedCents: summary.onlineFailedCents.toString(),
        onSiteCents: summary.onSiteCents.toString(),
      },
      ...(limit === undefined
        ? {}
        : {
            page: {
              page,
              limit,
              total: filtered.length,
              totalPages: Math.max(Math.ceil(filtered.length / limit), 1),
            },
          }),
    });
  }
}
