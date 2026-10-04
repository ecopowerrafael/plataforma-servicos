import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { describe, expect, it } from 'vitest';

import { AppError } from '../../errors/AppError.js';
import { customerMembershipRoutes } from './customer-membership.routes.js';

describe('customer membership routes authentication', () => {
  it('rejects an unauthenticated list request before reaching the handler', async () => {
    const app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(cookie);
    await app.register(customerMembershipRoutes, {
      authService: {
        authenticate: async () => {
          throw new AppError({
            code: 'AUTH_REQUIRED',
            message: 'Autenticação obrigatória.',
            statusCode: 401,
          });
        },
        resolveTenant: async () => {
          throw new Error('resolveTenant should not run without authentication');
        },
      } as never,
      cookieName: 'session',
      client: {} as never,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/tenant/customer-memberships',
      headers: { 'x-tenant-id': '00000000-0000-0000-0000-000000000001' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.statusCode).not.toBe(500);
    await app.close();
  });
});
