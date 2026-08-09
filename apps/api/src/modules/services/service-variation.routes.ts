import {
  CreateServiceVariationRequestSchema,
  ServiceVariationPublicSchema,
  ServiceVariationsResponseSchema,
  ServiceVariationStatusResponseSchema,
  UpdateServiceVariationRequestSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type ServiceVariationService } from './service-variation.service.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';
const serviceParams = z.object({ publicId: z.uuid() }).strict();
const variationParams = serviceParams.extend({ variationPublicId: z.uuid() }).strict();
interface Options {
  service: ServiceVariationService;
  authService: AuthService;
  cookieName: string;
  client?: PrismaClient;
}
const actor = (r: { auth: { user: { id: bigint }; session: { id: bigint } } }) => ({
  userId: r.auth.user.id,
  sessionId: r.auth.session.id,
});
export const serviceVariationRoutes: FastifyPluginAsyncZod<Options> = async (app, options) => {
  await app.register(tenantContextPlugin, {
    authService: options.authService,
    cookieName: options.cookieName,
    client: options.client,
  });
  app.get(
    '/tenant/services/:publicId/variations',
    { schema: { params: serviceParams, response: { 200: ServiceVariationsResponseSchema } } },
    (r) => {
      options.authService.requirePermission(r.tenant, 'service.variation.read');
      return options.service.list(r.tenant.id, r.params.publicId);
    },
  );
  app.post(
    '/tenant/services/:publicId/variations',
    {
      schema: {
        params: serviceParams,
        body: CreateServiceVariationRequestSchema,
        response: { 201: ServiceVariationPublicSchema },
      },
    },
    async (r, reply) => {
      options.authService.requirePermission(r.tenant, 'service.variation.manage');
      return reply
        .status(201)
        .send(await options.service.create(r.tenant.id, r.params.publicId, r.body, actor(r)));
    },
  );
  app.patch(
    '/tenant/services/:publicId/variations/:variationPublicId',
    {
      schema: {
        params: variationParams,
        body: UpdateServiceVariationRequestSchema,
        response: { 200: ServiceVariationPublicSchema },
      },
    },
    (r) => {
      options.authService.requirePermission(r.tenant, 'service.variation.manage');
      return options.service.update(
        r.tenant.id,
        r.params.publicId,
        r.params.variationPublicId,
        r.body,
        actor(r),
      );
    },
  );
  for (const [path, active] of [
    ['activate', true],
    ['deactivate', false],
  ] as const)
    app.post(
      `/tenant/services/:publicId/variations/:variationPublicId/${path}`,
      {
        schema: {
          params: variationParams,
          response: { 200: ServiceVariationStatusResponseSchema },
        },
      },
      async (r) => {
        options.authService.requirePermission(r.tenant, 'service.variation.manage');
        await options.service.setActive(
          r.tenant.id,
          r.params.publicId,
          r.params.variationPublicId,
          active,
          actor(r),
        );
        return { success: true } as const;
      },
    );
  app.delete(
    '/tenant/services/:publicId/variations/:variationPublicId',
    {
      schema: { params: variationParams, response: { 200: ServiceVariationStatusResponseSchema } },
    },
    async (r) => {
      options.authService.requirePermission(r.tenant, 'service.variation.manage');
      await options.service.remove(
        r.tenant.id,
        r.params.publicId,
        r.params.variationPublicId,
        actor(r),
      );
      return { success: true } as const;
    },
  );
};
