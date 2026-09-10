import { CreatePlatformChargeSchema, PlatformChargeResponseSchema, PlatformSubscriptionBillingSchema, SubscriptionChangePreviewSchema, TenantSubscriptionResponseSchema } from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { tenantContextPlugin } from './tenant-context.plugin.js';
import { type TenantSubscriptionService } from './tenant-subscription.service.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type AuthService } from '../auth/auth.service.js';
import { type PlatformBillingService } from '../platform/platform-billing.service.js';
import { SubscriptionPlanChangeService } from './subscription-plan-change.service.js';

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
  app.post('/tenant/subscription/change-preview',{schema:{body:z.object({planPublicId:z.uuid(),billingCycle:z.enum(['MONTHLY','QUARTERLY','SEMIANNUAL','ANNUAL']).optional()}).strict(),response:{200:SubscriptionChangePreviewSchema}}},r=>{options.authService.requirePermission(r.tenant,'tenant.subscription.read');if(!r.tenant.membership.isOwner)throw new Error('Apenas o proprietário pode alterar o plano.');return options.service.previewChange(r.tenant.id,r.body.planPublicId,r.body.billingCycle);});
  app.post('/tenant/subscription/change-request',{schema:{body:z.object({planPublicId:z.uuid(),billingCycle:z.enum(['MONTHLY','QUARTERLY','SEMIANNUAL','ANNUAL']).optional()}).strict(),response:{200:SubscriptionChangePreviewSchema}}},r=>{options.authService.requirePermission(r.tenant,'tenant.subscription.read');if(!r.tenant.membership.isOwner)throw new Error('Apenas o proprietário pode alterar o plano.');return options.service.requestChange(r.tenant.id,r.body.planPublicId,r.body.billingCycle);});
  app.post('/tenant/subscription/changes/:publicId/confirm-manual',{schema:{params:z.object({publicId:z.uuid()}),response:{200:z.object({status:z.string(),publicId:z.uuid()})}},async r=>{options.authService.requirePermission(r.tenant,'tenant.subscription.read');if(!r.tenant.membership.isOwner)throw new Error('Apenas o proprietário pode alterar o plano.');if(!planChanges)throw new Error('Serviço indisponível.');const applied=await planChanges.confirmPaid(r.params.publicId,'manual',null,r.auth.user.id);return {status:applied.status,publicId:applied.publicId};});
  app.post('/tenant/subscription/cancel-scheduled-change', { schema: { response: { 200: TenantSubscriptionResponseSchema } } }, (r) => {
    options.authService.requirePermission(r.tenant, 'tenant.subscription.read');
    if (!r.tenant.membership.isOwner) throw new Error('Apenas o proprietário pode alterar o plano.');
    return options.service.cancelScheduledChange(r.tenant.id);
  });
  const planChanges = options.client === undefined ? null : new SubscriptionPlanChangeService(options.client);
  if(options.billingService){const billing=options.billingService;
    app.get('/tenant/subscription/billing',{schema:{response:{200:PlatformSubscriptionBillingSchema}}},r=>{options.authService.requirePermission(r.tenant,'tenant.subscription.read');return billing.tenantOverview(r.tenant.id);});
    app.post('/tenant/subscription/charges',{schema:{body:CreatePlatformChargeSchema,response:{200:PlatformChargeResponseSchema}}},r=>{options.authService.requirePermission(r.tenant,'tenant.subscription.read');if(!r.tenant.membership.isOwner)throw new Error('Apenas o proprietário pode pagar a assinatura.');return billing.createTenantCharge(r.tenant.id,r.body.provider);});
    app.post('/tenant/subscription/changes/:publicId/charges',{schema:{params:z.object({publicId:z.uuid()}),body:z.object({provider:z.string().min(2).max(64)}).strict(),response:{200:z.object({changePublicId:z.uuid(),provider:z.string(),externalId:z.string(),status:z.string(),amountCents:z.string(),currency:z.string(),pixCopyPaste:z.string().nullable()})}},r=>{options.authService.requirePermission(r.tenant,'tenant.subscription.read');if(!r.tenant.membership.isOwner)throw new Error('Apenas o proprietário pode pagar a assinatura.');return billing.createChangeCharge(r.tenant.id,r.params.publicId,r.body.provider);});
  }
};
