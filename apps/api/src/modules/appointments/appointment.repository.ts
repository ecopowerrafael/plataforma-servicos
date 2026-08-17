import { type Prisma, type PrismaClient } from '../../database-client/client.js';
import { PlanEntitlementService } from '../tenants/plan-entitlement.service.js';
const include = {
  customer: { select: { publicId: true, name: true, phone: true } },
  professional: { select: { publicId: true, publicName: true } },
  service: { select: { publicId: true, name: true } },
  unit: { select: { publicId: true, name: true } },
  treatmentPlan: { select: { publicId: true } },
} as const;
export class AppointmentRepository {
  constructor(private readonly client: PrismaClient) {}
  customer(t: bigint, id: string) {
    return this.client.customer.findFirst({
      where: { tenantId: t, publicId: id, status: 'ACTIVE' },
    });
  }
  professional(t: bigint, id: string) {
    return this.client.professional.findFirst({
      where: { tenantId: t, publicId: id, active: true },
    });
  }
  service(t: bigint, id: string) {
    return this.client.service.findFirst({ where: { tenantId: t, publicId: id, active: true } });
  }
  /** Plano de uma sessão já agendada, para recalcular o progresso. */
  planIdOf(t: bigint, appointmentId: bigint) {
    return this.client.appointment.findFirst({
      where: { tenantId: t, id: appointmentId },
      select: { treatmentPlanId: true },
    });
  }
  unit(t: bigint, id: string) {
    return this.client.businessUnit.findFirst({
      where: { tenantId: t, publicId: id, status: 'ACTIVE' },
    });
  }
  link(t: bigint, p: bigint, s: bigint) {
    return this.client.professionalService.findFirst({
      where: { tenantId: t, professionalId: p, serviceId: s, active: true },
    });
  }
  find(t: bigint, id: string) {
    return this.client.appointment.findFirst({ where: { tenantId: t, publicId: id }, include });
  }
  list(
    t: bigint,
    where: Prisma.AppointmentWhereInput,
    orderBy: Prisma.AppointmentOrderByWithRelationInput = { startsAt: 'asc' },
    pagination?: { skip: number; take: number },
  ) {
    return this.client.appointment.findMany({
      where: { tenantId: t, ...where },
      orderBy,
      include,
      ...(pagination ?? {}),
    });
  }
  count(t: bigint, where: Prisma.AppointmentWhereInput) {
    return this.client.appointment.count({ where: { tenantId: t, ...where } });
  }
  conflict(t: bigint, p: bigint, start: Date, end: Date, except?: bigint) {
    return this.client.appointment.findFirst({
      where: {
        tenantId: t,
        professionalId: p,
        status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
        startsAt: { lt: end },
        endsAt: { gt: start },
        ...(except === undefined ? {} : { id: { not: except } }),
      },
    });
  }
  create(data: Prisma.AppointmentUncheckedCreateInput) {
    return this.client.appointment.create({ data, include });
  }
  async createIfAvailable(data: Omit<Prisma.AppointmentUncheckedCreateInput, 'protocol'>) {
    return this.client.$transaction(
      async (transaction) => {
        const lockName = `appointment:${data.tenantId.toString()}:${data.professionalId.toString()}`;
        const lock = await transaction.$queryRaw<{ acquired: number | bigint | null }[]>`
        SELECT GET_LOCK(${lockName}, 5) AS acquired
      `;
        if (lock[0]?.acquired !== 1 && lock[0]?.acquired !== 1n) return null;
        try {
          await new PlanEntitlementService().assertCanCreateAppointment(transaction, BigInt(data.tenantId));
          const conflict = await transaction.appointment.findFirst({
            where: {
              tenantId: data.tenantId,
              professionalId: data.professionalId,
              status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
              startsAt: { lt: data.endsAt },
              endsAt: { gt: data.startsAt },
            },
          });
          if (conflict !== null) return null;
          const protocolLockName = `appointment-protocol:${data.tenantId.toString()}`;
          const protocolLock = await transaction.$queryRaw<{ acquired: number | bigint | null }[]>`
          SELECT GET_LOCK(${protocolLockName}, 5) AS acquired
        `;
          if (protocolLock[0]?.acquired !== 1 && protocolLock[0]?.acquired !== 1n) return null;
          try {
            const count = await transaction.appointment.count({
              where: { tenantId: data.tenantId },
            });
            const protocol = `AGD-${String(count + 1).padStart(6, '0')}`;
            return await transaction.appointment.create({ data: { ...data, protocol }, include });
          } finally {
            await transaction.$queryRaw`SELECT RELEASE_LOCK(${protocolLockName})`;
          }
        } finally {
          await transaction.$queryRaw`SELECT RELEASE_LOCK(${lockName})`;
        }
      },
      { isolationLevel: 'Serializable' },
    );
  }
  update(id: bigint, data: Prisma.AppointmentUncheckedUpdateInput) {
    return this.client.appointment.update({ where: { id }, data, include });
  }
  async updateIfAvailable(
    id: bigint,
    tenantId: bigint,
    professionalId: bigint,
    start: Date,
    end: Date,
    data: Prisma.AppointmentUncheckedUpdateInput,
  ) {
    return this.client.$transaction(
      async (transaction) => {
        const lockName = `appointment:${tenantId.toString()}:${professionalId.toString()}`;
        const lock = await transaction.$queryRaw<{ acquired: number | bigint | null }[]>`
        SELECT GET_LOCK(${lockName}, 5) AS acquired
      `;
        if (lock[0]?.acquired !== 1 && lock[0]?.acquired !== 1n) return null;
        try {
          const conflict = await transaction.appointment.findFirst({
            where: {
              tenantId,
              professionalId,
              status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
              startsAt: { lt: end },
              endsAt: { gt: start },
              id: { not: id },
            },
          });
          if (conflict !== null) return null;
          return await transaction.appointment.update({ where: { id }, data, include });
        } finally {
          await transaction.$queryRaw`SELECT RELEASE_LOCK(${lockName})`;
        }
      },
      { isolationLevel: 'Serializable' },
    );
  }
  audit(data: Prisma.AuditLogUncheckedCreateInput) {
    return this.client.auditLog.create({ data });
  }
  recordHistory(data: Prisma.AppointmentHistoryEntryUncheckedCreateInput) {
    return this.client.appointmentHistoryEntry.create({ data });
  }
  listHistory(t: bigint, appointmentId: bigint) {
    return this.client.appointmentHistoryEntry.findMany({
      where: { tenantId: t, appointmentId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
