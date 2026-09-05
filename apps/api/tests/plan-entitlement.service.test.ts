import { describe, expect, it, vi } from 'vitest';

import { PlanEntitlementService } from '../src/modules/tenants/plan-entitlement.service.js';

function transaction(limit: bigint | null, usage: number, feature = false) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([]),
    tenantSubscription: {
      findFirst: vi.fn().mockResolvedValue({
        currentPeriodStartsAt: new Date('2026-01-01T00:00:00.000Z'),
        currentPeriodEndsAt: new Date('2026-01-31T23:59:59.999Z'),
        plan: { limits: [{ integerValue: limit, booleanValue: feature }] },
      }),
    },
    businessUnit: { count: vi.fn().mockResolvedValue(usage) },
    professional: { count: vi.fn().mockResolvedValue(usage) },
    service: { count: vi.fn().mockResolvedValue(usage) },
    tenantMembership: { count: vi.fn().mockResolvedValue(usage) },
    appointment: { count: vi.fn().mockResolvedValue(usage) },
  };
}

describe('PlanEntitlementService', () => {
  it('permite criação abaixo do limite e bloqueia ao atingi-lo', async () => {
    await expect(new PlanEntitlementService().assertCanCreateProfessional(transaction(2n, 1) as never, 1n)).resolves.toBeUndefined();
    await expect(new PlanEntitlementService().assertCanCreateProfessional(transaction(2n, 2) as never, 1n)).rejects.toMatchObject({ code: 'PLAN_LIMIT_REACHED' });
  });

  it('respeita ilimitado e isola o uso pelo tenant consultado', async () => {
    await expect(new PlanEntitlementService().assertCanCreateUnit(transaction(null, 999) as never, 44n)).resolves.toBeUndefined();
    const scoped = transaction(1n, 0);
    await new PlanEntitlementService().assertCanCreateUnit(scoped as never, 44n);
    expect(scoped.businessUnit.count).toHaveBeenCalledWith({ where: { tenantId: 44n, status: 'ACTIVE' } });
  });

  it('bloqueia novo serviço ao atingir o limite de serviços ativos', async () => {
    await expect(
      new PlanEntitlementService().assertCanCreateService(transaction(2n, 2) as never, 44n),
    ).rejects.toMatchObject({ code: 'PLAN_LIMIT_REACHED' });
    const scoped = transaction(2n, 1);
    await new PlanEntitlementService().assertCanCreateService(scoped as never, 44n);
    expect(scoped.service.count).toHaveBeenCalledWith({ where: { tenantId: 44n, active: true } });
  });

  it('bloqueia recurso booleano desabilitado e permite quando habilitado', async () => {
    await expect(new PlanEntitlementService().assertFeatureEnabled(transaction(null, 0, false) as never, 1n, 'custom_domain.enabled')).rejects.toMatchObject({ code: 'PLAN_FEATURE_UNAVAILABLE' });
    await expect(new PlanEntitlementService().assertFeatureEnabled(transaction(null, 0, true) as never, 1n, 'custom_domain.enabled')).resolves.toBeUndefined();
  });
});
