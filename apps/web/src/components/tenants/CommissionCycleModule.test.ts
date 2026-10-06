import { describe, expect, it } from 'vitest';

import {
  commissionParticipation,
  formatCommissionMoney,
  formatCommissionPercent,
} from './CommissionCycleModule.js';

describe('CommissionCycleModule presentation rules', () => {
  it('converts percentage basis points for display without exposing bps', () => {
    expect(formatCommissionPercent(4000)).toBe('40,00%');
    expect(formatCommissionPercent(1250)).toBe('12,50%');
  });

  it('formats cents as Brazilian currency', () => {
    expect(formatCommissionMoney('48000')).toBe('R$ 480,00');
    expect(formatCommissionMoney('0')).toBe('R$ 0,00');
    expect(formatCommissionMoney('900719925474099300')).toContain('9.007.199.254.740.993,00');
  });

  it('calculates participation only for visual display and handles zero points', () => {
    expect(commissionParticipation(12, 30)).toBe(40);
    expect(commissionParticipation(10, 0)).toBe(0);
  });
});
