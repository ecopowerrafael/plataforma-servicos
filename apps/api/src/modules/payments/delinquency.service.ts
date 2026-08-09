import { DelinquencyResponseSchema, type DelinquencyQuery } from '@plataforma/shared';

import { type Prisma, type PrismaClient } from '../../database-client/client.js';

export class DelinquencyService {
  public constructor(private readonly client: PrismaClient) {}

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
    };

    const appointments = await this.client.appointment.findMany({
      where,
      orderBy: { startsAt: 'desc' },
      select: {
        publicId: true,
        protocol: true,
        status: true,
        startsAt: true,
        priceCents: true,
        customer: { select: { publicId: true, name: true } },
        professional: { select: { publicId: true, name: true } },
        unit: { select: { publicId: true, name: true } },
        payments: { where: { status: 'PAID' }, select: { amountCents: true } },
      },
    });

    const withBalance = appointments.map((appointment) => {
      const paidCents = appointment.payments.reduce((total, item) => total + item.amountCents, 0n);
      const balanceCents =
        appointment.priceCents > paidCents ? appointment.priceCents - paidCents : 0n;
      return { appointment, paidCents, balanceCents };
    });

    let totalBalanceCents = 0n;
    const items = [];
    for (const entry of withBalance) {
      if (entry.balanceCents <= 0n) continue;
      totalBalanceCents += entry.balanceCents;
      items.push({
        appointmentPublicId: entry.appointment.publicId,
        protocol: entry.appointment.protocol,
        status: entry.appointment.status,
        startsAt: entry.appointment.startsAt.toISOString(),
        customerPublicId: entry.appointment.customer.publicId,
        customerName: entry.appointment.customer.name,
        professionalPublicId: entry.appointment.professional.publicId,
        professionalName: entry.appointment.professional.name,
        unitPublicId: entry.appointment.unit?.publicId ?? null,
        unitName: entry.appointment.unit?.name ?? null,
        priceCents: entry.appointment.priceCents.toString(),
        paidCents: entry.paidCents.toString(),
        balanceCents: entry.balanceCents.toString(),
      });
    }

    return DelinquencyResponseSchema.parse({
      items,
      totalBalanceCents: totalBalanceCents.toString(),
    });
  }
}
