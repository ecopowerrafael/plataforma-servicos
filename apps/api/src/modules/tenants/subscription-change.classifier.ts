export type SubscriptionChangeClassification = 'NO_CHANGE' | 'IMMEDIATE_PAID_CHANGE' | 'SCHEDULED_CHANGE';
export type SubscriptionCycle = 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';

const cycleRank: Record<SubscriptionCycle, number> = { MONTHLY: 1, QUARTERLY: 2, SEMIANNUAL: 3, ANNUAL: 4 };

export function classifySubscriptionChange(input: {
  currentPlanId: bigint;
  currentPlanSortOrder: number;
  currentBillingCycle: SubscriptionCycle;
  currentPriceCents: bigint;
  targetPlanId: bigint;
  targetPlanSortOrder: number;
  targetBillingCycle: SubscriptionCycle;
  targetPriceCents: bigint;
}): SubscriptionChangeClassification {
  if (input.currentPlanId === input.targetPlanId && input.currentBillingCycle === input.targetBillingCycle) return 'NO_CHANGE';
  if (input.targetPlanSortOrder > input.currentPlanSortOrder) return 'IMMEDIATE_PAID_CHANGE';
  // A lower/equal-ranked plan can still require a larger upfront charge
  // (for example, a discounted annual option versus a monthly option). The
  // commercial rule is based on the actual selected billing option, so do
  // not defer a change that asks for more money now.
  if (input.targetPriceCents > input.currentPriceCents) return 'IMMEDIATE_PAID_CHANGE';
  if (input.currentPlanId === input.targetPlanId && cycleRank[input.targetBillingCycle] > cycleRank[input.currentBillingCycle]) return 'IMMEDIATE_PAID_CHANGE';
  return 'SCHEDULED_CHANGE';
}
