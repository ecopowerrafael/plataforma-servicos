import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { describe, expect, it, vi } from 'vitest';

import { AppError } from '../../errors/AppError.js';
import { CustomerMembershipService } from './customer-membership.service.js';
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
    customerMembership: {
      findFirst: vi.fn().mockResolvedValue({
        id: 10n,
        publicId: '00000000-0000-4000-8000-000000000010',
        status: 'ACTIVE',
        canceledAt: null,
        nextBillingAt: new Date('2026-11-01T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
      }),
    },
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

  it('cliente A não consegue selecionar Membership de B e todas as ações usam a sessão', async () => {
    const fixture = await setup({ operatingModel: 'MEMBERSHIP', membershipSalesEnabled: true });
    const cancel = vi.spyOn(CustomerMembershipService.prototype, 'cancel').mockResolvedValue({
      publicId: '00000000-0000-4000-8000-000000000010',
      status: 'CANCELED',
      canceledAt: new Date('2026-10-06T00:00:00.000Z'),
      nextBillingAt: null,
      cancelAtPeriodEnd: false,
    });
    const schedule = vi
      .spyOn(CustomerMembershipService.prototype, 'scheduleCancelAtPeriodEnd')
      .mockResolvedValue({
        publicId: '00000000-0000-4000-8000-000000000010',
        status: 'ACTIVE',
        canceledAt: null,
        nextBillingAt: new Date('2026-11-01T00:00:00.000Z'),
        cancelAtPeriodEnd: true,
      });
    const revoke = vi
      .spyOn(CustomerMembershipService.prototype, 'revokeCancelAtPeriodEnd')
      .mockResolvedValue({
        publicId: '00000000-0000-4000-8000-000000000010',
        status: 'ACTIVE',
        canceledAt: null,
        nextBillingAt: new Date('2026-11-01T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
      });

    const rejected = await fixture.app.inject({
      method: 'POST',
      url: '/public/sites/studio/customer/membership/cancel',
      cookies: { customer_session: 'opaque-token' },
      payload: { membershipId: 'another-membership', customerId: 'another-customer' },
    });
    expect(rejected.statusCode).toBe(400);
    expect(cancel).not.toHaveBeenCalled();

    const response = await fixture.app.inject({
      method: 'POST',
      url: '/public/sites/studio/customer/membership/cancel',
      cookies: { customer_session: 'opaque-token' },
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    expect(cancel).toHaveBeenCalledWith(1n, '00000000-0000-4000-8000-000000000010', {
      userId: null,
      sessionId: 8n,
    });
    expect(fixture.client.customerMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 1n, customerId: 9n }),
      }),
    );

    await fixture.app.inject({
      method: 'POST',
      url: '/public/sites/studio/customer/membership/cancel-at-period-end',
      cookies: { customer_session: 'opaque-token' },
      payload: {},
    });
    await fixture.app.inject({
      method: 'DELETE',
      url: '/public/sites/studio/customer/membership/cancel-at-period-end',
      cookies: { customer_session: 'opaque-token' },
    });
    expect(schedule).toHaveBeenCalledWith(1n, '00000000-0000-4000-8000-000000000010', {
      userId: null,
      sessionId: 8n,
    });
    expect(revoke).toHaveBeenCalledWith(1n, '00000000-0000-4000-8000-000000000010', {
      userId: null,
      sessionId: 8n,
    });

    cancel.mockRestore();
    schedule.mockRestore();
    revoke.mockRestore();
    await fixture.app.close();
  });

  it('rejeita sessão do tenant incorreto antes de qualquer mutation', async () => {
    const fixture = await setup({ operatingModel: 'MEMBERSHIP', membershipSalesEnabled: true });
    fixture.authenticate.mockRejectedValueOnce(
      new AppError({
        code: 'CUSTOMER_TENANT_MISMATCH',
        message: 'Sessão incompatível com o tenant.',
        statusCode: 401,
      }),
    );
    const cancel = vi.spyOn(CustomerMembershipService.prototype, 'cancel');

    const response = await fixture.app.inject({
      method: 'POST',
      url: '/public/sites/tenant-b/customer/membership/cancel',
      cookies: { customer_session: 'tenant-a-token' },
      payload: {},
    });

    expect(response.statusCode).toBe(401);
    expect(cancel).not.toHaveBeenCalled();
    expect(fixture.client.customerMembership.findFirst).not.toHaveBeenCalled();
    cancel.mockRestore();
    await fixture.app.close();
  });
});
