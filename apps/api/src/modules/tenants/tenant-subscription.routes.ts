import { TenantSubscriptionResponseSchema } from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { tenantContextPlugin } from './tenant-context.plugin.js';
import { type TenantSubscriptionService } from './tenant-subscription.service.js';
import { type AuthService } from '../auth/auth.service.js';

interface Options {
  service: TenantSubscriptionService;
  authService: AuthService;
  cookieName: string;
}

export const tenantSubscriptionRoutes: FastifyPluginAsyncZod<Options> = async (app, options) => {
  await app.register(tenantContextPlugin, {
    authService: options.authService,
    cookieName: options.cookieName,
  });

  app.get(
    '/tenant/subscription',
    { schema: { response: { 200: TenantSubscriptionResponseSchema } } },
    (r) => {
      options.authService.requirePermission(r.tenant, 'tenant.subscription.read');
      return options.service.get(r.tenant.id);
    },
  );
};
