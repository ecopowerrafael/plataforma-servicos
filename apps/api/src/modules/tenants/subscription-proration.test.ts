import { describe, expect, it } from 'vitest';
import { calculateAmountDueCents, calculateUnusedCreditCents } from './subscription-proration.js';

describe('subscription proration', () => {
  it('calculates R$50 credit from R$100 after half a 30-day period', () => {
    const start = new Date('2026-09-01T00:00:00.000Z');
    const end = new Date('2026-10-01T00:00:00.000Z');
    expect(calculateUnusedCreditCents({ paidAmountCents: 10000n, currentPeriodStartsAt: start, currentPeriodEndsAt: end, now: new Date('2026-09-16T00:00:00.000Z') })).toBe(5000n);
    expect(calculateAmountDueCents(90000n, 5000n)).toBe(85000n);
  });

  it.each([
    ['28-day', '2026-02-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z'],
    ['29-day', '2028-02-01T00:00:00.000Z', '2028-03-01T00:00:00.000Z'],
    ['31-day', '2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z'],
  ])('uses timestamps for %s periods', (_label, startValue, endValue) => {
    const start = new Date(startValue);
    const end = new Date(endValue);
    const midpoint = new Date((start.getTime() + end.getTime()) / 2);
    expect(calculateUnusedCreditCents({ paidAmountCents: 10001n, currentPeriodStartsAt: start, currentPeriodEndsAt: end, now: midpoint })).toBe(5000n);
  });

  it('clamps past expiration and never returns negative due', () => {
    const start = new Date('2026-09-01T00:00:00.000Z');
    const end = new Date('2026-10-01T00:00:00.000Z');
    expect(calculateUnusedCreditCents({ paidAmountCents: 10000n, currentPeriodStartsAt: start, currentPeriodEndsAt: end, now: new Date('2026-10-02T00:00:00.000Z') })).toBe(0n);
    expect(calculateAmountDueCents(100n, 200n)).toBe(0n);
  });
});
