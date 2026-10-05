export interface PointShare {
  professionalId: bigint;
  points: number;
}

export interface AllocationAmount extends PointShare {
  amountCents: bigint;
}

export function distributeLargestRemainder(poolCents: bigint, shares: readonly PointShare[]): AllocationAmount[] {
  if (poolCents < 0n) throw new Error('poolCents must be non-negative');
  const positive = shares.filter((share) => share.points > 0);
  const totalPoints = positive.reduce((sum, share) => sum + share.points, 0);
  if (totalPoints === 0) return [];
  const base = positive.map((share) => {
    const numerator = poolCents * BigInt(share.points);
    return { ...share, amountCents: numerator / BigInt(totalPoints), remainder: numerator % BigInt(totalPoints) };
  });
  let distributed = base.reduce((sum, share) => sum + share.amountCents, 0n);
  let remaining = poolCents - distributed;
  base.sort((a, b) => a.remainder === b.remainder
    ? (a.professionalId < b.professionalId ? -1 : a.professionalId > b.professionalId ? 1 : 0)
    : a.remainder > b.remainder ? -1 : 1);
  for (let i = 0; remaining > 0n; i = (i + 1) % base.length) {
    const item = base[i];
    if (item === undefined) break;
    item.amountCents += 1n;
    remaining -= 1n;
  }
  return base.map(({ remainder: _remainder, ...share }) => share);
}
