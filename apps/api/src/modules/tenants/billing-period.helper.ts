/**
 * Shared billing cycle calculation
 * Single source of truth for renewal logic
 */

export const BILLING_MONTHS: Record<string, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  ANNUAL: 12,
  CUSTOM: 1,
};

/**
 * Calculate end date for billing cycle
 * Used by: auth.routes, platform-billing.service, commercial-manual-payment.service
 */
export function calculateNextPeriodEnd(
  startDate: Date,
  billingCycle: string,
): Date {
  const end = new Date(startDate);
  const months = BILLING_MONTHS[billingCycle] ?? 1;
  end.setUTCMonth(end.getUTCMonth() + months);
  return end;
}

/**
 * Calculate renewal period (for already-active subscriptions)
 * Respects: subscription continues from currentPeriodEndsAt
 * Also respects: if period already past, renew from today
 */
export function calculateRenewalPeriod(
  currentPeriodEndsAt: Date,
  billingCycle: string,
): { periodStartsAt: Date; periodEndsAt: Date } {
  const now = new Date();
  const periodStartsAt = new Date(
    Math.max(now.getTime(), currentPeriodEndsAt.getTime()),
  );
  const periodEndsAt = calculateNextPeriodEnd(periodStartsAt, billingCycle);

  return { periodStartsAt, periodEndsAt };
}
