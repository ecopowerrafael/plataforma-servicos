/** Abaixo disso, não vale a pena gerar um PIX parcial — oferece o valor integral em vez disso. */
export const MIN_PARTIAL_PAYMENT_CENTS = 500n;

/**
 * Entrada calculada sempre sobre o saldo ATUAL da Debt (nunca o valor
 * original) — arredondamento para o centavo mais próximo (round half up),
 * nunca abaixo de 1 centavo, nunca acima do próprio saldo. Retorna 0n para
 * saldo/percentual inválidos (sinaliza "não há pagamento parcial possível
 * aqui" para quem chama).
 */
export function calculatePartialPaymentCents(balanceCents: bigint, percentage: number): bigint {
  if (balanceCents <= 0n) return 0n;
  if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) return 0n;

  const raw = balanceCents * BigInt(Math.round(percentage));
  let amount = (raw + 50n) / 100n;
  if (amount > balanceCents) amount = balanceCents;
  if (amount < 1n) return 0n;
  return amount;
}
