export interface PartialOffer {
  percentage: number;
  amountCents: bigint;
}

function roundToNearestStep(value: bigint, step: bigint): bigint {
  if (step <= 0n) return value;
  const remainder = value % step;
  if (remainder === 0n) return value;
  const half = step / 2n;
  return remainder >= half ? value - remainder + step : value - remainder;
}

export function calculatePartialOffers(
  balanceCents: bigint,
  percentages: number[],
  minimumCents: bigint,
  roundingStepCents: bigint,
): PartialOffer[] {
  const offers: PartialOffer[] = [];
  const seenAmounts = new Set<string>();

  for (const percentage of percentages) {
    const raw = (balanceCents * BigInt(percentage)) / 100n;
    let amount = roundToNearestStep(raw, roundingStepCents);

    if (amount < minimumCents) {
      amount = minimumCents;
    }

    if (amount <= 0n || amount >= balanceCents) {
      continue;
    }

    const key = amount.toString();
    if (seenAmounts.has(key)) {
      continue;
    }
    seenAmounts.add(key);

    offers.push({ percentage, amountCents: amount });
  }

  return offers;
}

export function isPromiseValid(promisedDate: Date, now: Date): 'ACTIVE' | 'OVERDUE' {
  const endOfPromisedDay = new Date(
    promisedDate.getFullYear(),
    promisedDate.getMonth(),
    promisedDate.getDate(),
    23,
    59,
    59,
    999,
  );
  return now.getTime() <= endOfPromisedDay.getTime() ? 'ACTIVE' : 'OVERDUE';
}
