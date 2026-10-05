import { describe, expect, it, vi } from 'vitest';

import { TenantOperatingModelTransitionService } from './tenant-operating-model-transition.service.js';

function previewClient(counts: Partial<Record<string, number>> = {}) {
  return {
    tenant: { findUniqueOrThrow: vi.fn().mockResolvedValue({ operatingModel: 'MEMBERSHIP', settings: { membershipSalesEnabled: true } }) },
    customerMembershipPlan: { count: vi.fn().mockResolvedValue(counts.plans ?? 0) },
    customerMembership: { count: vi.fn().mockResolvedValue(counts.memberships ?? 0) },
    customerMembershipCharge: { count: vi.fn().mockResolvedValue(counts.charges ?? 0) },
    paymentGatewayCharge: { count: vi.fn().mockResolvedValue(counts.gatewayCharges ?? 0) },
    customerMembershipUsage: { count: vi.fn().mockResolvedValue(counts.usage ?? 0) },
    appointment: { count: vi.fn().mockResolvedValue(counts.appointments ?? 0) },
  };
}

describe('TenantOperatingModelTransitionService', () => {
  it('returns structured blockers without exposing records', async () => {
    const service = new TenantOperatingModelTransitionService(previewClient({ memberships: 2, usage: 1, appointments: 3 }) as never);

    await expect(service.preview(1n, 'SERVICE_PRICING')).resolves.toMatchObject({
      from: 'MEMBERSHIP',
      to: 'SERVICE_PRICING',
      canTransition: false,
      blockers: [
        { code: 'OPEN_MEMBERSHIPS', count: 2 },
        { code: 'RESERVED_MEMBERSHIP_USAGE', count: 1 },
        { code: 'OPEN_MEMBERSHIP_APPOINTMENTS', count: 3 },
      ],
    });
  });

  it('requires an active plan only when membership sales are enabled', async () => {
    const client = previewClient({ plans: 0 });
    client.tenant.findUniqueOrThrow.mockResolvedValue({ operatingModel: 'SERVICE_PRICING', settings: { membershipSalesEnabled: true } });
    await expect(new TenantOperatingModelTransitionService(client as never).preview(1n, 'MEMBERSHIP')).resolves.toMatchObject({
      canTransition: false,
      blockers: [{ code: 'ACTIVE_MEMBERSHIP_PLAN_REQUIRED', count: 0 }],
    });

    client.tenant.findUniqueOrThrow.mockResolvedValue({ operatingModel: 'SERVICE_PRICING', settings: { membershipSalesEnabled: false } });
    await expect(new TenantOperatingModelTransitionService(client as never).preview(1n, 'MEMBERSHIP')).resolves.toMatchObject({
      canTransition: true,
      blockers: [],
      warnings: [{ code: 'MEMBERSHIP_SALES_DISABLED', count: 0 }],
    });
  });

  it('creates one canonical transition and audit record atomically', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 1n, operating_model: 'SERVICE_PRICING' }]),
      tenantSettings: { findUnique: vi.fn().mockResolvedValue({ membershipSalesEnabled: false }) },
      customerMembershipPlan: { count: vi.fn().mockResolvedValue(0) },
      customerMembership: { count: vi.fn().mockResolvedValue(0) },
      customerMembershipCharge: { count: vi.fn().mockResolvedValue(0) },
      paymentGatewayCharge: { count: vi.fn().mockResolvedValue(0) },
      customerMembershipUsage: { count: vi.fn().mockResolvedValue(0) },
      appointment: { count: vi.fn().mockResolvedValue(0) },
      tenant: { update: vi.fn().mockResolvedValue({ publicId: 'tenant', operatingModel: 'MEMBERSHIP' }) },
      tenantOperatingModelTransition: { create: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const client = { $transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)) };
    const result = await new TenantOperatingModelTransitionService(client as never).transition(1n, 'MEMBERSHIP', 'SERVICE_PRICING', { userId: 2n, sessionId: 3n });

    expect(result.to).toBe('MEMBERSHIP');
    expect(tx.tenantOperatingModelTransition.create).toHaveBeenCalledOnce();
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'tenant.operating_model.changed', targetType: 'tenant', metadata: { from: 'SERVICE_PRICING', to: 'MEMBERSHIP' } }) }));
  });

  it('rejects idempotent transitions without history', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ id: 1n, operating_model: 'MEMBERSHIP' }]) };
    const client = { $transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)) };
    await expect(new TenantOperatingModelTransitionService(client as never).transition(1n, 'MEMBERSHIP', undefined, { userId: 2n, sessionId: 3n })).rejects.toMatchObject({ code: 'OPERATING_MODEL_ALREADY_ACTIVE', statusCode: 409 });
  });
});
