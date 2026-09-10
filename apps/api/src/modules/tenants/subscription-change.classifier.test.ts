import { describe, expect, it } from 'vitest';
import { classifySubscriptionChange } from './subscription-change.classifier.js';

const base = { currentPlanId: 1n, currentPlanSortOrder: 1, currentBillingCycle: 'MONTHLY' as const, currentPriceCents: 10000n, targetPlanId: 1n, targetPlanSortOrder: 1, targetBillingCycle: 'MONTHLY' as const, targetPriceCents: 10000n };

describe('classifySubscriptionChange', () => {
  it('returns NO_CHANGE for same plan and cycle', () => expect(classifySubscriptionChange(base)).toBe('NO_CHANGE'));
  it('treats longer same-plan cycles as paid changes', () => expect(classifySubscriptionChange({ ...base, targetBillingCycle: 'ANNUAL', targetPriceCents: 90000n })).toBe('IMMEDIATE_PAID_CHANGE'));
  it('schedules shorter cycles', () => expect(classifySubscriptionChange({ ...base, currentBillingCycle: 'ANNUAL', targetBillingCycle: 'MONTHLY', targetPriceCents: 10000n })).toBe('SCHEDULED_CHANGE'));
  it('prioritizes higher plan over cycle direction', () => expect(classifySubscriptionChange({ ...base, targetPlanId: 2n, targetPlanSortOrder: 2, currentBillingCycle: 'ANNUAL', targetBillingCycle: 'MONTHLY', targetPriceCents: 10000n })).toBe('IMMEDIATE_PAID_CHANGE'));
  it('uses the real upfront price for an otherwise lower-ranked target', () => expect(classifySubscriptionChange({ ...base, targetPlanId: 2n, targetPlanSortOrder: 0, targetBillingCycle: 'ANNUAL', targetPriceCents: 12000n })).toBe('IMMEDIATE_PAID_CHANGE'));
  it.each([
    ['MONTHLY', 'QUARTERLY', 'IMMEDIATE_PAID_CHANGE'],
    ['MONTHLY', 'SEMIANNUAL', 'IMMEDIATE_PAID_CHANGE'],
    ['MONTHLY', 'ANNUAL', 'IMMEDIATE_PAID_CHANGE'],
    ['QUARTERLY', 'MONTHLY', 'SCHEDULED_CHANGE'],
    ['QUARTERLY', 'SEMIANNUAL', 'IMMEDIATE_PAID_CHANGE'],
    ['QUARTERLY', 'ANNUAL', 'IMMEDIATE_PAID_CHANGE'],
    ['SEMIANNUAL', 'MONTHLY', 'SCHEDULED_CHANGE'],
    ['SEMIANNUAL', 'QUARTERLY', 'SCHEDULED_CHANGE'],
    ['SEMIANNUAL', 'ANNUAL', 'IMMEDIATE_PAID_CHANGE'],
    ['ANNUAL', 'MONTHLY', 'SCHEDULED_CHANGE'],
    ['ANNUAL', 'QUARTERLY', 'SCHEDULED_CHANGE'],
    ['ANNUAL', 'SEMIANNUAL', 'SCHEDULED_CHANGE'],
  ] as const)('classifies %s to %s using cycle commitment', (currentBillingCycle, targetBillingCycle, expected) => {
    expect(classifySubscriptionChange({ ...base, currentBillingCycle, targetBillingCycle, currentPriceCents: 10000n, targetPriceCents: expected === 'IMMEDIATE_PAID_CHANGE' ? 20000n : 5000n })).toBe(expected);
  });
});
