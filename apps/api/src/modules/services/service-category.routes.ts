import {
  CreateServiceCategoryRequestSchema,
  ServiceCategoryListResponseSchema,
  ServiceCategoryPublicSchema,
  ServiceCategoryStatusResponseSchema,
  UpdateServiceCategoryRequestSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type ServiceCategoryService } from './service-category.service.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';
import { type PrismaClient } from '../../database-client/client.js';

interface Options {
  service: ServiceCategoryService;
  authService: AuthService;
  cookieName: string;
  client?: PrismaClient;
}
const ParamsSchema = z.object({ publicId: z.uuid() }).strict();
const QuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().min(1).max(120).optional(),
    active: z.enum(['true', 'false']).optional(),
  })
  .strict();
const actor = (request: { auth: { user: { id: bigint }; session: { id: bigint } } }) => ({
  userId: request.auth.user.id,
  sessionId: request.auth.session.id,
});

export const serviceCategoryRoutes: FastifyPluginAsyncZod<Options> = async (app, options) => {
  await app.register(tenantContextPlugin, {
    authService: options.authService,
    cookieName: options.cookieName,
    client: options.client,
  });
  app.get(
    '/tenant/service-categories',
    { schema: { querystring: QuerySchema, response: { 200: ServiceCategoryListResponseSchema } } },
    (request) => {
      options.authService.requirePermission(request.tenant, 'service.category.read');
      return options.service.list(request.tenant.id, {
        page: request.query.page,
        limit: request.query.limit,
        search: request.query.search,
        active: request.query.active === undefined ? undefined : request.query.active === 'true',
      });
    },
  );
  app.get(
    '/tenant/service-categories/:publicId',
    { schema: { params: ParamsSchema, response: { 200: ServiceCategoryPublicSchema } } },
    (request) => {
      options.authService.requirePermission(request.tenant, 'service.category.read');
      return options.service.get(request.tenant.id, request.params.publicId);
    },
  );
  app.post(
    '/tenant/service-categories',
    {
      schema: {
        body: CreateServiceCategoryRequestSchema,
        response: { 201: ServiceCategoryPublicSchema },
      },
    },
    async (request, reply) => {
      options.authService.requirePermission(request.tenant, 'service.category.create');
      return reply
        .status(201)
        .send(await options.service.create(request.tenant.id, request.body, actor(request)));
    },
  );
  app.patch(
    '/tenant/service-categories/:publicId',
    {
      schema: {
        params: ParamsSchema,
        body: UpdateServiceCategoryRequestSchema,
        response: { 200: ServiceCategoryPublicSchema },
      },
    },
    (request) => {
      options.authService.requirePermission(request.tenant, 'service.category.update');
      return options.service.update(
        request.tenant.id,
        request.params.publicId,
        request.body,
        actor(request),
      );
    },
  );
  for (const [action, active] of [
    ['activate', true],
    ['deactivate', false],
  ] as const)
    app.post(
      `/tenant/service-categories/:publicId/${action}`,
      { schema: { params: ParamsSchema, response: { 200: ServiceCategoryStatusResponseSchema } } },
      async (request) => {
        options.authService.requirePermission(request.tenant, 'service.category.status.manage');
        await options.service.setActive(
          request.tenant.id,
          request.params.publicId,
          active,
          actor(request),
        );
        return { success: true } as const;
      },
    );
};
