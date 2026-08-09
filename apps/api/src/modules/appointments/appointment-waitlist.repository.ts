import { randomUUID } from 'node:crypto';

import { Prisma, type PrismaClient } from '../../database-client/client.js';

export const waitlistInclude = {
  customer: { select: { publicId: true, name: true } },
  professional: { select: { publicId: true, publicName: true } },
  service: { select: { publicId: true, name: true } },
  unit: { select: { publicId: true, name: true } },
  opportunity: {
    select: { publicId: true, startsAt: true, professional: { select: { publicId: true } } },
  },
} as const;
export type WaitlistRecord = Prisma.AppointmentWaitlistGetPayload<{
  include: typeof waitlistInclude;
}>;
const localParts = (value: Date, timezone: string) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(value)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );

export class AppointmentWaitlistRepository {
  public constructor(private readonly client: PrismaClient) {}
  public customer(t: bigint, id: string) {
    return this.client.customer.findFirst({
      where: { tenantId: t, publicId: id, status: 'ACTIVE' },
    });
  }
  public professional(t: bigint, id: string) {
    return this.client.professional.findFirst({
      where: { tenantId: t, publicId: id, active: true },
    });
  }
  public service(t: bigint, id: string) {
    return this.client.service.findFirst({ where: { tenantId: t, publicId: id, active: true } });
  }
  public unit(t: bigint, id: string) {
    return this.client.businessUnit.findFirst({
      where: { tenantId: t, publicId: id, status: 'ACTIVE' },
    });
  }
  public professionalService(t: bigint, p: bigint, s: bigint) {
    return this.client.professionalService.findFirst({
      where: { tenantId: t, professionalId: p, serviceId: s, active: true },
    });
  }
  public professionalUnit(t: bigint, p: bigint, u: bigint) {
    return this.client.professionalUnit.findFirst({
      where: { tenantId: t, professionalId: p, unitId: u, active: true },
    });
  }
  public professionalsFor(t: bigint, s: bigint, u: bigint) {
    return this.client.professional.findMany({
      where: {
        tenantId: t,
        active: true,
        services: { some: { tenantId: t, serviceId: s, active: true } },
        OR: [{ primaryUnitId: u }, { units: { some: { tenantId: t, unitId: u, active: true } } }],
      },
      select: { publicId: true },
    });
  }
  public find(t: bigint, id: string) {
    return this.client.appointmentWaitlist.findFirst({
      where: { tenantId: t, publicId: id },
      include: waitlistInclude,
    });
  }
  public list(t: bigint, where: Prisma.AppointmentWaitlistWhereInput) {
    return this.client.appointmentWaitlist.findMany({
      where: { tenantId: t, ...where },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: waitlistInclude,
    });
  }
  public activeDuplicate(t: bigint, c: bigint, s: bigint, u: bigint) {
    return this.client.appointmentWaitlist.findFirst({
      where: {
        tenantId: t,
        customerId: c,
        serviceId: s,
        unitId: u,
        status: { in: ['WAITING', 'MATCHED'] },
      },
    });
  }
  public create(data: Prisma.AppointmentWaitlistUncheckedCreateInput) {
    return this.client.appointmentWaitlist.create({ data, include: waitlistInclude });
  }
  public update(id: bigint, data: Prisma.AppointmentWaitlistUncheckedUpdateInput) {
    return this.client.appointmentWaitlist.update({
      where: { id },
      data,
      include: waitlistInclude,
    });
  }
  public appointment(t: bigint, publicId: string) {
    return this.client.appointment.findFirst({
      where: { tenantId: t, publicId },
      select: { id: true },
    });
  }
  public expire(t: bigint, now: Date) {
    return this.client.appointmentWaitlist.updateMany({
      where: { tenantId: t, status: { in: ['WAITING', 'MATCHED'] }, expiresAt: { lte: now } },
      data: { status: 'EXPIRED', opportunityId: null },
    });
  }
  public audit(data: Prisma.AuditLogUncheckedCreateInput) {
    return this.client.auditLog.create({ data });
  }
  public async createAndClaimOpportunity(t: bigint, appointmentId: bigint) {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        return await this.createAndClaimOpportunityOnce(t, appointmentId);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < 5
        ) {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, attempt * 10);
          });
          continue;
        }
        throw error;
      }
    }
    throw new Error('O limite de repetições do claim da oportunidade foi excedido.');
  }
  private async createAndClaimOpportunityOnce(t: bigint, appointmentId: bigint) {
    return this.client.$transaction(
      async (tx) => {
        const appointment = await tx.appointment.findFirst({
          where: { id: appointmentId, tenantId: t, status: 'CANCELED', unitId: { not: null } },
        });
        if (appointment?.unitId === null || appointment === null) return null;
        const tenant = await tx.tenant.findUniqueOrThrow({
          where: { id: t },
          select: { timezone: true },
        });
        const opportunity = await tx.appointmentWaitlistOpportunity.upsert({
          where: { releasedAppointmentId: appointment.id },
          update: {},
          create: {
            publicId: randomUUID(),
            tenantId: t,
            releasedAppointmentId: appointment.id,
            professionalId: appointment.professionalId,
            serviceId: appointment.serviceId,
            unitId: appointment.unitId,
            startsAt: appointment.startsAt,
          },
        });
        const candidates = await tx.appointmentWaitlist.findMany({
          where: {
            tenantId: t,
            status: 'WAITING',
            expiresAt: { gt: new Date() },
            serviceId: opportunity.serviceId,
            unitId: opportunity.unitId,
            OR: [{ professionalId: opportunity.professionalId }, { professionalId: null }],
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        const parts = localParts(opportunity.startsAt, tenant.timezone);
        const hhmm = `${parts.hour ?? '00'}:${parts.minute ?? '00'}`;
        const opportunityDate = `${parts.year ?? '0000'}-${parts.month ?? '01'}-${parts.day ?? '01'}`;
        const candidate = candidates.find(
          (item) =>
            item.preferredDateFrom.toISOString().slice(0, 10) <= opportunityDate &&
            item.preferredDateTo.toISOString().slice(0, 10) >= opportunityDate &&
            item.preferredTimeStart <= hhmm &&
            item.preferredTimeEnd >= hhmm,
        );
        if (candidate === undefined) return null;
        const claimed = await tx.appointmentWaitlistOpportunity.updateMany({
          where: { id: opportunity.id, claimedAt: null },
          data: { claimedAt: new Date() },
        });
        if (claimed.count !== 1) return null;
        await tx.appointmentWaitlist.update({
          where: { id: candidate.id },
          data: { status: 'MATCHED', matchedAt: new Date(), opportunityId: opportunity.id },
        });
        await tx.auditLog.create({
          data: {
            publicId: randomUUID(),
            tenantId: t,
            action: 'appointment_waitlist.matched',
            targetType: 'appointment_waitlist',
            targetPublicId: candidate.publicId,
          },
        });
        return candidate.publicId;
      },
      { isolationLevel: 'Serializable' },
    );
  }
  public async withConversionLock<T>(
    t: bigint,
    waitlistId: bigint,
    operation: () => Promise<T>,
  ): Promise<T | null> {
    return this.client.$transaction(
      async (tx) => {
        const lockName = `waitlist-convert:${t.toString()}:${waitlistId.toString()}`;
        const lock = await tx.$queryRaw<
          { acquired: number | bigint | null }[]
        >`SELECT GET_LOCK(${lockName}, 5) AS acquired`;
        if (lock[0]?.acquired !== 1 && lock[0]?.acquired !== 1n) return null;
        try {
          return await operation();
        } finally {
          await tx.$queryRaw`SELECT RELEASE_LOCK(${lockName})`;
        }
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
  }
}
