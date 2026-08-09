import {
  CreateTenantDomainRequestSchema,
  PublicTenantResolutionQuerySchema,
  PublicTenantResolutionResponseSchema,
  SuccessResponseSchema,
  TenantDomainListResponseSchema,
  TenantDomainSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { tenantContextPlugin } from './tenant-context.plugin.js';
import { type TenantDomainService } from './tenant-domain.service.js';
import { type AuthService } from '../auth/auth.service.js';

const params = z.object({ publicId: z.uuid() }).strict();
const actor = (request: { auth: { user: { id: bigint }; session: { id: bigint } } }) => ({
  userId: request.auth.user.id,
  sessionId: request.auth.session.id,
});
export const tenantDomainRoutes: FastifyPluginAsyncZod<{
  service: TenantDomainService;
  authService: AuthService;
  cookieName: string;
}> = async (app, options) => {
  await app.register(tenantContextPlugin, {
    authService: options.authService,
    cookieName: options.cookieName,
  });
  app.get(
    '/tenant/domains',
    { schema: { response: { 200: TenantDomainListResponseSchema } } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'tenant.branding.read');
      return options.service.list(request.tenant.id);
    },
  );
  app.post(
    '/tenant/domains',
    { schema: { body: CreateTenantDomainRequestSchema, response: { 201: TenantDomainSchema } } },
    async (request, reply) => {
      options.authService.requirePermission(request.tenant, 'tenant.branding.manage');
      return reply
        .status(201)
        .send(await options.service.create(request.tenant.id, request.body, actor(request)));
    },
  );
  app.post(
    '/tenant/domains/:publicId/verify',
    { schema: { params, response: { 200: TenantDomainSchema } } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'tenant.branding.manage');
      return options.service.verify(request.tenant.id, request.params.publicId, actor(request));
    },
  );
  app.delete(
    '/tenant/domains/:publicId',
    { schema: { params, response: { 200: SuccessResponseSchema } } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'tenant.branding.manage');
      await options.service.remove(request.tenant.id, request.params.publicId, actor(request));
      return { success: true } as const;
    },
  );
};
export const publicTenantDomainRoutes: FastifyPluginAsyncZod<{
  service: TenantDomainService;
}> = (app, options) => {
  app.get(
    '/public/tenant-resolution',
    {
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      schema: {
        querystring: PublicTenantResolutionQuerySchema,
        response: { 200: PublicTenantResolutionResponseSchema },
      },
    },
    (request) => options.service.resolve(request.query.hostname),
  );
  return Promise.resolve();
};
