import { describe, expect, it, vi } from 'vitest';
import { TenantCommercialSweepService } from './tenant-commercial-sweep.service.js';

describe('TenantCommercialSweepService', () => {
  it('moves an expired subscription to past due and charges a scheduled change without applying it', async () => {
    const now = new Date('2026-09-10T12:00:00.000Z');
    const subscription = {
      id: 7n,
      tenantId: 11n,
      publicId: 'sub-7',
      status: 'ACTIVE',
      currentPeriodEndsAt: new Date('2026-09-09T12:00:00.000Z'),
    };
    const scheduled = { id: 8n, publicId: 'change-8' };
    const tenantSubscription = {
      findMany: vi.fn(async (args: any) => args.where.status === 'ACTIVE' ? [subscription] : []),
      update: vi.fn(),
    };
    const change = { findFirst: vi.fn().mockResolvedValue(scheduled), updateMany: vi.fn().mockResolvedValue({ count: 1 }) };
    const transaction = {
      tenantSubscription: { update: vi.fn().mockResolvedValue({ ...subscription, status: 'PAST_DUE' }) },
      subscriptionHistory: { create: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const billing = { createChangeCharge: vi.fn().mockResolvedValue({ status: 'PENDING' }) };
    const client = {
      tenantCommercialPolicy: { findUnique: vi.fn().mockResolvedValue({ graceDays: 7, autoSuspendAfterGrace: false }) },
      tenantSubscription,
      subscriptionPlanChange: change,
      platformPaymentConfig: { findFirst: vi.fn().mockResolvedValue({ provider: 'pix-local' }) },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(transaction)),
    } as never;

    const result = await new TenantCommercialSweepService(client, billing as never).run(now);

    expect(result).toEqual({ pastDued: 1, suspended: 0 });
    expect(transaction.tenantSubscription.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 7n },
      data: expect.objectContaining({ status: 'PAST_DUE' }),
    }));
    expect(change.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 8n, status: 'SCHEDULED' },
      data: expect.objectContaining({ status: 'PENDING_PAYMENT' }),
    }));
    expect(billing.createChangeCharge).toHaveBeenCalledWith(11n, 'change-8', 'pix-local');
    expect(transaction.tenantSubscription.update.mock.calls[0][0].data).not.toHaveProperty('planId');
  });

  it('suspends a past-due subscription only after grace expires', async () => {
    const subscription = { id: 9n, tenantId: 12n, publicId: 'sub-9', status: 'PAST_DUE' };
    const transaction = {
      tenantSubscription: { update: vi.fn().mockResolvedValue({ ...subscription, status: 'SUSPENDED' }) },
      subscriptionHistory: { create: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const client = {
      tenantCommercialPolicy: { findUnique: vi.fn().mockResolvedValue({ graceDays: 7, autoSuspendAfterGrace: true }) },
      tenantSubscription: { findMany: vi.fn(async (args: any) => args.where.status === 'PAST_DUE' ? [subscription] : []) },
      subscriptionPlanChange: { findFirst: vi.fn() },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(transaction)),
    } as never;

    const result = await new TenantCommercialSweepService(client).run(new Date('2026-09-20T12:00:00.000Z'));

    expect(result.suspended).toBe(1);
    expect(transaction.tenantSubscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'SUSPENDED' }) }));
  });
});
