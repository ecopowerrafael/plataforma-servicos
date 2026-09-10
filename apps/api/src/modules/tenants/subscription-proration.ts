export function calculateUnusedCreditCents(input: { paidAmountCents: bigint; currentPeriodStartsAt: Date; currentPeriodEndsAt: Date; now: Date }): bigint {
  const totalMs = BigInt(input.currentPeriodEndsAt.getTime() - input.currentPeriodStartsAt.getTime());
  if (totalMs <= 0n) return 0n;
  const remainingMs = BigInt(Math.max(0, input.currentPeriodEndsAt.getTime() - input.now.getTime()));
  return input.paidAmountCents * remainingMs / totalMs;
}

export function calculateAmountDueCents(targetPriceCents: bigint, unusedCreditCents: bigint): bigint {
  return targetPriceCents > unusedCreditCents ? targetPriceCents - unusedCreditCents : 0n;
}
