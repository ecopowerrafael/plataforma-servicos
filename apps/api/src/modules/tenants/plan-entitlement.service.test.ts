import { describe, expect, it } from 'vitest';

import { PlanEntitlementService } from './plan-entitlement.service.js';

const tenantId = 17n;
const subscription = { status: 'ACTIVE', trialEndsAt: null, currentPeriodEndsAt: new Date('2099-01-01T00:00:00Z'), graceEndsAt: null };
const featureClient = (enabled: boolean) =>
  ({
    tenantSubscription: {
      findFirst: () => Promise.resolve({
        tenantId,
        ...subscription,
        plan: { limits: [{ booleanValue: enabled }] },
      }),
    },
    tenantCommercialPolicy: { findUnique: () => Promise.resolve({ singleton: true, autoSuspendAfterGrace: true, allowAdminLoginWhileBlocked: false, allowCalendarReadWhileBlocked: false, allowAdminChangesWhileBlocked: false, allowInternalBookingWhileBlocked: false, allowPublicBookingWhileBlocked: false, publicSiteBehaviorWhileBlocked: 'OFFLINE', adminMessage: 'blocked', publicMessage: 'blocked' }) },
  }) as never;

describe('PlanEntitlementService feature gates', () => {
  it('falha fechado sem assinatura', async () => {
    const client = { tenantSubscription: { findFirst: async () => null } } as never;
    await expect(new PlanEntitlementService().assertFeatureEnabledForTenant(client, tenantId, 'coupons.enabled')).rejects.toMatchObject({ code: 'TENANT_SUBSCRIPTION_REQUIRED' });
  });

  it('falha fechado quando a feature booleana está ausente', async () => {
    const client: any = featureClient(true);
    client.tenantSubscription.findFirst = async () => ({ ...subscription, plan: { limits: [] } });
    await expect(new PlanEntitlementService().assertFeatureEnabledForTenant(client, tenantId, 'coupons.enabled')).rejects.toMatchObject({ code: 'PLAN_FEATURE_UNAVAILABLE' });
  });
  it('permite o recurso quando a feature está habilitada no plano efetivo', async () => {
    await expect(
      new PlanEntitlementService().assertFeatureEnabledForTenant(
        featureClient(true), tenantId, 'coupons.enabled',
      ),
    ).resolves.toBeUndefined();
  });

  it('bloqueia o recurso quando a feature está desabilitada', async () => {
    await expect(
      new PlanEntitlementService().assertFeatureEnabledForTenant(
        featureClient(false), tenantId, 'stock.enabled',
      ),
    ).rejects.toMatchObject({ code: 'PLAN_FEATURE_UNAVAILABLE', statusCode: 403 });
  });

  it('consulta exclusivamente a assinatura efetiva do tenant solicitado', async () => {
    let query: unknown;
    const client = { tenantSubscription: { findFirst: (input: unknown) => {
      query = input;
      return Promise.resolve({ tenantId, ...subscription, plan: { limits: [{ booleanValue: true }] } });
    } }, tenantCommercialPolicy: { findUnique: () => Promise.resolve({ singleton: true, autoSuspendAfterGrace: true, allowAdminLoginWhileBlocked: false, allowCalendarReadWhileBlocked: false, allowAdminChangesWhileBlocked: false, allowInternalBookingWhileBlocked: false, allowPublicBookingWhileBlocked: false, publicSiteBehaviorWhileBlocked: 'OFFLINE', adminMessage: 'blocked', publicMessage: 'blocked' }) } } as never;
    await new PlanEntitlementService().assertFeatureEnabledForTenant(client, tenantId, 'automations.enabled');
    expect(query).toMatchObject({ where: { tenantId, effectiveKey: 'EFFECTIVE' } });
  });

  it.each([
    ['ausente', undefined, 'PLAN_LIMIT_UNAVAILABLE'],
    ['zero', { integerValue: 0n }, 'PLAN_LIMIT_REACHED'],
    ['positivo', { integerValue: 2n }, null],
    ['ilimitado', { integerValue: null }, null],
  ])('trata limite %s explicitamente', async (_name, limit, error) => {
    const client: any = { $queryRaw: async () => [], tenantCommercialPolicy: { findUnique: async () => ({ singleton: true, autoSuspendAfterGrace: true, allowAdminLoginWhileBlocked: false, allowCalendarReadWhileBlocked: false, allowAdminChangesWhileBlocked: false, allowInternalBookingWhileBlocked: false, allowPublicBookingWhileBlocked: false, publicSiteBehaviorWhileBlocked: 'OFFLINE', adminMessage: 'blocked', publicMessage: 'blocked' }) }, tenantSubscription: { findFirst: async () => ({ ...subscription, plan: { limits: limit === undefined ? [] : [limit] } }) }, businessUnit: { count: async () => 0 } };
    const result = new PlanEntitlementService().assertCanCreateUnit(client, tenantId);
    if (error) await expect(result).rejects.toMatchObject({ code: error }); else await expect(result).resolves.toBeUndefined();
  });
});
