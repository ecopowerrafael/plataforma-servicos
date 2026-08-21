import { randomUUID } from 'node:crypto';

import { CollectionAttemptListResponseSchema } from '@plataforma/shared';

import { decideNextAttempt, type AttemptType } from './collection-attempt-engine.js';
import { Prisma, type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { resolveTimezone } from '../tenants/timezone.js';

const TEMPLATE_KEYS: Record<AttemptType, string> = {
  INITIAL_COLLECTION: 'collection.initial',
  SAME_DAY_FOLLOWUP: 'collection.same_day_followup',
  NEXT_DAY_FOLLOWUP: 'collection.next_day_followup',
  CYCLE_RESTART: 'collection.cycle_restart',
};

const pubAttempt = (attempt: {
  publicId: string;
  cycleNumber: number;
  attemptNumber: number;
  attemptType: string;
  status: string;
  scheduledAt: Date;
  templateKey: string;
  sentAt: Date | null;
  respondedAt: Date | null;
  skippedAt: Date | null;
  skipReason: string | null;
  createdAt: Date;
}) => ({
  publicId: attempt.publicId,
  cycleNumber: attempt.cycleNumber,
  attemptNumber: attempt.attemptNumber,
  attemptType: attempt.attemptType,
  status: attempt.status,
  scheduledAt: attempt.scheduledAt.toISOString(),
  templateKey: attempt.templateKey,
  sentAt: attempt.sentAt?.toISOString() ?? null,
  respondedAt: attempt.respondedAt?.toISOString() ?? null,
  skippedAt: attempt.skippedAt?.toISOString() ?? null,
  skipReason: attempt.skipReason,
  createdAt: attempt.createdAt.toISOString(),
});

/**
 * Motor de régua da Fase 3: decide e materializa CollectionAttempt para cada
 * Debt ativa (`status = 'OPEN'`) — nunca envia nada (WhatsApp é Fase 4).
 * Debt pausada/cancelada/paga simplesmente não aparece na query, então
 * pause/resume/cancel (Fase 1) já bastam para suspender a régua.
 */
export class CollectionAttemptEngineService {
  public constructor(private readonly client: PrismaClient) {}

  public async run(now: Date = new Date()): Promise<{ created: number; skipped: number }> {
    const debts = await this.client.debt.findMany({
      where: { status: 'OPEN' },
      select: {
        id: true,
        tenantId: true,
        collectionRule: {
          select: {
            maxAttemptsPerDay: true,
            consecutiveDays: true,
            pauseDaysAfterCycle: true,
            maxCycles: true,
            allowedStartHour: true,
            allowedEndHour: true,
            skipSundays: true,
          },
        },
        tenant: { select: { timezone: true } },
      },
      orderBy: { id: 'asc' },
    });

    let created = 0;
    let skipped = 0;

    for (const debt of debts) {
      const existingAttempts = await this.client.collectionAttempt.findMany({
        // PROMISE_DUE/PROMISE_OVERDUE (Fase 5) usam cycleNumber 0, fora da
        // numeração da régua — excluídos para não contaminar o cálculo de
        // início de ciclo.
        where: { debtId: debt.id, attemptType: { notIn: ['PROMISE_DUE', 'PROMISE_OVERDUE'] } },
        orderBy: { id: 'asc' },
        select: { cycleNumber: true, scheduledAt: true },
      });

      const decision = decideNextAttempt({
        rule: debt.collectionRule,
        existingAttempts,
        now,
        timezone: resolveTimezone(debt.tenant.timezone),
      });

      if (decision.action === 'skip') {
        skipped += 1;
        continue;
      }

      try {
        await this.client.collectionAttempt.create({
          data: {
            publicId: randomUUID(),
            tenantId: debt.tenantId,
            debtId: debt.id,
            cycleNumber: decision.cycleNumber,
            attemptNumber: decision.attemptNumber,
            attemptType: decision.attemptType,
            scheduledAt: now,
            status: 'SCHEDULED',
            templateKey: TEMPLATE_KEYS[decision.attemptType],
          },
        });
        created += 1;
      } catch (error) {
        // Corrida entre execuções do worker: a constraint única
        // (debtId, cycleNumber, attemptNumber) já protegeu — não é erro real.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          skipped += 1;
          continue;
        }
        throw error;
      }
    }

    return { created, skipped };
  }

  public async listForDebt(tenantId: bigint, debtPublicId: string) {
    const debt = await this.client.debt.findFirst({
      where: { tenantId, publicId: debtPublicId },
      select: { id: true },
    });
    if (debt === null)
      throw new AppError({ code: 'DEBT_NOT_FOUND', message: 'Dívida não encontrada.', statusCode: 404 });

    const attempts = await this.client.collectionAttempt.findMany({
      where: { tenantId, debtId: debt.id },
      orderBy: { id: 'desc' },
    });
    return CollectionAttemptListResponseSchema.parse({ items: attempts.map(pubAttempt) });
  }
}
