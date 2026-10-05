import { describe, expect, it } from 'vitest';

import { commissionPeriodFor } from './commission-cycle-period.js';

describe('commissionPeriodFor', () => {
  it('clamps closing day 31 and creates a partial first cycle', () => {
    const period = commissionPeriodFor(new Date('2026-01-30T12:00:00.000Z'), 'UTC', 31, new Date('2026-01-25T00:00:00.000Z'));
    expect(period?.periodStart.toISOString()).toBe('2026-01-25T00:00:00.000Z');
    expect(period?.periodEnd.toISOString()).toBe('2026-01-31T00:00:00.000Z');
  });

  it.each([
    [28, '2026-02-28T00:00:00.000Z'],
    [29, '2026-02-28T00:00:00.000Z'],
    [30, '2026-02-28T00:00:00.000Z'],
    [31, '2026-02-28T00:00:00.000Z'],
  ])('clamps closing day %s in February', (closingDay, expectedEnd) => {
    const period = commissionPeriodFor(new Date('2026-02-20T12:00:00.000Z'), 'UTC', closingDay);
    expect(period?.periodEnd.toISOString()).toBe(expectedEnd);
  });

  it('keeps day 29 in a leap year', () => {
    const period = commissionPeriodFor(new Date('2028-02-20T12:00:00.000Z'), 'UTC', 29);
    expect(period?.periodEnd.toISOString()).toBe('2028-02-29T00:00:00.000Z');
  });

  it('uses tenant local midnight across DST', () => {
    const period = commissionPeriodFor(new Date('2026-04-01T12:00:00.000Z'), 'America/Sao_Paulo', 10);
    expect(period?.periodStart.toISOString()).toBe('2026-03-10T03:00:00.000Z');
    expect(period?.periodEnd.toISOString()).toBe('2026-04-10T03:00:00.000Z');
  });

  it('returns null before effectiveFrom', () => {
    expect(commissionPeriodFor(new Date('2026-01-01T00:00:00.000Z'), 'UTC', 10, new Date('2026-02-01T00:00:00.000Z'))).toBeNull();
  });
});
