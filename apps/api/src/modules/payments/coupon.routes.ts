import {
  CancelPaymentRequestSchema,
  CouponListResponseSchema,
  CouponPublicSchema,
  CouponRedemptionListResponseSchema,
  CouponRedemptionPublicSchema,
  CreateCouponRequestSchema,
  RedeemCouponRequestSchema,
  UpdateCouponRequestSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type CouponService } from './coupon.service.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';

const couponParams = z.object({ publicId: z.uuid() });
const appointmentParams = z.object({ publicId: z.uuid() });
const redemptionParams = z.object({ publicId: z.uuid(), redemptionPublicId: z.uuid() });

export const couponRoutes: FastifyPluginAsyncZod<{
  service: CouponService;
  authService: AuthService;
  cookieName: string;
}> = async (app, o) => {
  await app.register(tenantContextPlugin, { authService: o.authService, cookieName: o.cookieName });
  const actor = (r: { auth: { user: { id: bigint }; session: { id: bigint } } }) => ({
    userId: r.auth.user.id,
    sessionId: r.auth.session.id,
  });

  app.get('/tenant/coupons', { schema: { response: { 200: CouponListResponseSchema } } }, (r) => {
    o.authService.requirePermission(r.tenant, 'coupon.read');
    return o.service.list(r.tenant.id);
  });

  app.post(
    '/tenant/coupons',
    { schema: { body: CreateCouponRequestSchema, response: { 201: CouponPublicSchema } } },
    async (r, reply) => {
      o.authService.requirePermission(r.tenant, 'coupon.manage');
      const created = await o.service.create(r.tenant.id, r.body, actor(r));
      return reply.status(201).send(created);
    },
  );

  app.patch(
    '/tenant/coupons/:publicId',
    {
      schema: {
        params: couponParams,
        body: UpdateCouponRequestSchema,
        response: { 200: CouponPublicSchema },
      },
    },
    (r) => {
      o.authService.requirePermission(r.tenant, 'coupon.manage');
      return o.service.update(r.tenant.id, r.params.publicId, r.body, actor(r));
    },
  );

  app.get(
    '/tenant/appointments/:publicId/coupons',
    {
      schema: { params: appointmentParams, response: { 200: CouponRedemptionListResponseSchema } },
    },
    (r) => {
      o.authService.requirePermission(r.tenant, 'payment.read');
      return o.service.listRedemptions(r.tenant.id, r.params.publicId);
    },
  );

  app.post(
    '/tenant/appointments/:publicId/coupons',
    {
      schema: {
        params: appointmentParams,
        body: RedeemCouponRequestSchema,
        response: { 201: CouponRedemptionPublicSchema },
      },
    },
    async (r, reply) => {
      o.authService.requirePermission(r.tenant, 'payment.manage');
      const created = await o.service.redeem(r.tenant.id, r.params.publicId, r.body.code, actor(r));
      return reply.status(201).send(created);
    },
  );

  app.post(
    '/tenant/appointments/:publicId/coupons/:redemptionPublicId/cancel',
    {
      schema: {
        params: redemptionParams,
        body: CancelPaymentRequestSchema,
        response: { 200: CouponRedemptionPublicSchema },
      },
    },
    (r) => {
      o.authService.requirePermission(r.tenant, 'payment.manage');
      return o.service.cancelRedemption(
        r.tenant.id,
        r.params.publicId,
        r.params.redemptionPublicId,
        r.body.reason,
        actor(r),
      );
    },
  );
};
