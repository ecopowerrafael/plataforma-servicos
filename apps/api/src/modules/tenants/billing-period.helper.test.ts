import { describe, expect, it } from 'vitest';
import { isBillingPeriodCompatible } from './billing-period.helper.js';

describe('billing period compatibility', () => {
  const now = new Date('2026-09-10T00:00:00.000Z');

  it('accepts a calendar annual period', () => {
    expect(isBillingPeriodCompatible(new Date('2026-09-10T00:00:00.000Z'), new Date('2027-09-10T00:00:00.000Z'), 'ANNUAL', now)).toBe(true);
  });

  it('rejects a period that starts in the future for an effective subscription', () => {
    expect(isBillingPeriodCompatible(new Date('2027-09-10T00:00:00.000Z'), new Date('2028-09-10T00:00:00.000Z'), 'ANNUAL', now)).toBe(false);
  });

  it('rejects an annual period with an incompatible duration', () => {
    expect(isBillingPeriodCompatible(new Date('2025-09-10T00:00:00.000Z'), new Date('2027-09-10T00:00:00.000Z'), 'ANNUAL', now)).toBe(false);
  });
});
