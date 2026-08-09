import {
  AppointmentPaymentOptionsResponseSchema,
  CreateOnlineChargeRequestSchema,
  PaymentGatewayChargePublicSchema,
  PixChargeResponseSchema,
  PublicBookingSlugParamsSchema,
  QrCodeResponseSchema,
  TenantPaymentOptionsOverviewSchema,
  UpsertMercadoPagoConfigRequestSchema,
  UpsertPayLocalOptionRequestSchema,
  UpsertPixLocalConfigRequestSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type TenantPaymentOptionsService } from './tenant-payment-options.service.js';
import { type AuthService } from '../../auth/auth.service.js';
import { tenantContextPlugin } from '../../tenants/tenant-context.plugin.js';

const appointmentParams = z.object({ publicId: z.uuid() });
const publicAppointmentParams = PublicBookingSlugParamsSchema.extend({
  appointmentPublicId: z.uuid(),
});
const chargeParams = z.object({ publicId: z.uuid() });

export const tenantPaymentOptionsRoutes: FastifyPluginAsyncZod<{
  service: TenantPaymentOptionsService;
  authService: AuthService;
  cookieName: string;
}> = async (app, o) => {
  await app.register(tenantContextPlugin, { authService: o.authService, cookieName: o.cookieName });
  const actor = (r: { auth: { user: { id: bigint }; session: { id: bigint } } }) => ({
    userId: r.auth.user.id,
    sessionId: r.auth.session.id,
  });

  app.get(
    '/tenant/payment-options',
    { schema: { response: { 200: TenantPaymentOptionsOverviewSchema } } },
    (r) => {
      o.authService.requirePermission(r.tenant, 'payment_gateway.read');
      return o.service.getOverview(r.tenant.id);
    },
  );

  app.put(
    '/tenant/payment-options/pay-local',
    {
      schema: {
        body: UpsertPayLocalOptionRequestSchema,
        response: { 200: TenantPaymentOptionsOverviewSchema },
      },
    },
    (r) => {
      o.authService.requirePermission(r.tenant, 'payment_gateway.manage');
      return o.service.updatePayLocal(r.tenant.id, r.body, actor(r));
    },
  );

  app.put(
    '/tenant/payment-options/pix-local',
    {
      schema: {
        body: UpsertPixLocalConfigRequestSchema,
        response: { 200: TenantPaymentOptionsOverviewSchema },
      },
    },
    (r) => {
      o.authService.requirePermission(r.tenant, 'payment_gateway.manage');
      return o.service.upsertPixLocal(r.tenant.id, r.body, actor(r));
    },
  );

  app.put(
    '/tenant/payment-options/mercado-pago',
    {
      schema: {
        body: UpsertMercadoPagoConfigRequestSchema,
        response: { 200: TenantPaymentOptionsOverviewSchema },
      },
    },
    (r) => {
      o.authService.requirePermission(r.tenant, 'payment_gateway.manage');
      return o.service.upsertMercadoPago(r.tenant.id, r.body, actor(r));
    },
  );

  app.get(
    '/tenant/appointments/:publicId/payment-options',
    {
      schema: {
        params: appointmentParams,
        response: { 200: AppointmentPaymentOptionsResponseSchema },
      },
    },
    (r) => {
      o.authService.requirePermission(r.tenant, 'payment.read');
      return o.service.getAvailableOptionsForAppointment(r.tenant.id, r.params.publicId);
    },
  );

  app.get(
    '/tenant/gateway-charges/:publicId/pix-qrcode',
    { schema: { params: chargeParams, response: { 200: QrCodeResponseSchema } } },
    (r) => {
      o.authService.requirePermission(r.tenant, 'payment.read');
      return o.service.getPixQrCode(r.tenant.id, r.params.publicId);
    },
  );
};

export const publicTenantPaymentOptionsRoutes: FastifyPluginAsyncZod<{
  service: TenantPaymentOptionsService;
}> = (app, o) => {
  app.get(
    '/public/sites/:slug/appointments/:appointmentPublicId/payment-options',
    {
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      schema: {
        params: publicAppointmentParams,
        response: { 200: AppointmentPaymentOptionsResponseSchema },
      },
    },
    (r) => o.service.getPublicOptionsForAppointment(r.params.slug, r.params.appointmentPublicId),
  );

  app.post(
    '/public/sites/:slug/appointments/:appointmentPublicId/pix-local-charges',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        params: publicAppointmentParams,
        body: CreateOnlineChargeRequestSchema,
        response: { 201: PixChargeResponseSchema },
      },
    },
    async (r, reply) =>
      reply
        .status(201)
        .send(
          await o.service.createPublicPixCharge(
            r.params.slug,
            r.params.appointmentPublicId,
            r.body,
          ),
        ),
  );

  app.post(
    '/public/sites/:slug/appointments/:appointmentPublicId/mercadopago-charges',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        params: publicAppointmentParams,
        body: CreateOnlineChargeRequestSchema,
        response: { 201: PaymentGatewayChargePublicSchema },
      },
    },
    async (r, reply) =>
      reply
        .status(201)
        .send(
          await o.service.createPublicMercadoPagoCharge(
            r.params.slug,
            r.params.appointmentPublicId,
            r.body,
          ),
        ),
  );

  return Promise.resolve();
};
