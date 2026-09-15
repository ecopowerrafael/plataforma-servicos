import { type Prisma, type PrismaClient } from '../../database-client/client.js';

export class AvailabilityRepository {
  public constructor(private readonly client: PrismaClient) {}

  public context(tenantId: bigint, professionalPublicId: string, servicePublicId: string) {
    return this.client.tenant.findUnique({
      where: { id: tenantId },
      select: {
        timezone: true,
        settings: {
          select: {
            defaultAppointmentIntervalMinutes: true,
            minimumAdvanceMinutes: true,
            maximumAdvanceDays: true,
          },
        },
        professionals: {
          where: { publicId: professionalPublicId },
          select: { id: true, publicId: true, active: true },
        },
        services: {
          where: { publicId: servicePublicId },
          select: {
            id: true,
            active: true,
            durationMinutes: true,
            hasPostServiceBreak: true,
            postServiceBreakMinutes: true,
          },
        },
      },
    });
  }
  public tenant(tenantId: bigint, professionalPublicId: string) {
    return this.client.tenant.findUnique({
      where: { id: tenantId },
      select: {
        timezone: true,
        settings: {
          select: {
            defaultAppointmentIntervalMinutes: true,
            minimumAdvanceMinutes: true,
            maximumAdvanceDays: true,
          },
        },
        professionals: {
          where: { publicId: professionalPublicId },
          select: { id: true, publicId: true, active: true },
        },
      },
    });
  }
  public combo(tenantId: bigint, comboPublicId: string) {
    return this.client.combo.findFirst({
      where: { tenantId, publicId: comboPublicId },
      include: {
        items: {
          include: { service: true },
        },
      },
    });
  }
  public link(tenantId: bigint, professionalId: bigint, serviceId: bigint) {
    return this.client.professionalService.findFirst({
      where: { tenantId, professionalId, serviceId },
    });
  }
  public unit(tenantId: bigint, unitPublicId: string) {
    return this.client.businessUnit.findFirst({
      where: { tenantId, publicId: unitPublicId },
      select: { id: true },
    });
  }
  public operatingHours(tenantId: bigint, unitId: bigint) {
    return this.client.businessUnitOperatingHours.findMany({
      where: { tenantId, unitId },
      select: { weekday: true, startsAt: true, endsAt: true, active: true },
    });
  }
  public dateOverrides(tenantId: bigint, unitId: bigint, date: Date) {
    return this.client.businessUnitDateOverride.findMany({
      where: { tenantId, unitId, date, active: true },
      select: { type: true, closed: true, startsAt: true, endsAt: true },
    });
  }
  public schedule(
    tenantId: bigint,
    professionalId: bigint,
    weekday: number,
    unitPublicId?: string,
  ) {
    return this.client.professionalWorkSchedule.findMany({
      where: {
        tenantId,
        professionalId,
        weekday,
        active: true,
        ...(unitPublicId === undefined
          ? {}
          : { OR: [{ unit: { publicId: unitPublicId } }, { unitId: null }] }),
      },
      orderBy: { startsAt: 'asc' },
    });
  }
  public unavailabilities(
    tenantId: bigint,
    professionalId: bigint,
    from: Date,
    to: Date,
    unitPublicId?: string,
  ) {
    return this.client.professionalUnavailability.findMany({
      where: {
        tenantId,
        professionalId,
        active: true,
        startsAt: { lte: to },
        OR: [{ endsAt: { gt: from } }, { repeatsWeekly: true, recurrenceEndsAt: { gte: from } }],
        ...(unitPublicId === undefined
          ? {}
          : { OR: [{ unit: { publicId: unitPublicId } }, { unitId: null }] }),
      },
      orderBy: { startsAt: 'asc' },
    });
  }
  public appointments(
    tenantId: bigint,
    professionalId: bigint,
    from: Date,
    to: Date,
    excludeAppointmentId?: bigint,
  ) {
    return this.client.appointment.findMany({
      where: {
        tenantId,
        professionalId,
        status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
        startsAt: { lt: to },
        endsAt: { gt: from },
        ...(excludeAppointmentId === undefined ? {} : { id: { not: excludeAppointmentId } }),
      },
      select: { startsAt: true, endsAt: true },
    });
  }
  public audit(data: Prisma.AuditLogUncheckedCreateInput) {
    return this.client.auditLog.create({ data });
  }
}
