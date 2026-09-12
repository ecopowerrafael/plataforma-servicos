import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';
import { type AuthService } from '../auth/auth.service.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type StripeBillingService } from './stripe-billing.service.js';

export const stripeBillingRoutes: FastifyPluginAsyncZod<{ service: StripeBillingService; authService: AuthService; cookieName: string; client: PrismaClient }> = async (app, options) => {
  await app.register(tenantContextPlugin, { authService: options.authService, cookieName: options.cookieName, client: options.client });
  app.post('/tenant/billing/stripe/checkout', { schema: { body: z.object({ changePublicId: z.uuid() }).strict(), response: { 200: z.object({ url: z.string().url().nullable() }) } } }, async (request) => {
    options.authService.requirePermission(request.tenant, 'tenant.subscription.read');
    if (!request.tenant.membership.isOwner) throw new Error('Apenas o proprietário pode assinar o plano.');
    return options.service.checkoutChange(request.tenant.id, request.body.changePublicId, request.auth.user.email);
  });
  app.post('/tenant/billing/stripe/portal', { schema: { response: { 200: z.object({ url: z.string().url() }) } } }, async (request) => {
    options.authService.requirePermission(request.tenant, 'tenant.subscription.read');
    return options.service.portal(request.tenant.id);
  });
  app.post('/tenant/billing/stripe/cancel', { schema: { response: { 200: z.object({ cancelAtPeriodEnd: z.boolean(), currentPeriodEndsAt: z.date() }) } } }, async (request) => {
    options.authService.requirePermission(request.tenant, 'tenant.subscription.read');
    if (!request.tenant.membership.isOwner) throw new Error('Apenas o proprietário pode cancelar a assinatura.');
    return options.service.cancelAtPeriodEnd(request.tenant.id);
  });
};
