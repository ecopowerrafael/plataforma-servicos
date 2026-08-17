import { type Prisma, type PrismaClient } from '../../database-client/client.js';

const include = {
  customer: { select: { publicId: true, name: true } },
  service: { select: { publicId: true, name: true } },
  professional: { select: { publicId: true, publicName: true } },
  originAppointment: { select: { publicId: true } },
  sessions: {
    orderBy: { sessionNumber: 'asc' },
    select: {
      id: true,
      publicId: true,
      sessionNumber: true,
      startsAt: true,
      status: true,
      priceCents: true,
    },
  },
} as const;

export type TreatmentPlanRecord = Prisma.TreatmentPlanGetPayload<{ include: typeof include }>;

export class TreatmentPlanRepository {
  public constructor(private readonly client: PrismaClient) {}

  public find(tenantId: bigint, publicId: string) {
    return this.client.treatmentPlan.findFirst({ where: { tenantId, publicId }, include });
  }

  public findByOriginAppointment(tenantId: bigint, appointmentId: bigint) {
    return this.client.treatmentPlan.findFirst({
      where: { tenantId, originAppointmentId: appointmentId },
      include,
    });
  }

  public list(tenantId: bigint, where: Prisma.TreatmentPlanWhereInput) {
    return this.client.treatmentPlan.findMany({
      where: { tenantId, ...where },
      orderBy: { createdAt: 'desc' },
      include,
    });
  }

  public create(data: Prisma.TreatmentPlanUncheckedCreateInput) {
    return this.client.treatmentPlan.create({ data, include });
  }

  public update(id: bigint, data: Prisma.TreatmentPlanUncheckedUpdateInput) {
    return this.client.treatmentPlan.update({ where: { id }, data, include });
  }

  /** Avaliação de origem: precisa existir, ser do tenant e ser do tipo avaliação. */
  public evaluationAppointment(tenantId: bigint, publicId: string) {
    return this.client.appointment.findFirst({
      where: { tenantId, publicId },
      select: {
        id: true,
        kind: true,
        status: true,
        customerId: true,
        serviceId: true,
        professionalId: true,
        service: { select: { pricingMode: true } },
      },
    });
  }

  /** Total confirmado nas sessões do plano — só `Payment.status = PAID`. */
  public async paidCentsByAppointment(tenantId: bigint, appointmentIds: bigint[]) {
    const paid = new Map<bigint, bigint>();
    if (appointmentIds.length === 0) return paid;
    const grouped = await this.client.payment.groupBy({
      by: ['appointmentId'],
      where: { tenantId, appointmentId: { in: appointmentIds }, status: 'PAID' },
      _sum: { amountCents: true },
    });
    for (const entry of grouped) paid.set(entry.appointmentId, entry._sum.amountCents ?? 0n);
    return paid;
  }

  /**
   * Serializa a numeração das sessões de um plano: sem isso, dois pedidos
   * simultâneos leriam o mesmo "maior número vivo" e criariam duas sessões com
   * o mesmo número. É o mesmo mecanismo já usado na criação de agendamentos.
   */
  public async withPlanLock<T>(planPublicId: string, run: () => Promise<T>): Promise<T> {
    const lockName = `treatment-plan:${planPublicId}`;
    const lock = await this.client.$queryRaw<{ acquired: number | bigint | null }[]>`
      SELECT GET_LOCK(${lockName}, 5) AS acquired
    `;
    // Sem o lock a operação segue: perder a corrida é raro e não pode travar
    // o agendamento — o pior caso volta a ser o comportamento sem trava.
    if (lock[0]?.acquired !== 1 && lock[0]?.acquired !== 1n) return run();
    try {
      return await run();
    } finally {
      await this.client.$queryRaw`SELECT RELEASE_LOCK(${lockName})`;
    }
  }

  public audit(data: Prisma.AuditLogUncheckedCreateInput) {
    return this.client.auditLog.create({ data });
  }
}
