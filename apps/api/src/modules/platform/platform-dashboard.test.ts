import { describe, expect, it, vi } from 'vitest';

import { PlatformService } from './platform.service.js';

function serviceWithRevenue(revenue: unknown) {
  const client = {
    tenant: { count: vi.fn().mockResolvedValue(2) },
    user: { count: vi.fn().mockResolvedValue(4) },
    tenantMembership: { count: vi.fn().mockResolvedValue(3) },
    businessUnit: { count: vi.fn().mockResolvedValue(2) },
    tenantSubscription: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockImplementation(() => revenue),
    },
    auditLog: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const service = new PlatformService(client as never);
  vi.spyOn(service, 'listTenants').mockResolvedValue({
    items: [],
    page: { page: 1, limit: 5, total: 0, totalPages: 0 },
  });
  return service;
}

describe('platform dashboard', () => {
  it('calculates recurring revenue from each subscription real cycle', async () => {
    const service = serviceWithRevenue(
      Promise.resolve([
        {
          priceCents: 3000n,
          billingCycle: 'MONTHLY',
          plan: { publicId: '11111111-1111-4111-8111-111111111111', name: 'Pro' },
        },
        {
          priceCents: 12000n,
          billingCycle: 'ANNUAL',
          plan: { publicId: '11111111-1111-4111-8111-111111111111', name: 'Pro' },
        },
      ]),
    );
    const result = await service.dashboard('30d');
    expect(result.estimatedRevenue?.mrrCents).toBe('4000');
    expect(result.byPlan).toEqual([
      expect.objectContaining({ subscriptions: 2, estimatedMonthlyCents: '4000' }),
    ]);
  });

  it('keeps the other indicators available when only revenue fails', async () => {
    const service = serviceWithRevenue(Promise.reject(new Error('aggregate unavailable')));
    const result = await service.dashboard('30d');
    expect(result.counts.tenants).toBe(2);
    expect(result.estimatedRevenue).toBeNull();
  });
});
