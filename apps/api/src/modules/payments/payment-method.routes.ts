import {
  CreatePaymentMethodRequestSchema,
  PaymentMethodListResponseSchema,
  PaymentMethodPublicSchema,
  UpdatePaymentMethodRequestSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type PaymentMethodService } from './payment-method.service.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';
import { type PrismaClient } from '../../database-client/client.js';

const params = z.object({ publicId: z.uuid() });

export const paymentMethodRoutes: FastifyPluginAsyncZod<{
  service: PaymentMethodService;
  authService: AuthService;
  cookieName: string;
  client?: PrismaClient;
}> = async (app, o) => {
  await app.register(tenantContextPlugin, { authService: o.authService, cookieName: o.cookieName, client: o.client });

  app.get(
    '/tenant/payment-methods',
    { schema: { response: { 200: PaymentMethodListResponseSchema } } },
    (r) => {
      o.authService.requirePermission(r.tenant, 'payment.read');
      return o.service.list(r.tenant.id);
    },
  );

  app.post(
    '/tenant/payment-methods',
    {
      schema: {
        body: CreatePaymentMethodRequestSchema,
        response: { 201: PaymentMethodPublicSchema },
      },
    },
    async (r, reply) => {
      o.authService.requirePermission(r.tenant, 'payment.manage');
      const created = await o.service.create(r.tenant.id, r.body);
      return reply.status(201).send(created);
    },
  );

  app.patch(
    '/tenant/payment-methods/:publicId',
    {
      schema: {
        params,
        body: UpdatePaymentMethodRequestSchema,
        response: { 200: PaymentMethodPublicSchema },
      },
    },
    (r) => {
      o.authService.requirePermission(r.tenant, 'payment.manage');
      return o.service.update(r.tenant.id, r.params.publicId, r.body);
    },
  );
};
