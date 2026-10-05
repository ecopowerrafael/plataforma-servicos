import { describe, expect, it } from 'vitest';

import { distributeLargestRemainder } from './commission-cycle-allocation.js';

describe('distributeLargestRemainder', () => {
  it('distributes remainders deterministically by professional id', () => {
    const result = distributeLargestRemainder(10n, [{ professionalId: 2n, points: 1 }, { professionalId: 1n, points: 1 }, { professionalId: 3n, points: 1 }]);
    expect(result.map((item) => [item.professionalId, item.amountCents])).toEqual([[1n, 4n], [2n, 3n], [3n, 3n]]);
  });

  it('supports zero pool, zero points and large BigInt values', () => {
    expect(distributeLargestRemainder(0n, [{ professionalId: 1n, points: 3 }])[0].amountCents).toBe(0n);
    expect(distributeLargestRemainder(10n, [])).toEqual([]);
    expect(distributeLargestRemainder(10n ** 30n, [{ professionalId: 1n, points: 1 }])[0].amountCents).toBe(10n ** 30n);
  });
});
