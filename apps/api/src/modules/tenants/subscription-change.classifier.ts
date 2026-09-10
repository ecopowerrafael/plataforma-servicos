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
  if (input.currentPlanId === input.targetPlanId && cycleRank[input.targetBillingCycle] > cycleRank[input.currentBillingCycle]) return 'IMMEDIATE_PAID_CHANGE';
  return 'SCHEDULED_CHANGE';
}
