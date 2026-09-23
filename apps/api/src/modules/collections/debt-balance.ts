import { randomUUID } from 'node:crypto';

import { balanceCents, discountsByAppointment, paidByAppointment } from '../payments/appointment-balance.js';
import { Prisma, type DebtStatus, type PrismaClient } from '../../database-client/client.js';

type DebtBalanceInput =
  | { originType: 'MANUAL'; amountCents: bigint }
  | { originType: 'APPOINTMENT'; appointmentId: bigint; priceCents: bigint };

/**
 * Fonte única do valor inicial de uma Debt (originalAmountCents = currentBalanceCents
 * na criação). Dívida MANUAL usa o valor informado; dívida APPOINTMENT reutiliza o
 * mesmo saldo canônico de `appointment-balance.ts` usado por Pendências financeiras —
 * nunca recalcula "priceCents - paidCents" localmente.
 */
export async function calculateDebtBalance(
  client: PrismaClient,
  tenantId: bigint,
  input: DebtBalanceInput,
): Promise<bigint> {
  if (input.originType === 'MANUAL') return input.amountCents;

  const [discounts, paid] = await Promise.all([
    discountsByAppointment(client, tenantId, [input.appointmentId]),
    paidByAppointment(client, tenantId, [input.appointmentId]),
  ]);
  return balanceCents(
    input.priceCents,
    discounts.get(input.appointmentId) ?? 0n,
    paid.get(input.appointmentId) ?? 0n,
  );
}

const CLOSED_DEBT_STATUSES: DebtStatus[] = ['PAID', 'CANCELED'];
// Sync precisa considerar Debt PAID também (para reabrir em caso de estorno) —
// só CANCELED (decisão manual explícita) fica fora para sempre.
const CANCELED_DEBT_STATUS: DebtStatus[] = ['CANCELED'];

export type DebtBalanceSyncSource = 'PAYMENT_CREATED' | 'PAYMENT_CANCELED' | 'RECOVERY_BATCH';

/**
 * Ressincroniza Debt.currentBalanceCents de uma dívida originada de
 * Appointment (exceto CANCELED) sempre que um Payment real desse Appointment
 * é criado ou cancelado — reaproveita o mesmo saldo canônico de
 * calculateDebtBalance(), nunca recalcula "price - paid" à parte.
 *
 * Resiliência: qualquer falha aqui é capturada e vira `balanceSyncPending =
 * true` na própria Debt (para retry via processPendingDebtBalanceSync) em vez
 * de propagar — quem chama (ex.: PaymentService) nunca deve perder o Payment
 * por causa de uma falha do Bot Cobra. Ao sincronizar com sucesso, o flag
 * sempre volta a false, mesmo quando o saldo não mudou.
 *
 * Quando o saldo canônico chega a 0, marca a Debt como PAID (o Payment que
 * quitou já existe no financeiro — esta função nunca cria Payment). Se uma
 * Debt já PAID tiver o saldo voltando a > 0 (estorno/cancelamento do
 * Payment), ela é reaberta para OPEN com paidAt = null.
 */
export async function syncAppointmentDebtBalance(
  client: PrismaClient,
  tenantId: bigint,
  appointmentId: bigint,
  source: DebtBalanceSyncSource,
): Promise<void> {
  const debt = await client.debt.findFirst({
    where: { tenantId, originAppointmentId: appointmentId, status: { notIn: CANCELED_DEBT_STATUS } },
  });
  if (debt === null) return;

  try {
    const appointment = await client.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      select: { priceCents: true },
    });
    if (appointment === null) return;

    const currentBalanceCents = await calculateDebtBalance(client, tenantId, {
      originType: 'APPOINTMENT',
      appointmentId,
      priceCents: appointment.priceCents,
    });

    if (currentBalanceCents === debt.currentBalanceCents) {
      if (debt.balanceSyncPending) {
        await client.debt.update({ where: { id: debt.id }, data: { balanceSyncPending: false } });
      }
      return;
    }

    const previousBalanceCents = debt.currentBalanceCents;
    const isFullyPaid = currentBalanceCents === 0n;
    const isReopening = debt.status === 'PAID' && currentBalanceCents > 0n;

    await client.debt.update({
      where: { id: debt.id },
      data: {
        currentBalanceCents,
        balanceSyncPending: false,
        ...(isFullyPaid ? { status: 'PAID' as const, paidAt: new Date() } : {}),
        ...(isReopening ? { status: 'OPEN' as const, paidAt: null } : {}),
      },
    });

    const eventMetadata = {
      previousBalanceCents: previousBalanceCents.toString(),
      currentBalanceCents: currentBalanceCents.toString(),
      source,
    } satisfies Prisma.InputJsonObject;

    await client.debtEvent.create({
      data: { publicId: randomUUID(), tenantId, debtId: debt.id, eventType: 'BALANCE_UPDATED', metadata: eventMetadata },
    });
    if (isFullyPaid) {
      await client.debtEvent.create({
        data: { publicId: randomUUID(), tenantId, debtId: debt.id, eventType: 'DEBT_PAID', metadata: { source } },
      });
    }
    if (isReopening) {
      await client.debtEvent.create({
        data: { publicId: randomUUID(), tenantId, debtId: debt.id, eventType: 'DEBT_REOPENED', metadata: { source } },
      });
    }
  } catch (error) {
    console.error('Falha ao sincronizar saldo do Bot Cobra; marcando para nova tentativa:', error);
    try {
      await client.debt.update({ where: { id: debt.id }, data: { balanceSyncPending: true } });
    } catch (markError) {
      console.error('Falha ao marcar Debt para retry de sincronização de saldo:', markError);
    }
  }
}

/**
 * Reprocessa em lote as Debts que ficaram com `balanceSyncPending = true`
 * após uma falha transitória. Um Payment por vez (sequencial, sem
 * Promise.all), no máximo `limit` por chamada — não é um scheduler, é a
 * função que um endpoint/worker futuro pode chamar periodicamente.
 */
export async function processPendingDebtBalanceSync(client: PrismaClient, limit = 50): Promise<number> {
  const pending = await client.debt.findMany({
    where: {
      originType: 'APPOINTMENT',
      balanceSyncPending: true,
      status: { notIn: CLOSED_DEBT_STATUSES },
    },
    orderBy: { id: 'asc' },
    take: limit,
    select: { tenantId: true, originAppointmentId: true },
  });

  let processed = 0;
  for (const debt of pending) {
    if (debt.originAppointmentId === null) continue;
    await syncAppointmentDebtBalance(client, debt.tenantId, debt.originAppointmentId, 'RECOVERY_BATCH');
    processed += 1;
  }
  return processed;
}

export interface ActiveDebtSummary {
  publicId: string;
  status: DebtStatus;
  currentBalanceCents: bigint;
}

/**
 * Dívida ATIVA por Appointment, em uma única consulta — usado por Pendências
 * financeiras para mostrar "Bot Cobra ativo" sem recalcular nenhum valor
 * financeiro (o saldo já vem persistido na própria Debt).
 */
export async function activeDebtsByAppointment(
  client: PrismaClient,
  tenantId: bigint,
  appointmentIds: bigint[],
): Promise<Map<bigint, ActiveDebtSummary>> {
  const result = new Map<bigint, ActiveDebtSummary>();
  if (appointmentIds.length === 0) return result;

  const debts = await client.debt.findMany({
    where: {
      tenantId,
      originAppointmentId: { in: appointmentIds },
      status: { notIn: CLOSED_DEBT_STATUSES },
    },
    select: { publicId: true, status: true, currentBalanceCents: true, originAppointmentId: true },
  });
  for (const debt of debts) {
    if (debt.originAppointmentId !== null)
      result.set(debt.originAppointmentId, {
        publicId: debt.publicId,
        status: debt.status,
        currentBalanceCents: debt.currentBalanceCents,
      });
  }
  return result;
}
