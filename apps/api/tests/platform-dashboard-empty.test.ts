import { describe, expect, it, vi } from 'vitest';

import { PlatformService } from '../src/modules/platform/platform.service.js';

describe('dashboard da plataforma sem dados', () => {
  it('retorna métricas zeradas em vez de erro', async () => {
    const count = vi.fn().mockResolvedValue(0);
    const client = {
      tenant: { count, findMany: vi.fn().mockResolvedValue([]) },
      user: { count },
      tenantMembership: { count },
      businessUnit: { count },
      tenantSubscription: { count, groupBy: vi.fn().mockResolvedValue([]) },
      auditLog: { findMany: vi.fn().mockResolvedValue([]) },
      commercialPlan: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: (value: Promise<unknown>[]) => Promise.all(value),
    };
    const service = Object.create(PlatformService.prototype) as PlatformService;
    Object.assign(service as object, { client });

    await expect(service.dashboard('30d')).resolves.toMatchObject({
      period: '30d',
      counts: {
        tenants: 0,
        activeTenants: 0,
        activeSubscriptions: 0,
        pastDueSubscriptions: 0,
      },
      estimatedRevenue: { mrrCents: '0', arrCents: '0' },
      byPlan: [],
      recentTenants: [],
      recentAudit: [],
    });
  });
});
