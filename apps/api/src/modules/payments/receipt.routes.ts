import { ReceiptPublicSchema } from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type ReceiptService } from './receipt.service.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';

const params = z.object({ publicId: z.uuid(), paymentPublicId: z.uuid() });

export const receiptRoutes: FastifyPluginAsyncZod<{
  service: ReceiptService;
  authService: AuthService;
  cookieName: string;
  client?: PrismaClient;
}> = async (app, o) => {
  await app.register(tenantContextPlugin, { authService: o.authService, cookieName: o.cookieName, client: o.client });
  const actor = (r: { auth: { user: { id: bigint }; session: { id: bigint } } }) => ({
    userId: r.auth.user.id,
    sessionId: r.auth.session.id,
  });

  app.get(
    '/tenant/appointments/:publicId/payments/:paymentPublicId/receipt',
    { schema: { params, response: { 200: ReceiptPublicSchema } } },
    (r) => {
      o.authService.requirePermission(r.tenant, 'payment.read');
      return o.service.getForPayment(
        r.tenant.id,
        r.params.publicId,
        r.params.paymentPublicId,
        actor(r),
      );
    },
  );
};
