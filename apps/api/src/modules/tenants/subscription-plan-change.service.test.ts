import { describe, expect, it, vi } from 'vitest';
import { SubscriptionPlanChangeService } from './subscription-plan-change.service.js';

const start = new Date('2026-09-01T00:00:00.000Z');
const end = new Date('2026-10-01T00:00:00.000Z');

describe('SubscriptionPlanChangeService', () => {
  it('does nothing when a duplicate application sees APPLIED', async () => {
    const change = { id: 1n, publicId: 'change-1', status: 'APPLIED' };
    const tx = { subscriptionPlanChange: { findUnique: vi.fn().mockResolvedValue(change) } };
    const client = { $transaction: vi.fn(async (callback: (value: unknown) => Promise<unknown>) => callback(tx)) } as never;

    await expect(new SubscriptionPlanChangeService(client).applyPlanChange('change-1')).resolves.toBe(change);
    expect(tx).not.toHaveProperty('tenantSubscription');
  });

  it('updates the subscription and writes one history record after PAID', async () => {
    const appliedAt = new Date('2026-09-10T12:00:00.000Z');
    const change = {
      id: 2n,
      publicId: 'change-2',
      status: 'PAID',
      subscriptionId: 7n,
      tenantId: 11n,
      currentPlanId: 1n,
      targetPlanId: 2n,
      currentBillingCycle: 'MONTHLY',
      targetBillingCycle: 'ANNUAL',
      currentPeriodStartsAt: start,
      currentPeriodEndsAt: end,
      currency: 'BRL',
      paidAt: appliedAt,
      appliedAt,
      targetPlan: { billingOptions: [{ billingCycle: 'ANNUAL', active: true, priceCents: 90000n }] },
    };
    const subscription = { id: 7n, tenantId: 11n, planId: 1n, billingCycle: 'MONTHLY', currentPeriodStartsAt: start, currentPeriodEndsAt: end, status: 'ACTIVE' };
    const tx = {
      subscriptionPlanChange: { findUnique: vi.fn().mockResolvedValue(change), update: vi.fn().mockResolvedValue({ ...change, status: 'APPLIED' }) },
      tenantSubscription: { findUniqueOrThrow: vi.fn().mockResolvedValue(subscription), update: vi.fn() },
      subscriptionHistory: { create: vi.fn() },
      $queryRaw: vi.fn(),
    };
    const client = { $transaction: vi.fn(async (callback: (value: unknown) => Promise<unknown>) => callback(tx)) } as never;

    await new SubscriptionPlanChangeService(client).applyPlanChange('change-2');

    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.tenantSubscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ planId: 2n, billingCycle: 'ANNUAL', priceCents: 90000n }) }));
    expect(tx.subscriptionHistory.create).toHaveBeenCalledTimes(1);
  });
});
