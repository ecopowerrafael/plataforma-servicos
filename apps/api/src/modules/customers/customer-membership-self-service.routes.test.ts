import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { describe, expect, it, vi } from 'vitest';

import { customerMembershipSelfServiceRoutes } from './customer-membership-self-service.routes.js';

async function setup(feature: { operatingModel: string; membershipSalesEnabled: boolean }) {
  const app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  const authenticate = vi.fn().mockResolvedValue({
    tenantId: 1n,
    id: 8n,
    customer: { id: 9n, publicId: '00000000-0000-4000-8000-000000000009' },
  });
  const client = {
    tenant: {
      findFirst: vi.fn().mockResolvedValue({
        operatingModel: feature.operatingModel,
        settings: { membershipSalesEnabled: feature.membershipSalesEnabled },
      }),
    },
    customerMembershipPlan: { findMany: vi.fn().mockResolvedValue([]) },
  };
  await app.register(cookie);
  await app.register(customerMembershipSelfServiceRoutes, {
    authService: { authenticateForTenantSlug: authenticate } as never,
    cookieName: 'customer_session',
    client: client as never,
  });
  return { app, authenticate, client };
}

describe('customer membership self-service routes', () => {
  it('returns an empty catalog when the complete commercial gate is off', async () => {
    const fixture = await setup({ operatingModel: 'MEMBERSHIP', membershipSalesEnabled: false });
    const response = await fixture.app.inject({
      method: 'GET',
      url: '/public/sites/studio/customer/membership/plans',
      cookies: { customer_session: 'opaque-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [] });
    expect(fixture.client.customerMembershipPlan.findMany).not.toHaveBeenCalled();
    expect(fixture.authenticate).toHaveBeenCalledWith('opaque-token', 'studio');
    await fixture.app.close();
  });

  it('rejects mass-assignment fields before authentication or persistence', async () => {
    const fixture = await setup({ operatingModel: 'MEMBERSHIP', membershipSalesEnabled: true });
    const response = await fixture.app.inject({
      method: 'POST',
      url: '/public/sites/studio/customer/membership',
      cookies: { customer_session: 'opaque-token' },
      payload: {
        planPublicId: '00000000-0000-4000-8000-000000000001',
        tenantId: '2',
        customerId: 'other-customer',
        status: 'ACTIVE',
        priceCents: 1,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(fixture.authenticate).not.toHaveBeenCalled();
    await fixture.app.close();
  });
});
