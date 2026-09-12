import { describe, expect, it } from 'vitest';

import { PlanEntitlementService } from './plan-entitlement.service.js';

const tenantId = 17n;
const featureClient = (enabled: boolean) =>
  ({
    tenantSubscription: {
      findFirst: () => Promise.resolve({
        tenantId,
        plan: { limits: [{ booleanValue: enabled }] },
      }),
    },
  }) as never;

describe('PlanEntitlementService feature gates', () => {
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
      return Promise.resolve({ tenantId, plan: { limits: [{ booleanValue: true }] } });
    } } } as never;
    await new PlanEntitlementService().assertFeatureEnabledForTenant(client, tenantId, 'automations.enabled');
    expect(query).toMatchObject({ where: { tenantId, effectiveKey: 'EFFECTIVE' } });
  });
});
