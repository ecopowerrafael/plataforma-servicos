import { describe, expect, it } from 'vitest';
import { addMembershipPeriod, membershipAnchorDay } from './customer-membership-period.js';

const instant = (value: string) => new Date(value);

describe('customer membership periods', () => {
  const tz = 'America/Sao_Paulo';
  it.each([
    ['MONTHLY', '2026-01-31T15:00:00.000Z', '2026-02-28'],
    ['MONTHLY', '2026-01-30T15:00:00.000Z', '2026-02-28'],
    ['MONTHLY', '2026-01-29T15:00:00.000Z', '2026-02-28'],
    ['QUARTERLY', '2026-01-31T15:00:00.000Z', '2026-04-30'],
    ['SEMIANNUAL', '2026-01-31T15:00:00.000Z', '2026-07-31'],
    ['ANNUAL', '2024-02-29T15:00:00.000Z', '2025-02-28'],
  ])('%s clamps/advances %s to %s', (interval, start, expectedDay) => {
    const date = addMembershipPeriod(instant(start), interval as never, tz, membershipAnchorDay(instant(start), tz));
    expect(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)).toBe(expectedDay);
  });

  it('preserves month-end and leap-year anchors across truncated periods', () => {
    const february = addMembershipPeriod(instant('2026-01-31T15:00:00.000Z'), 'MONTHLY', tz, 31);
    const march = addMembershipPeriod(february, 'MONTHLY', tz, 31);
    const marchDay = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(march);
    expect(marchDay).toBe('2026-03-31');
    const anchor = 29;
    let value = instant('2024-02-29T15:00:00.000Z');
    for (let index = 0; index < 4; index += 1) value = addMembershipPeriod(value, 'ANNUAL', tz, anchor);
    expect(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value)).toBe('2028-02-29');
  });
});
