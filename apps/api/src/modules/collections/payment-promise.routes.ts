import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type PaymentPromiseService } from './payment-promise.service.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';

const PaymentPromiseListItemSchema = z.object({
  publicId: z.string(),
  debtPublicId: z.string(),
  debtorName: z.string(),
  promisedDate: z.string(),
  status: z.enum(['ACTIVE', 'FULFILLED', 'OVERDUE', 'REPLACED', 'CANCELED']),
  source: z.string(),
  currentBalanceCents: z.string(),
  createdAt: z.string(),
});

export const paymentPromiseRoutes: FastifyPluginAsyncZod<{
  service: PaymentPromiseService;
  authService: AuthService;
  cookieName: string;
  client?: PrismaClient;
}> = async (app, o) => {
  await app.register(tenantContextPlugin, { authService: o.authService, cookieName: o.cookieName, client: o.client });

  app.get(
    '/tenant/payment-promises',
    {
      schema: {
        querystring: z.object({
          status: z.enum(['ACTIVE', 'FULFILLED', 'OVERDUE', 'REPLACED', 'CANCELED']).optional(),
        }),
        response: { 200: z.array(PaymentPromiseListItemSchema) },
      },
    },
    async (r) => {
      o.authService.requirePermission(r.tenant, 'collection.read');
      return o.service.listByTenant(r.tenant.id, r.query.status);
    },
  );
};
