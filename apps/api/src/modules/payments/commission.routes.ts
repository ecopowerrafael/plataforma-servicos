import { CommissionListResponseSchema, CommissionQuerySchema } from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { type ProfessionalCommissionService } from './professional-commission.service.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';

export const commissionRoutes: FastifyPluginAsyncZod<{
  service: ProfessionalCommissionService;
  authService: AuthService;
  cookieName: string;
  client?: PrismaClient;
}> = async (app, o) => {
  await app.register(tenantContextPlugin, { authService: o.authService, cookieName: o.cookieName, client: o.client });

  app.get(
    '/tenant/commissions',
    {
      schema: {
        querystring: CommissionQuerySchema,
        response: { 200: CommissionListResponseSchema },
      },
    },
    (r) => {
      o.authService.requirePermission(r.tenant, 'commission.read');
      return o.service.list(r.tenant.id, r.query);
    },
  );
};
