import { randomUUID } from 'node:crypto';

import { type DebtService } from './debt.service.js';
import { Prisma, type PrismaClient } from '../../database-client/client.js';
import { resolveTimezone, zonedDayKey } from '../tenants/timezone.js';

/**
 * Fase 5: cria/substitui promessas de pagamento e varre as ativas (`sweep`)
 * para lembrar no dia combinado (PROMISE_DUE) ou retomar a régua quando a
 * promessa vence sem pagamento (PROMISE_OVERDUE). Os CollectionAttempt
 * criados aqui usam cycleNumber 0 — reservado, a régua da Fase 3 nunca usa
 * esse valor — para não interferir na numeração de ciclo do motor.
 *
 * Fechamento de consistência: cada decisão (criar/substituir promessa;
 * lembrete do dia; virada para vencida) é uma única transação — não pode
 * parar no meio e deixar o claim feito sem o efeito que ele autorizava.
 */
export class PaymentPromiseService {
  public constructor(
    private readonly client: PrismaClient,
    private readonly debts: DebtService,
  ) {}

  public async createOrReplace(
    tenantId: bigint,
    debtId: bigint,
    promisedDate: Date,
    source: 'WHATSAPP' | 'MANUAL',
  ): Promise<{ publicId: string }> {
    return this.client.$transaction(async (tx) => {
      await tx.paymentPromise.updateMany({
        where: { tenantId, debtId, status: 'ACTIVE' },
        data: { status: 'REPLACED' },
      });
      const created = await tx.paymentPromise.create({
        data: { publicId: randomUUID(), tenantId, debtId, promisedDate, status: 'ACTIVE', source },
      });
      await this.debts.markPromiseScheduled(tenantId, debtId, tx);
      await tx.collectionAttempt.updateMany({
        where: { tenantId, debtId, status: 'SCHEDULED' },
        data: { status: 'CANCELED', skippedAt: new Date(), skipReason: 'PROMISE_SCHEDULED' },
      });
      return { publicId: created.publicId };
    });
  }

  public async sweep(now: Date = new Date()): Promise<{ dueReminders: number; overdue: number }> {
    const activePromises = await this.client.paymentPromise.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        tenantId: true,
        debtId: true,
        promisedDate: true,
        dueReminderSentAt: true,
        tenant: { select: { timezone: true } },
      },
      orderBy: { id: 'asc' },
    });

    let dueReminders = 0;
    let overdue = 0;

    for (const promise of activePromises) {
      const timezone = resolveTimezone(promise.tenant.timezone);
      const todayKey = zonedDayKey(now, timezone);
      const promisedKey = zonedDayKey(promise.promisedDate, 'UTC');

      try {
        if (promisedKey === todayKey) {
          if (promise.dueReminderSentAt !== null) continue;
          const processed = await this.processDueReminder(promise.id, promise.tenantId, promise.debtId, now);
          if (processed) dueReminders += 1;
          continue;
        }

        if (promisedKey < todayKey) {
          const processed = await this.processOverdue(promise.id, promise.tenantId, promise.debtId, now);
          if (processed) overdue += 1;
        }
      } catch {
        // A transação da promessa (claim + efeitos) reverteu inteira — nada
        // ficou pela metade. Não deixa a falha de uma promessa derrubar as
        // demais; a próxima rodada do sweep tenta de novo normalmente.
      }
    }

    return { dueReminders, overdue };
  }

  /**
   * Claim (dueReminderSentAt) + criação do CollectionAttempt na mesma
   * transação: se a criação falhar, o claim é desfeito e o lembrete continua
   * pendente para a próxima rodada do sweep, em vez de ficar perdido.
   */
  private async processDueReminder(
    promiseId: bigint,
    tenantId: bigint,
    debtId: bigint,
    now: Date,
  ): Promise<boolean> {
    return this.client.$transaction(async (tx) => {
      const claimed = await tx.paymentPromise.updateMany({
        where: { id: promiseId, dueReminderSentAt: null },
        data: { dueReminderSentAt: now },
      });
      if (claimed.count !== 1) return false;
      await this.createPromiseAttempt(tx, tenantId, debtId, 'PROMISE_DUE', 'collection.promise_due', now);
      return true;
    });
  }

  /**
   * Claim (status ACTIVE -> OVERDUE) + Debt de volta a OPEN + criação do
   * CollectionAttempt na mesma transação: mesma garantia — nenhuma falha
   * intermediária deixa a promessa OVERDUE com a Debt ainda PROMISE_SCHEDULED
   * (ou vice-versa).
   */
  private async processOverdue(promiseId: bigint, tenantId: bigint, debtId: bigint, now: Date): Promise<boolean> {
    return this.client.$transaction(async (tx) => {
      const claimed = await tx.paymentPromise.updateMany({
        where: { id: promiseId, status: 'ACTIVE' },
        data: { status: 'OVERDUE' },
      });
      if (claimed.count !== 1) return false;
      await this.debts.resumeAfterPromiseOverdue(tenantId, debtId, tx);
      await this.createPromiseAttempt(tx, tenantId, debtId, 'PROMISE_OVERDUE', 'collection.promise_overdue', now);
      return true;
    });
  }

  private async createPromiseAttempt(
    client: PrismaClient | Prisma.TransactionClient,
    tenantId: bigint,
    debtId: bigint,
    attemptType: 'PROMISE_DUE' | 'PROMISE_OVERDUE',
    templateKey: string,
    now: Date,
  ): Promise<void> {
    const cycleZeroCount = await client.collectionAttempt.count({
      where: { debtId, cycleNumber: 0 },
    });
    try {
      await client.collectionAttempt.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          debtId,
          cycleNumber: 0,
          attemptNumber: cycleZeroCount + 1,
          attemptType,
          scheduledAt: now,
          status: 'SCHEDULED',
          templateKey,
        },
      });
    } catch (error) {
      // Corrida residual (o claim da promessa já é a garantia real): outra
      // execução criou a mesma linha — não é falha real, segue sem duplicar.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
      throw error;
    }
  }
}
