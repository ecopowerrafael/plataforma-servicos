import {
  CancelLoyaltyRedemptionRequestSchema,
  LoyaltyAccountSummarySchema,
  LoyaltyLedgerEntryPublicSchema,
  LoyaltyLedgerListResponseSchema,
  LoyaltyRuleListResponseSchema,
  LoyaltyRulePublicSchema,
  LoyaltyTypeSchema,
  RedeemLoyaltyRequestSchema,
  UpsertLoyaltyRuleRequestSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type LoyaltyService } from './loyalty.service.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type AuthService } from '../auth/auth.service.js';
import { type CustomerAuthService } from '../customers/customer-auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';

const ruleParams = z.object({ type: LoyaltyTypeSchema }).strict();
const appointmentParams = z.object({ publicId: z.uuid() });
const customerParams = z.object({ publicId: z.uuid() });
const redemptionParams = z.object({ publicId: z.uuid(), entryPublicId: z.uuid() });

export const loyaltyRoutes: FastifyPluginAsyncZod<{
  service: LoyaltyService;
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
    '/tenant/loyalty/rules',
    { schema: { response: { 200: LoyaltyRuleListResponseSchema } } },
    (r) => {
      o.authService.requirePermission(r.tenant, 'loyalty.read');
      return o.service.listRules(r.tenant.id);
    },
  );

  app.put(
    '/tenant/loyalty/rules/:type',
    {
      schema: {
        params: ruleParams,
        body: UpsertLoyaltyRuleRequestSchema,
        response: { 200: LoyaltyRulePublicSchema },
      },
    },
    (r) => {
      o.authService.requirePermission(r.tenant, 'loyalty.manage');
      return o.service.updateRule(r.tenant.id, r.params.type, r.body, actor(r));
    },
  );

  app.get(
    '/tenant/customers/:publicId/loyalty',
    { schema: { params: customerParams, response: { 200: LoyaltyAccountSummarySchema } } },
    async (r) => {
      o.authService.requirePermission(r.tenant, 'loyalty.read');
      const customer = await o.service.resolveCustomerId(r.tenant.id, r.params.publicId);
      return o.service.accountSummary(r.tenant.id, customer);
    },
  );

  app.get(
    '/tenant/appointments/:publicId/loyalty',
    { schema: { params: appointmentParams, response: { 200: LoyaltyLedgerListResponseSchema } } },
    (r) => {
      o.authService.requirePermission(r.tenant, 'payment.read');
      return o.service.listForAppointment(r.tenant.id, r.params.publicId);
    },
  );

  app.post(
    '/tenant/appointments/:publicId/loyalty',
    {
      schema: {
        params: appointmentParams,
        body: RedeemLoyaltyRequestSchema,
        response: { 201: LoyaltyLedgerEntryPublicSchema },
      },
    },
    async (r, reply) => {
      o.authService.requirePermission(r.tenant, 'payment.manage');
      const created = await o.service.redeem(
        r.tenant.id,
        r.params.publicId,
        r.body.type,
        BigInt(r.body.amount),
        actor(r),
      );
      return reply.status(201).send(created);
    },
  );

  app.post(
    '/tenant/appointments/:publicId/loyalty/:entryPublicId/cancel',
    {
      schema: {
        params: redemptionParams,
        body: CancelLoyaltyRedemptionRequestSchema,
        response: { 200: LoyaltyLedgerEntryPublicSchema },
      },
    },
    (r) => {
      o.authService.requirePermission(r.tenant, 'payment.manage');
      return o.service.cancelRedemption(
        r.tenant.id,
        r.params.publicId,
        r.params.entryPublicId,
        actor(r),
      );
    },
  );
};

const SlugParamsSchema = z.object({ slug: z.string().trim().min(1).max(63) }).strict();

export const customerLoyaltyRoutes: FastifyPluginAsyncZod<{
  service: LoyaltyService;
  authService: CustomerAuthService;
  cookieName: string;
}> = (app, o) => {
  app.get(
    '/public/sites/:slug/customer/loyalty',
    { schema: { params: SlugParamsSchema, response: { 200: LoyaltyAccountSummarySchema } } },
    async (request) => {
      const session = await o.authService.authenticate(request.cookies[o.cookieName]);
      return o.service.accountSummary(session.tenantId, session.customer.id);
    },
  );

  return Promise.resolve();
};
