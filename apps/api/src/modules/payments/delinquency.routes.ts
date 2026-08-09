import { DelinquencyQuerySchema, DelinquencyResponseSchema } from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { type DelinquencyService } from './delinquency.service.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';

export const delinquencyRoutes: FastifyPluginAsyncZod<{
  service: DelinquencyService;
  authService: AuthService;
  cookieName: string;
  client?: PrismaClient;
}> = async (app, o) => {
  await app.register(tenantContextPlugin, { authService: o.authService, cookieName: o.cookieName, client: o.client });

  app.get(
    '/tenant/delinquency',
    {
      schema: {
        querystring: DelinquencyQuerySchema,
        response: { 200: DelinquencyResponseSchema },
      },
    },
    (r) => {
      o.authService.requirePermission(r.tenant, 'payment.read');
      return o.service.list(r.tenant.id, r.query);
    },
  );
};
