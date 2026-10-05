import { randomUUID } from 'node:crypto';

import { CommissionCycleSchema, type CommissionCycle } from '@plataforma/shared';

import { Prisma, type CommissionCycle as PrismaCommissionCycle, type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { distributeLargestRemainder, type PointShare } from './commission-cycle-allocation.js';
import { commissionPeriodFor } from './commission-cycle-period.js';

interface Actor { userId: bigint | null; sessionId: bigint | null }

type CycleWithAllocations = PrismaCommissionCycle & {
  allocations: Array<{ points: number; amountCents: bigint; professional: { publicId: string } }>;
};

const include = { allocations: { include: { professional: { select: { publicId: true } } }, orderBy: { professionalId: 'asc' as const } } } as const;

function configured(settings: { commissionTeamPercentBps: number | null; commissionClosingDay: number | null; commissionEffectiveFrom: Date | null }): { commissionTeamPercentBps: number; commissionClosingDay: number; commissionEffectiveFrom: Date } {
  if (settings.commissionTeamPercentBps === null || settings.commissionClosingDay === null || settings.commissionEffectiveFrom === null) {
    throw new AppError({ code: 'COMMISSION_CYCLE_NOT_CONFIGURED', message: 'Configure percentual, dia de fechamento e início da comissão.', statusCode: 409 });
  }
  return { commissionTeamPercentBps: settings.commissionTeamPercentBps, commissionClosingDay: settings.commissionClosingDay, commissionEffectiveFrom: settings.commissionEffectiveFrom };
}

function publicCycle(cycle: CycleWithAllocations, now: Date, preview?: { revenue: bigint; points: PointShare[]; publicIds: Map<bigint, string> }) {
  const revenue = cycle.status === 'CLOSED' ? cycle.eligibleRevenueCents : (preview?.revenue ?? 0n);
  const points = cycle.status === 'CLOSED' ? cycle.totalPoints : (preview?.points.reduce((sum, item) => sum + item.points, 0) ?? 0);
  const pool = cycle.status === 'CLOSED' ? cycle.poolCents : revenue * BigInt(cycle.teamPercentBps) / 10000n;
  const allocations = cycle.status === 'CLOSED'
    ? cycle.allocations.map((item) => ({ professionalPublicId: item.professional.publicId, points: item.points, amountCents: item.amountCents.toString() }))
    : distributeLargestRemainder(pool, preview?.points ?? []).map((item) => ({ professionalPublicId: preview?.publicIds.get(item.professionalId) ?? '', points: item.points, amountCents: item.amountCents.toString() }));
  return CommissionCycleSchema.parse({
    publicId: cycle.publicId,
    periodStart: cycle.periodStart.toISOString(), periodEnd: cycle.periodEnd.toISOString(), status: cycle.status,
    readyToClose: cycle.status === 'OPEN' && now.getTime() >= cycle.periodEnd.getTime(),
    closingDay: cycle.closingDay, teamPercentBps: cycle.teamPercentBps,
    effectiveFrom: cycle.effectiveFrom?.toISOString() ?? null,
    eligibleRevenueCents: revenue.toString(), poolCents: pool.toString(), totalPoints: points,
    distributedCents: cycle.status === 'CLOSED' ? cycle.distributedCents.toString() : allocations.reduce((sum, item) => sum + BigInt(item.amountCents), 0n).toString(),
    allocations, closedAt: cycle.closedAt?.toISOString() ?? null,
  });
}

export class CommissionCycleService {
  public constructor(private readonly client: PrismaClient) {}

  private async settings(tenantId: bigint) {
    const tenant = await this.client.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true, settings: { select: { commissionTeamPercentBps: true, commissionClosingDay: true, commissionEffectiveFrom: true } } } });
    if (tenant?.settings === null || tenant === null) throw new AppError({ code: 'TENANT_NOT_FOUND', message: 'Estabelecimento não encontrado.', statusCode: 404 });
    return { timezone: tenant.timezone, ...configured(tenant.settings) };
  }

  private async live(cycle: PrismaCommissionCycle, client: PrismaClient = this.client) {
    const [revenue, appointments] = await Promise.all([
      client.payment.aggregate({ where: { tenantId: cycle.tenantId, originType: 'MEMBERSHIP_CHARGE', status: 'PAID', paidAt: { gte: cycle.periodStart, lt: cycle.periodEnd }, amountCents: { gt: 0n } }, _sum: { amountCents: true } }),
      client.appointment.findMany({ where: { tenantId: cycle.tenantId, status: 'COMPLETED', completedAt: { gte: cycle.periodStart, lt: cycle.periodEnd }, chargeSource: { in: ['MEMBERSHIP_INCLUDED', 'MEMBERSHIP_DISCOUNT'] } }, select: { professionalId: true, professional: { select: { publicId: true } } } }),
    ]);
    const grouped = new Map<bigint, number>();
    const publicIds = new Map<bigint, string>();
    for (const appointment of appointments) { grouped.set(appointment.professionalId, (grouped.get(appointment.professionalId) ?? 0) + 1); publicIds.set(appointment.professionalId, appointment.professional.publicId); }
    return { revenue: revenue._sum.amountCents ?? 0n, points: [...grouped].map(([professionalId, points]) => ({ professionalId, points })), publicIds };
  }

  private async createCurrent(tenantId: bigint, now: Date) {
    const config = await this.settings(tenantId);
    const period = commissionPeriodFor(now, config.timezone, config.commissionClosingDay, config.commissionEffectiveFrom);
    if (period === null) throw new AppError({ code: 'COMMISSION_CYCLE_NOT_STARTED', message: 'O ciclo de comissão ainda não começou.', statusCode: 409 });
    try {
      return await this.client.commissionCycle.upsert({
        where: { tenantId_periodStart_periodEnd: { tenantId, periodStart: period.periodStart, periodEnd: period.periodEnd } },
        create: { publicId: randomUUID(), tenantId, periodStart: period.periodStart, periodEnd: period.periodEnd, closingDay: config.commissionClosingDay, teamPercentBps: config.commissionTeamPercentBps, effectiveFrom: config.commissionEffectiveFrom },
        update: {}, include,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.client.commissionCycle.findUnique({ where: { tenantId_periodStart_periodEnd: { tenantId, periodStart: period.periodStart, periodEnd: period.periodEnd } }, include });
        if (existing !== null) return existing;
      }
      throw error;
    }
  }

  public async current(tenantId: bigint, now = new Date()): Promise<CommissionCycle> {
    const cycle = await this.createCurrent(tenantId, now);
    return publicCycle(cycle, now, cycle.status === 'OPEN' ? await this.live(cycle) : undefined);
  }

  public async list(tenantId: bigint, now = new Date()): Promise<{ items: CommissionCycle[] }> {
    await this.createCurrent(tenantId, now);
    const cycles = await this.client.commissionCycle.findMany({ where: { tenantId }, orderBy: { periodStart: 'desc' }, include });
    return { items: await Promise.all(cycles.map(async (cycle) => publicCycle(cycle, now, cycle.status === 'OPEN' ? await this.live(cycle) : undefined))) };
  }

  public async get(tenantId: bigint, publicId: string, now = new Date()): Promise<CommissionCycle> {
    const cycle = await this.client.commissionCycle.findFirst({ where: { tenantId, publicId }, include });
    if (cycle === null) throw new AppError({ code: 'COMMISSION_CYCLE_NOT_FOUND', message: 'Ciclo de comissão não encontrado.', statusCode: 404 });
    return publicCycle(cycle, now, cycle.status === 'OPEN' ? await this.live(cycle) : undefined);
  }

  public async close(tenantId: bigint, publicId: string, actor: Actor, now = new Date()): Promise<CommissionCycle> {
    const run = () => this.client.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`SELECT id FROM commission_cycles WHERE tenant_id = ${tenantId} AND public_id = ${publicId} FOR UPDATE`);
      if (locked.length === 0) throw new AppError({ code: 'COMMISSION_CYCLE_NOT_FOUND', message: 'Ciclo de comissão não encontrado.', statusCode: 404 });
      const cycle = await tx.commissionCycle.findFirst({ where: { tenantId, publicId }, include });
      if (cycle === null) throw new AppError({ code: 'COMMISSION_CYCLE_NOT_FOUND', message: 'Ciclo de comissão não encontrado.', statusCode: 404 });
      if (cycle.status === 'CLOSED') return cycle;
      if (now.getTime() < cycle.periodEnd.getTime()) throw new AppError({ code: 'COMMISSION_CYCLE_NOT_READY', message: 'O período ainda não terminou.', statusCode: 409 });
      const live = await this.live(cycle, tx as unknown as PrismaClient);
      const pool = live.revenue * BigInt(cycle.teamPercentBps) / 10000n;
      const allocations = distributeLargestRemainder(pool, live.points);
      const updated = await tx.commissionCycle.update({ where: { id: cycle.id }, data: { eligibleRevenueCents: live.revenue, poolCents: pool, totalPoints: live.points.reduce((sum, item) => sum + item.points, 0), distributedCents: allocations.reduce((sum, item) => sum + item.amountCents, 0n), status: 'CLOSED', closedAt: now, closedByUserId: actor.userId }, include });
      if (allocations.length > 0) await tx.commissionCycleAllocation.createMany({ data: allocations.map((item) => ({ publicId: randomUUID(), cycleId: cycle.id, professionalId: item.professionalId, points: item.points, amountCents: item.amountCents })) });
      await tx.auditLog.create({ data: { publicId: randomUUID(), tenantId, userId: actor.userId, sessionId: actor.sessionId, action: 'commission_cycle.closed', targetType: 'commission_cycle', targetPublicId: cycle.publicId, metadata: { cyclePublicId: cycle.publicId, periodStart: cycle.periodStart.toISOString(), periodEnd: cycle.periodEnd.toISOString(), teamPercentBps: cycle.teamPercentBps, eligibleRevenueCents: live.revenue.toString(), poolCents: pool.toString(), totalPoints: live.points.reduce((sum, item) => sum + item.points, 0), distributedCents: allocations.reduce((sum, item) => sum + item.amountCents, 0n).toString() } } });
      return { ...updated, allocations: await tx.commissionCycleAllocation.findMany({ where: { cycleId: cycle.id }, include: { professional: { select: { publicId: true } } }, orderBy: { professionalId: 'asc' } }) };
    }, { isolationLevel: 'Serializable' });
    let closed: CycleWithAllocations | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        closed = await run();
        break;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') || attempt === 2) throw error;
      }
    }
    if (closed === undefined) throw new Error('Commission cycle close did not return a result.');
    return publicCycle(closed, now);
  }
}
