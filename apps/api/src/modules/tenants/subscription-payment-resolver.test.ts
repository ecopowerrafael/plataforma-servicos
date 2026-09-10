import { describe, expect, it } from 'vitest';
import { resolveCurrentCyclePaidAmount } from './subscription-payment-resolver.js';

const periodStartsAt = new Date('2026-09-01T00:00:00.000Z');
const periodEndsAt = new Date('2026-10-01T00:00:00.000Z');

function clientWith(gateway: unknown[] = [], commercial: unknown[] = []) {
  return {
    platformSubscriptionCharge: { findMany: async () => gateway },
    commercialManualPayment: { findMany: async () => commercial },
  } as never;
}

describe('current cycle paid amount resolver', () => {
  it('matches a single confirmed legacy payment without using price as proof of EXACT', async () => {
    const result = await resolveCurrentCyclePaidAmount(clientWith([
      { publicId: 'charge-1', amountCents: 7500n, paidAt: new Date('2026-09-01T00:05:00.000Z') },
    ]), { subscriptionId: 10n, periodStartsAt, periodEndsAt, historicalPriceCents: 10000n });

    expect(result).toEqual({ amountCents: 7500n, confidence: 'LEGACY_MATCHED', records: ['gateway:charge-1'] });
  });

  it('accepts a confirmed commercial/manual payment as a financial source', async () => {
    const result = await resolveCurrentCyclePaidAmount(clientWith([], [
      { publicId: 'manual-1', amountCents: 9000n, processedAt: new Date('2026-09-01T00:05:00.000Z') },
    ]), { subscriptionId: 10n, periodStartsAt, periodEndsAt, historicalPriceCents: 9000n });

    expect(result.confidence).toBe('LEGACY_MATCHED');
    expect(result.amountCents).toBe(9000n);
  });

  it('refuses to choose when two confirmed records could represent the cycle', async () => {
    const result = await resolveCurrentCyclePaidAmount(clientWith([
      { publicId: 'charge-1', amountCents: 10000n, paidAt: new Date('2026-09-01T00:05:00.000Z') },
    ], [
      { publicId: 'manual-1', amountCents: 10000n, processedAt: new Date('2026-09-01T00:06:00.000Z') },
    ]), { subscriptionId: 10n, periodStartsAt, periodEndsAt, historicalPriceCents: 10000n });

    expect(result.confidence).toBe('AMBIGUOUS');
    expect(result.amountCents).toBe(0n);
  });

  it('matches a legacy payment even when the period start was recreated later', async () => {
    const result = await resolveCurrentCyclePaidAmount(clientWith([
      { publicId: 'legacy-charge', amountCents: 99000n, paidAt: new Date('2026-08-18T12:00:00.000Z') },
    ]), { subscriptionId: 10n, periodStartsAt, periodEndsAt, historicalPriceCents: 99000n });

    expect(result.confidence).toBe('LEGACY_MATCHED');
    expect(result.amountCents).toBe(99000n);
  });

  it('does not promote equal price to EXACT', async () => {
    const result = await resolveCurrentCyclePaidAmount(clientWith([
      { publicId: 'unlinked', amountCents: 10000n, paidAt: new Date('2026-09-01T00:05:00.000Z') },
    ]), { subscriptionId: 10n, periodStartsAt, periodEndsAt, historicalPriceCents: 10000n });

    expect(result.confidence).not.toBe('EXACT');
  });

  it('keeps zero-value records ambiguous', async () => {
    const result = await resolveCurrentCyclePaidAmount(clientWith([
      { publicId: 'zero', amountCents: 0n, paidAt: new Date('2026-09-01T00:05:00.000Z') },
    ]), { subscriptionId: 10n, periodStartsAt, periodEndsAt, historicalPriceCents: 10000n });

    expect(result.confidence).toBe('AMBIGUOUS');
  });
});
