import {
  AppointmentPaymentsResponseSchema,
  CancelPaymentRequestSchema,
  CreatePaymentRequestSchema,
  PaymentPublicSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type PaymentService } from './payment.service.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';

const params = z.object({ publicId: z.uuid() });
const paymentParams = z.object({ publicId: z.uuid(), paymentPublicId: z.uuid() });

export const paymentRoutes: FastifyPluginAsyncZod<{
  service: PaymentService;
  authService: AuthService;
  cookieName: string;
}> = async (app, o) => {
  await app.register(tenantContextPlugin, { authService: o.authService, cookieName: o.cookieName });
  const actor = (r: { auth: { user: { id: bigint }; session: { id: bigint } } }) => ({
    userId: r.auth.user.id,
    sessionId: r.auth.session.id,
  });

  app.get(
    '/tenant/appointments/:publicId/payments',
    { schema: { params, response: { 200: AppointmentPaymentsResponseSchema } } },
    (r) => {
      o.authService.requirePermission(r.tenant, 'payment.read');
      return o.service.listForAppointment(r.tenant.id, r.params.publicId);
    },
  );

  app.post(
    '/tenant/appointments/:publicId/payments',
    {
      schema: {
        params,
        body: CreatePaymentRequestSchema,
        response: { 201: PaymentPublicSchema },
      },
    },
    async (r, reply) => {
      o.authService.requirePermission(r.tenant, 'payment.manage');
      const created = await o.service.create(r.tenant.id, r.params.publicId, r.body, actor(r));
      return reply.status(201).send(created);
    },
  );

  app.post(
    '/tenant/appointments/:publicId/payments/:paymentPublicId/cancel',
    {
      schema: {
        params: paymentParams,
        body: CancelPaymentRequestSchema,
        response: { 200: PaymentPublicSchema },
      },
    },
    (r) => {
      o.authService.requirePermission(r.tenant, 'payment.manage');
      return o.service.cancel(
        r.tenant.id,
        r.params.publicId,
        r.params.paymentPublicId,
        r.body.reason,
        actor(r),
      );
    },
  );
};
