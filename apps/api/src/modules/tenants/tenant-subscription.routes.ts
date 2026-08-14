import { CreatePlatformChargeSchema, PlatformChargeResponseSchema, PlatformSubscriptionBillingSchema, TenantSubscriptionResponseSchema } from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { tenantContextPlugin } from './tenant-context.plugin.js';
import { type TenantSubscriptionService } from './tenant-subscription.service.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type AuthService } from '../auth/auth.service.js';
import { type PlatformBillingService } from '../platform/platform-billing.service.js';

interface Options {
  service: TenantSubscriptionService;
  authService: AuthService;
  cookieName: string;
  client?: PrismaClient;
  billingService?: PlatformBillingService;
}

export const tenantSubscriptionRoutes: FastifyPluginAsyncZod<Options> = async (app, options) => {
  await app.register(tenantContextPlugin, {
    authService: options.authService,
    cookieName: options.cookieName,
    client: options.client,
  });

  app.get(
    '/tenant/subscription',
    { schema: { response: { 200: TenantSubscriptionResponseSchema } } },
    (r) => {
      options.authService.requirePermission(r.tenant, 'tenant.subscription.read');
      return options.service.get(r.tenant.id);
    },
  );
  app.post(
    '/tenant/subscription/select-plan',
    { schema: { body: z.object({ planPublicId: z.uuid(), billingCycle: z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL']) }).strict(), response: { 200: TenantSubscriptionResponseSchema } } },
    (r) => {
      options.authService.requirePermission(r.tenant, 'tenant.subscription.read');
      if (!r.tenant.membership.isOwner)
        throw new Error('Apenas o proprietário pode alterar o plano.');
      return options.service.selectPlan(r.tenant.id, r.body.planPublicId, r.body.billingCycle);
    },
  );
  if(options.billingService){const billing=options.billingService;
    app.get('/tenant/subscription/billing',{schema:{response:{200:PlatformSubscriptionBillingSchema}}},r=>{options.authService.requirePermission(r.tenant,'tenant.subscription.read');return billing.tenantOverview(r.tenant.id);});
    app.post('/tenant/subscription/charges',{schema:{body:CreatePlatformChargeSchema,response:{200:PlatformChargeResponseSchema}}},r=>{options.authService.requirePermission(r.tenant,'tenant.subscription.read');if(!r.tenant.membership.isOwner)throw new Error('Apenas o proprietário pode pagar a assinatura.');return billing.createTenantCharge(r.tenant.id,r.body.provider);});
  }
};
