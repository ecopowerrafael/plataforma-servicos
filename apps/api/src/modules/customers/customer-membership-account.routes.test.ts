import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { describe, expect, it, vi } from 'vitest';

import { AppError } from '../../errors/AppError.js';
import { customerMembershipAccountRoutes } from './customer-membership-account.routes.js';

async function setup(authenticateForTenantSlug: ReturnType<typeof vi.fn>) {
  const app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  const findMany = vi.fn().mockResolvedValue([]);
  await app.register(cookie);
  await app.register(customerMembershipAccountRoutes, {
    authService: { authenticateForTenantSlug } as never,
    cookieName: 'customer_session',
    client: {
      customerMembership: { findMany },
      customerMembershipUsage: { groupBy: vi.fn() },
    } as never,
  });
  return { app, findMany };
}

describe('customer membership account routes', () => {
  it('deriva a conta da sessão e aceita somente o slug correspondente', async () => {
    const authenticate = vi.fn().mockResolvedValue({ tenantId: 1n, customer: { id: 5n } });
    const fixture = await setup(authenticate);
    const response = await fixture.app.inject({
      method: 'GET',
      url: '/public/sites/studio/customer/membership',
      cookies: { customer_session: 'opaque-token' },
    });
    expect(response.statusCode).toBe(200);
    expect(authenticate).toHaveBeenCalledWith('opaque-token', 'studio');
    expect(fixture.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 1n, customerId: 5n } }),
    );
    expect(response.json()).toEqual({ current: null, history: [] });
    await fixture.app.close();
  });

  it('recusa slug incompatível antes de consultar Membership', async () => {
    const authenticate = vi.fn().mockRejectedValue(
      new AppError({
        code: 'CUSTOMER_AUTH_REQUIRED',
        message: 'Autenticação obrigatória.',
        statusCode: 401,
      }),
    );
    const fixture = await setup(authenticate);
    const response = await fixture.app.inject({
      method: 'GET',
      url: '/public/sites/outro/customer/membership',
      cookies: { customer_session: 'opaque-token' },
    });
    expect(response.statusCode).toBe(401);
    expect(fixture.findMany).not.toHaveBeenCalled();
    await fixture.app.close();
  });
});
