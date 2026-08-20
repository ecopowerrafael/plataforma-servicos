import { balanceCents, discountsByAppointment, paidByAppointment } from '../payments/appointment-balance.js';
import { type PrismaClient } from '../../database-client/client.js';

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
