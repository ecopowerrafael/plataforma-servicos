import { describe, expect, it } from 'vitest';

import { birthdayMatches } from './customer-recovery.service.js';

describe('customer recovery rules', () => {
  it('matches a birthday using persisted month and day', () => {
    expect(
      birthdayMatches(new Date('1990-08-09T00:00:00.000Z'), new Date('2026-08-09T12:00:00.000Z')),
    ).toBe(true);
    expect(
      birthdayMatches(new Date('1990-08-10T00:00:00.000Z'), new Date('2026-08-09T12:00:00.000Z')),
    ).toBe(false);
    expect(birthdayMatches(null, new Date('2026-08-09T12:00:00.000Z'))).toBe(false);
  });
});
