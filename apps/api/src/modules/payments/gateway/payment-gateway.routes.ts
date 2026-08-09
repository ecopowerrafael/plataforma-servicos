import {
  CancelGatewayChargeRequestSchema,
  CreateGatewayChargeRequestSchema,
  GatewayChargeListResponseSchema,
  GatewayConfigQuerySchema,
  PaymentGatewayChargePublicSchema,
  PaymentGatewayConfigPublicSchema,
  UpsertPaymentGatewayConfigRequestSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type PaymentGatewayService } from './payment-gateway.service.js';
import { type AuthService } from '../../auth/auth.service.js';
import { tenantContextPlugin } from '../../tenants/tenant-context.plugin.js';

const appointmentParams = z.object({ publicId: z.uuid() });
const chargeParams = z.object({ publicId: z.uuid() });
const refreshQuery = z.object({ refresh: z.enum(['true', 'false']).optional() });

export const paymentGatewayRoutes: FastifyPluginAsyncZod<{
  service: PaymentGatewayService;
  authService: AuthService;
  cookieName: string;
}> = async (app, o) => {
  await app.register(tenantContextPlugin, { authService: o.authService, cookieName: o.cookieName });
  const actor = (r: { auth: { user: { id: bigint }; session: { id: bigint } } }) => ({
    userId: r.auth.user.id,
    sessionId: r.auth.session.id,
  });

  app.get(
    '/tenant/payment-gateway',
    {
      schema: {
        querystring: GatewayConfigQuerySchema,
        response: { 200: PaymentGatewayConfigPublicSchema.nullable() },
      },
    },
    (r) => {
      o.authService.requirePermission(r.tenant, 'payment_gateway.read');
      return o.service.getConfig(r.tenant.id, r.query.provider);
    },
  );

  app.put(
    '/tenant/payment-gateway',
    {
      schema: {
        body: UpsertPaymentGatewayConfigRequestSchema,
        response: { 200: PaymentGatewayConfigPublicSchema },
      },
    },
    (r) => {
      o.authService.requirePermission(r.tenant, 'payment_gateway.manage');
      return o.service.upsertConfig(r.tenant.id, r.body, actor(r));
    },
  );

  app.post(
    '/tenant/appointments/:publicId/gateway-charges',
    {
      schema: {
        params: appointmentParams,
        querystring: GatewayConfigQuerySchema,
        body: CreateGatewayChargeRequestSchema,
        response: { 201: PaymentGatewayChargePublicSchema },
      },
    },
    async (r, reply) => {
      o.authService.requirePermission(r.tenant, 'payment.manage');
      const created = await o.service.createCharge(
        r.tenant.id,
        r.params.publicId,
        r.query.provider,
        r.body,
        actor(r),
      );
      return reply.status(201).send(created);
    },
  );

  app.get(
    '/tenant/appointments/:publicId/gateway-charges',
    { schema: { params: appointmentParams, response: { 200: GatewayChargeListResponseSchema } } },
    (r) => {
      o.authService.requirePermission(r.tenant, 'payment.read');
      return o.service.listForAppointment(r.tenant.id, r.params.publicId);
    },
  );

  app.get(
    '/tenant/gateway-charges/:publicId',
    {
      schema: {
        params: chargeParams,
        querystring: refreshQuery,
        response: { 200: PaymentGatewayChargePublicSchema },
      },
    },
    (r) => {
      o.authService.requirePermission(r.tenant, 'payment.read');
      return o.service.getCharge(r.tenant.id, r.params.publicId, r.query.refresh === 'true');
    },
  );

  app.post(
    '/tenant/gateway-charges/:publicId/cancel',
    {
      schema: {
        params: chargeParams,
        body: CancelGatewayChargeRequestSchema,
        response: { 200: PaymentGatewayChargePublicSchema },
      },
    },
    (r) => {
      o.authService.requirePermission(r.tenant, 'payment.manage');
      return o.service.cancelCharge(r.tenant.id, r.params.publicId, r.body.reason, actor(r));
    },
  );

  app.post(
    '/tenant/gateway-charges/:publicId/confirm',
    { schema: { params: chargeParams, response: { 200: PaymentGatewayChargePublicSchema } } },
    (r) => {
      o.authService.requirePermission(r.tenant, 'payment.manage');
      return o.service.confirmManualCharge(r.tenant.id, r.params.publicId, actor(r));
    },
  );
};

const webhookParams = z.object({ tenantPublicId: z.uuid(), provider: z.string().min(1) });

export const paymentGatewayWebhookRoutes: FastifyPluginAsyncZod<{
  service: PaymentGatewayService;
}> = async (app, o) => {
  await Promise.resolve();
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
    done(null, body);
  });

  app.post(
    '/public/gateway-webhooks/:tenantPublicId/:provider',
    { schema: { params: webhookParams } },
    async (r, reply) => {
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(r.headers)) {
        if (typeof value === 'string') headers[key] = value;
        else if (Array.isArray(value)) headers[key] = value.join(', ');
      }
      const rawBody = typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? {});
      const result = await o.service.handleWebhook(
        r.params.tenantPublicId,
        r.params.provider,
        rawBody,
        headers,
      );
      return reply.status(200).send(result);
    },
  );
};
