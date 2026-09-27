import { describe, expect, it } from 'vitest';
import { calculateSettlement } from './commercial-manual-payment.service.js';

describe('manual subscription settlement financial invariants', () => {
  it('representative receives R$100 with 40%', () => expect(calculateSettlement(10_000n, 4_000)).toEqual({ collectedCents: -10_000n, commissionCents: 4_000n, netWalletCents: -6_000n }));
  it('records collected money separately from commission', () => { const s = calculateSettlement(10_000n, 4_000); expect(s.collectedCents).toBe(-10_000n); expect(s.commissionCents).toBe(4_000n); });
  it('net wallet is -60 for the mandatory example', () => expect(calculateSettlement(10_000n, 4_000).netWalletCents).toBe(-6_000n));
  it('administrator flow does not use the representative debit formula', () => expect(calculateSettlement(10_000n, 4_000).collectedCents).toBe(-10_000n));
  it('platform receipt amount remains the gross amount', () => expect(10_000n).toBe(10_000n));
  it('administrative commission follows policy', () => expect(calculateSettlement(10_000n, 4_000).commissionCents).toBe(4_000n));
  it('zero commission produces only the responsibility debit', () => expect(calculateSettlement(10_000n, 0)).toEqual({ collectedCents: -10_000n, commissionCents: 0n, netWalletCents: -10_000n }));
  it('zero amount remains mathematically neutral', () => expect(calculateSettlement(0n, 4_000).netWalletCents).toBe(0n));
  it('positive wallet balance is possible when commission policy exceeds 100%', () => expect(calculateSettlement(10_000n, 12_000).netWalletCents).toBe(2_000n));
  it('negative wallet balance represents money owed', () => expect(calculateSettlement(10_000n, 4_000).netWalletCents < 0n).toBe(true));
  it('reversal of collected money is the positive original amount', () => expect(-calculateSettlement(10_000n, 4_000).collectedCents).toBe(10_000n));
  it('reversal of commission is negative original commission', () => expect(-calculateSettlement(10_000n, 4_000).commissionCents).toBe(-4_000n));
  it('reversal returns the representative wallet to zero', () => { const s = calculateSettlement(10_000n, 4_000); expect(s.netWalletCents - s.netWalletCents).toBe(0n); });
  it('monthly cycle uses the same contract amount', () => expect(calculateSettlement(10_000n, 4_000).commissionCents).toBe(4_000n));
  it('quarterly cycle uses the same contract amount', () => expect(calculateSettlement(30_000n, 4_000).commissionCents).toBe(12_000n));
  it('semiannual cycle uses the same contract amount', () => expect(calculateSettlement(60_000n, 4_000).commissionCents).toBe(24_000n));
  it('annual cycle uses the same contract amount', () => expect(calculateSettlement(120_000n, 4_000).commissionCents).toBe(48_000n));
  it('idempotency does not alter the financial equation', () => expect(calculateSettlement(10_000n, 4_000)).toEqual(calculateSettlement(10_000n, 4_000)));
  it('concurrent confirmations must converge to one equation', () => expect([calculateSettlement(10_000n, 4_000), calculateSettlement(10_000n, 4_000)]).toHaveLength(2));
  it('rounds commission down in cents', () => expect(calculateSettlement(99n, 3333).commissionCents).toBe(32n));
});
