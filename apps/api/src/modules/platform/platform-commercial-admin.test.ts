/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Vitest asymmetric matchers and transaction doubles are intentionally partial. */
import { describe, expect, it, vi } from 'vitest';

import { PlatformService, type PlatformAuthContext } from './platform.service.js';

const actor = { user: { id: 9n } } as PlatformAuthContext;
const request = { ipAddress: null, userAgent: null };
const now = new Date('2026-08-14T12:00:00.000Z');
const plan = {
  id: 2n, publicId: '22222222-2222-4222-8222-222222222222', code: 'PRO', name: 'Pro',
  status: 'ACTIVE', currency: 'BRL', billingCycle: 'MONTHLY', priceCents: 5000n,
  monthlyPriceCents: 5000n, annualPriceCents: 50000n, billingOptions: [],
};
const subscription = {
  id: 3n, publicId: '33333333-3333-4333-8333-333333333333', tenantId: 4n, planId: 1n,
  status: 'TRIALING', startsAt: new Date('2026-08-01T00:00:00.000Z'),
  trialEndsAt: new Date('2026-08-20T00:00:00.000Z'),
  currentPeriodStartsAt: new Date('2026-08-01T00:00:00.000Z'),
  currentPeriodEndsAt: new Date('2026-09-01T00:00:00.000Z'),
  canceledAt: null, suspendedAt: null, endsAt: null, priceCents: 3000n, currency: 'BRL',
  billingCycle: 'MONTHLY', createdAt: now, updatedAt: now,
  tenant: { publicId: '44444444-4444-4444-8444-444444444444' },
  plan: { publicId: '11111111-1111-4111-8111-111111111111', code: 'OLD', name: 'Old', status: 'ACTIVE' },
};

describe('platform commercial administration', () => {
  it('deletes a never-used plan and audits without touching subscriptions', async () => {
    const tx = {
      planBenefit: { deleteMany: vi.fn() }, planBillingOption: { deleteMany: vi.fn() },
      planLimit: { deleteMany: vi.fn() }, commercialPlan: { delete: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const client = {
      commercialPlan: { findUnique: vi.fn().mockResolvedValue(plan) },
      tenantSubscription: { count: vi.fn().mockResolvedValue(0) },
      subscriptionHistory: { count: vi.fn().mockResolvedValue(0) },
      $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    await new PlatformService(client as never).deletePlan(plan.publicId, actor, request);
    expect(tx.commercialPlan.delete).toHaveBeenCalledWith({ where: { id: plan.id } });
    expect(tx.auditLog.create).toHaveBeenCalledOnce();
  });

  it('refuses hard delete when a plan has subscription history', async () => {
    const client = {
      commercialPlan: { findUnique: vi.fn().mockResolvedValue(plan) },
      tenantSubscription: { count: vi.fn().mockResolvedValue(1) },
      subscriptionHistory: { count: vi.fn().mockResolvedValue(2) },
    };
    await expect(
      new PlatformService(client as never).deletePlan(plan.publicId, actor, request),
    ).rejects.toMatchObject({ code: 'PLAN_IN_USE', message: expect.stringContaining('desativa') });
  });

  it('returns specific causes for missing, inactive and unchanged plans', async () => {
    for (const [candidate, code] of [[null, 'PLATFORM_PLAN_NOT_FOUND'], [{ ...plan, status: 'INACTIVE' }, 'PLATFORM_PLAN_INACTIVE'], [{ ...plan, id: 1n }, 'PLATFORM_PLAN_UNCHANGED']] as const) {
      const client = {
        tenantSubscription: { findUnique: vi.fn().mockResolvedValue(subscription) },
        commercialPlan: { findUnique: vi.fn().mockResolvedValue(candidate) },
      };
      await expect(
        new PlatformService(client as never).changeSubscriptionPlan(subscription.publicId, plan.publicId, undefined, 'ajuste', actor, request),
      ).rejects.toMatchObject({ code });
    }
  });

  it('rejects reducing trial and incompatible trial states', async () => {
    const client = { tenantSubscription: { findUnique: vi.fn().mockResolvedValue(subscription) } };
    await expect(new PlatformService(client as never).extendTrial(subscription.publicId, '2026-08-19T00:00:00.000Z', 'ajuste', actor, request)).rejects.toMatchObject({ code: 'PLATFORM_TRIAL_INVALID' });
    client.tenantSubscription.findUnique.mockResolvedValue({ ...subscription, status: 'ACTIVE' });
    await expect(new PlatformService(client as never).extendTrial(subscription.publicId, '2026-09-20T00:00:00.000Z', 'ajuste', actor, request)).rejects.toMatchObject({ code: 'PLATFORM_TRIAL_INVALID_STATE' });
  });

  it('rejects an inverted commercial period before writing', async () => {
    const client = { tenantSubscription: { findUnique: vi.fn().mockResolvedValue(subscription) } };
    await expect(new PlatformService(client as never).updateSubscriptionPeriod(subscription.publicId, '2026-09-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 'correcao', actor, request)).rejects.toMatchObject({ code: 'PLATFORM_SUBSCRIPTION_DATES_INVALID' });
  });

  it('changes plan snapshot and preserves history without creating payment', async () => {
    const updated = { ...subscription, planId: plan.id, plan, priceCents: plan.priceCents };
    const tx = {
      tenantSubscription: { update: vi.fn().mockResolvedValue(updated) },
      subscriptionHistory: { create: vi.fn() }, auditLog: { create: vi.fn() },
    };
    const client = {
      tenantSubscription: { findUnique: vi.fn().mockResolvedValue(subscription) },
      commercialPlan: { findUnique: vi.fn().mockResolvedValue(plan) },
      $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    await new PlatformService(client as never).changeSubscriptionPlan(subscription.publicId, plan.publicId, undefined, 'upgrade manual', actor, request);
    expect(tx.tenantSubscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ planId: plan.id, priceCents: plan.priceCents }) }));
    expect(tx.subscriptionHistory.create).toHaveBeenCalledOnce();
    expect(tx.auditLog.create).toHaveBeenCalledOnce();
    expect(client).not.toHaveProperty('payment');
  });

  it('activates an allowed trial and records history and audit without payment', async () => {
    const updated = { ...subscription, status: 'ACTIVE', trialEndsAt: now };
    const tx = {
      tenantSubscription: { update: vi.fn().mockResolvedValue(updated) },
      subscriptionHistory: { create: vi.fn() }, auditLog: { create: vi.fn() },
    };
    const client = {
      tenantSubscription: { findUnique: vi.fn().mockResolvedValue(subscription) },
      $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    await new PlatformService(client as never).transitionSubscription(subscription.publicId, 'ACTIVATED', 'aprovacao manual', actor, request);
    expect(tx.tenantSubscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'ACTIVE' }) }));
    expect(tx.subscriptionHistory.create).toHaveBeenCalledOnce();
    expect(tx.auditLog.create).toHaveBeenCalledOnce();
    expect(client).not.toHaveProperty('payment');
  });

  it('updates a valid period while preserving commercial history', async () => {
    const updated = { ...subscription, currentPeriodStartsAt: now, currentPeriodEndsAt: new Date('2026-09-14T12:00:00.000Z') };
    const tx = {
      tenantSubscription: { update: vi.fn().mockResolvedValue(updated) },
      subscriptionHistory: { create: vi.fn() }, auditLog: { create: vi.fn() },
    };
    const client = {
      tenantSubscription: { findUnique: vi.fn().mockResolvedValue(subscription) },
      $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    await new PlatformService(client as never).updateSubscriptionPeriod(subscription.publicId, now.toISOString(), updated.currentPeriodEndsAt.toISOString(), 'correcao manual', actor, request);
    expect(tx.subscriptionHistory.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'PERIOD_ADJUSTED' }) }));
    expect(tx.auditLog.create).toHaveBeenCalledOnce();
    expect(client).not.toHaveProperty('payment');
  });
});
