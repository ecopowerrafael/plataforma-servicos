import { describe, expect, it } from 'vitest';

import { canAccessUnit } from './unit-scope.js';

describe('unit scope', () => {
  it('allows every unit when the membership has global access', () => {
    expect(canAccessUnit(null, 'unit-a')).toBe(true);
  });

  it('allows only explicitly assigned units for scoped memberships', () => {
    expect(canAccessUnit(['unit-a'], 'unit-a')).toBe(true);
    expect(canAccessUnit(['unit-a'], 'unit-b')).toBe(false);
    expect(canAccessUnit([], 'unit-a')).toBe(false);
  });
});
