import { randomUUID } from 'node:crypto';

import {
  ProfessionalPayoutSettlementSchema,
  type ProfessionalPayoutCancel,
  type ProfessionalPayoutCreate,
  type ProfessionalPayoutSettlement,
} from '@plataforma/shared';
import { Prisma, type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';

interface Actor { userId: bigint | null; sessionId: bigint | null }

const CLOSED = 'CLOSED' as const;
const CASH_REQUIRED = 'Caixa fechado, abra o caixa para fazer movimentação financeira.';

function payoutStatus(paid: bigint, due: bigint): 'PENDING' | 'PARTIALLY_PAID' | 'PAID' {
  if (paid === 0n) return 'PENDING';
  if (paid === due) return 'PAID';
  return 'PARTIALLY_PAID';
}

function samePayload(existing: { amountCents: bigint; paidAt: Date; method: string; note: string | null }, input: ProfessionalPayoutCreate): boolean {
  return existing.amountCents === BigInt(input.amountCents)
    && existing.paidAt.getTime() === new Date(input.paidAt).getTime()
    && existing.method === input.method
    && (existing.note ?? null) === (input.note ?? null);
}

export class ProfessionalPayoutService {
  public constructor(private readonly client: PrismaClient) {}

  private async currentRegister(tx: Prisma.TransactionClient, tenantId: bigint) {
    // Reutiliza exatamente a regra do CashRegisterService.getOpen sem unidade:
    // somente o caixa global do tenant (`unitId = null`) é o caixa atual para
    // uma comissão que não carrega contexto de unidade.
    const register = await tx.cashRegister.findFirst({
      where: { tenantId, unitId: null, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
      select: { id: true },
    });
    if (register === null) {
      throw new AppError({ code: 'PROFESSIONAL_PAYOUT_OPEN_CASH_REGISTER_REQUIRED', message: CASH_REQUIRED, statusCode: 409 });
    }
    return register.id;
  }

  private async settlement(tx: Prisma.TransactionClient, tenantId: bigint, allocationPublicId: string): Promise<ProfessionalPayoutSettlement> {
    const allocation = await tx.commissionCycleAllocation.findFirst({
      where: { publicId: allocationPublicId, cycle: { tenantId } },
      include: { professional: { select: { publicId: true, name: true } } },
    });
    if (allocation === null) throw new AppError({ code: 'COMMISSION_CYCLE_ALLOCATION_NOT_FOUND', message: 'Rateio de comissão não encontrado.', statusCode: 404 });
    const payouts = await tx.professionalPayout.findMany({ where: { tenantId, commissionCycleAllocationId: allocation.id }, orderBy: { createdAt: 'desc' } });
    const paid = payouts.filter((item) => item.status === 'ACTIVE').reduce((sum, item) => sum + item.amountCents, 0n);
    const due = allocation.amountCents;
    return ProfessionalPayoutSettlementSchema.parse({
      allocationPublicId: allocation.publicId,
      professionalPublicId: allocation.professional.publicId,
      professionalName: allocation.professional.name,
      dueCents: due.toString(), paidCents: paid.toString(), outstandingCents: (due - paid).toString(), paymentStatus: payoutStatus(paid, due),
      payouts: payouts.map((item) => ({ publicId: item.publicId, amountCents: item.amountCents.toString(), paidAt: item.paidAt.toISOString(), method: item.method, note: item.note, status: item.status, canceledAt: item.canceledAt?.toISOString() ?? null, canceledReason: item.canceledReason })),
    });
  }

  public async list(tenantId: bigint, allocationPublicId: string) {
    return this.client.$transaction((tx) => this.settlement(tx, tenantId, allocationPublicId));
  }

  public async listForProfessionalCycle(tenantId: bigint, professionalId: bigint, cyclePublicId: string) {
    const allocation = await this.client.commissionCycleAllocation.findFirst({ where: { professionalId, cycle: { tenantId, publicId: cyclePublicId } }, select: { publicId: true } });
    if (allocation === null) throw new AppError({ code: 'COMMISSION_CYCLE_ALLOCATION_NOT_FOUND', message: 'Rateio de comissão não encontrado.', statusCode: 404 });
    return this.list(tenantId, allocation.publicId);
  }

  public async create(tenantId: bigint, allocationPublicId: string, input: ProfessionalPayoutCreate, actor: Actor): Promise<ProfessionalPayoutSettlement> {
    const amount = BigInt(input.amountCents);
    const paidAt = new Date(input.paidAt);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.client.$transaction(async (tx) => {
          const locked = await tx.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`SELECT a.id FROM commission_cycle_allocations a INNER JOIN commission_cycles c ON c.id = a.cycle_id WHERE a.public_id = ${allocationPublicId} AND c.tenant_id = ${tenantId} AND c.status = ${CLOSED} FOR UPDATE`);
          if (locked.length === 0) {
            const allocation = await tx.commissionCycleAllocation.findFirst({ where: { publicId: allocationPublicId, cycle: { tenantId } }, select: { cycle: { select: { status: true } } } });
            if (allocation === null) throw new AppError({ code: 'COMMISSION_CYCLE_ALLOCATION_NOT_FOUND', message: 'Rateio de comissão não encontrado.', statusCode: 404 });
            throw new AppError({ code: 'PROFESSIONAL_PAYOUT_CYCLE_NOT_CLOSED', message: 'O ciclo de comissão precisa estar fechado para registrar o pagamento.', statusCode: 409 });
          }
          const allocation = await tx.commissionCycleAllocation.findUniqueOrThrow({ where: { id: locked[0]!.id } });
          const existing = await tx.professionalPayout.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: input.idempotencyKey } } });
          if (existing !== null) {
            if (!samePayload(existing, input)) throw new AppError({ code: 'PROFESSIONAL_PAYOUT_IDEMPOTENCY_CONFLICT', message: 'A chave de idempotência já foi usada com outro pagamento.', statusCode: 409 });
            return this.settlement(tx, tenantId, allocationPublicId);
          }
          const aggregate = await tx.professionalPayout.aggregate({ where: { tenantId, commissionCycleAllocationId: allocation.id, status: 'ACTIVE' }, _sum: { amountCents: true } });
          const paid = aggregate._sum.amountCents ?? 0n;
          if (amount <= 0n) throw new AppError({ code: 'PROFESSIONAL_PAYOUT_INVALID_AMOUNT', message: 'O valor do pagamento deve ser maior que zero.', statusCode: 409 });
          if (amount > allocation.amountCents - paid) throw new AppError({ code: 'PROFESSIONAL_PAYOUT_EXCEEDS_ALLOCATION', message: 'O valor do pagamento excede o saldo devido do rateio.', statusCode: 409 });
          const cashRegisterId = await this.currentRegister(tx, tenantId);
          const payout = await tx.professionalPayout.create({ data: { publicId: randomUUID(), tenantId, professionalId: allocation.professionalId, commissionCycleAllocationId: allocation.id, amountCents: amount, paidAt, method: input.method, note: input.note ?? null, idempotencyKey: input.idempotencyKey, createdByUserId: actor.userId, createdBySessionId: actor.sessionId } });
          await tx.cashMovement.create({ data: { publicId: randomUUID(), tenantId, cashRegisterId, type: 'MANUAL', direction: 'OUT', amountCents: amount, reason: 'Repasse de comissão para profissional', userId: actor.userId, sessionId: actor.sessionId, professionalPayoutId: payout.id } });
          await tx.auditLog.create({ data: { publicId: randomUUID(), tenantId, userId: actor.userId, sessionId: actor.sessionId, action: 'professional_payout.recorded', targetType: 'professional_payout', targetPublicId: payout.publicId, metadata: { payoutPublicId: payout.publicId, allocationPublicId, professionalId: allocation.professionalId.toString(), amountCents: amount.toString(), method: input.method, paidAt: paidAt.toISOString() } } });
          return this.settlement(tx, tenantId, allocationPublicId);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2034' || error.code === 'P2002') && attempt < 2) continue;
        throw error;
      }
    }
    throw new Error('Unreachable transaction retry state');
  }

  public async cancel(tenantId: bigint, payoutPublicId: string, input: ProfessionalPayoutCancel, actor: Actor): Promise<ProfessionalPayoutSettlement> {
    return this.client.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`SELECT id FROM professional_payouts WHERE tenant_id = ${tenantId} AND public_id = ${payoutPublicId} FOR UPDATE`);
      const payout = locked.length === 0 ? null : await tx.professionalPayout.findUnique({ where: { id: locked[0]!.id }, include: { allocation: true } });
      if (payout === null) throw new AppError({ code: 'PROFESSIONAL_PAYOUT_NOT_FOUND', message: 'Repasse de comissão não encontrado.', statusCode: 404 });
      if (payout.status === 'CANCELED') return this.settlement(tx, tenantId, payout.allocation.publicId);
      const cashRegisterId = await this.currentRegister(tx, tenantId);
      await tx.cashMovement.create({ data: { publicId: randomUUID(), tenantId, cashRegisterId, type: 'MANUAL', direction: 'IN', amountCents: payout.amountCents, reason: 'Estorno de repasse de comissão para profissional', userId: actor.userId, sessionId: actor.sessionId, professionalPayoutId: payout.id } });
      await tx.professionalPayout.update({ where: { id: payout.id }, data: { status: 'CANCELED', canceledAt: new Date(), canceledReason: input.reason } });
      await tx.auditLog.create({ data: { publicId: randomUUID(), tenantId, userId: actor.userId, sessionId: actor.sessionId, action: 'professional_payout.canceled', targetType: 'professional_payout', targetPublicId: payout.publicId, metadata: { payoutPublicId: payout.publicId, allocationPublicId: payout.allocation.publicId, professionalId: payout.professionalId.toString(), amountCents: payout.amountCents.toString(), method: payout.method, paidAt: payout.paidAt.toISOString() } } });
      return this.settlement(tx, tenantId, payout.allocation.publicId);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
