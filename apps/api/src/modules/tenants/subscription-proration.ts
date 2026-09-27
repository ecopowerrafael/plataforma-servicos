export function calculateUnusedCreditCents(input: { paidAmountCents: bigint; currentPeriodStartsAt: Date; currentPeriodEndsAt: Date; now: Date }): bigint {
  const totalMs = BigInt(input.currentPeriodEndsAt.getTime() - input.currentPeriodStartsAt.getTime());
  if (totalMs <= 0n) throw new Error('CURRENT_SUBSCRIPTION_PERIOD_INVALID');
  const remainingMs = BigInt(Math.max(0, Math.min(totalMs > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(totalMs), input.currentPeriodEndsAt.getTime() - input.now.getTime())));
  return input.paidAmountCents * remainingMs / totalMs;
}

export function calculateAmountDueCents(targetPriceCents: bigint, unusedCreditCents: bigint): bigint {
  return targetPriceCents > unusedCreditCents ? targetPriceCents - unusedCreditCents : 0n;
}
