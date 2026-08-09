import {
  CreateServiceRequestSchema,
  ServiceListResponseSchema,
  ServicePublicSchema,
  ServiceStatusResponseSchema,
  UpdateServiceRequestSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { validateServiceImageUpload } from './service-image.storage.js';
import { type ServiceService } from './service.service.js';
import { AppError } from '../../errors/AppError.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';

interface Options {
  service: ServiceService;
  authService: AuthService;
  cookieName: string;
}

function auditActor(request: { auth: { user: { id: bigint }; session: { id: bigint } } }) {
  return { userId: request.auth.user.id, sessionId: request.auth.session.id };
}

const PublicIdParamsSchema = z.object({ publicId: z.uuid() }).strict();
const QuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().min(1).max(120).optional(),
    active: z.enum(['true', 'false']).optional(),
  })
  .strict();

export const serviceRoutes: FastifyPluginAsyncZod<Options> = async (app, options) => {
  await app.register(tenantContextPlugin, {
    authService: options.authService,
    cookieName: options.cookieName,
  });

  app.get(
    '/tenant/services',
    { schema: { querystring: QuerySchema, response: { 200: ServiceListResponseSchema } } },
    (request) => {
      options.authService.requirePermission(request.tenant, 'service.read');
      return options.service.list(request.tenant.id, {
        page: request.query.page,
        limit: request.query.limit,
        search: request.query.search,
        active: request.query.active === undefined ? undefined : request.query.active === 'true',
      });
    },
  );
  app.get(
    '/tenant/services/:publicId',
    { schema: { params: PublicIdParamsSchema, response: { 200: ServicePublicSchema } } },
    (request) => {
      options.authService.requirePermission(request.tenant, 'service.read');
      return options.service.get(request.tenant.id, request.params.publicId);
    },
  );
  app.post(
    '/tenant/services',
    { schema: { body: CreateServiceRequestSchema, response: { 201: ServicePublicSchema } } },
    async (request, reply) => {
      options.authService.requirePermission(request.tenant, 'service.create');
      return reply
        .status(201)
        .send(await options.service.create(request.tenant.id, request.body, auditActor(request)));
    },
  );
  app.patch(
    '/tenant/services/:publicId',
    {
      schema: {
        params: PublicIdParamsSchema,
        body: UpdateServiceRequestSchema,
        response: { 200: ServicePublicSchema },
      },
    },
    (request) => {
      options.authService.requirePermission(request.tenant, 'service.update');
      return options.service.update(
        request.tenant.id,
        request.params.publicId,
        request.body,
        auditActor(request),
      );
    },
  );
  for (const [path, active] of [
    ['activate', true],
    ['deactivate', false],
  ] as const) {
    app.post(
      `/tenant/services/:publicId/${path}`,
      { schema: { params: PublicIdParamsSchema, response: { 200: ServiceStatusResponseSchema } } },
      async (request) => {
        options.authService.requirePermission(request.tenant, 'service.status.manage');
        await options.service.setActive(
          request.tenant.id,
          request.params.publicId,
          active,
          auditActor(request),
        );
        return { success: true } as const;
      },
    );
  }
  app.put(
    '/tenant/services/:publicId/image',
    { schema: { params: PublicIdParamsSchema, response: { 200: ServicePublicSchema } } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'service.image.manage');
      const upload = await request.file();
      if (upload === undefined) {
        throw new AppError({
          code: 'SERVICE_IMAGE_REQUIRED',
          message: 'Uma imagem \u00e9 obrigat\u00f3ria.',
          statusCode: 400,
        });
      }
      const image = await upload.toBuffer();
      validateServiceImageUpload(image, upload.filename, upload.mimetype);
      return options.service.replaceImage(
        request.tenant.id,
        request.params.publicId,
        image,
        auditActor(request),
      );
    },
  );
  app.delete(
    '/tenant/services/:publicId/image',
    { schema: { params: PublicIdParamsSchema, response: { 200: ServicePublicSchema } } },
    (request) => {
      options.authService.requirePermission(request.tenant, 'service.image.manage');
      return options.service.removeImage(
        request.tenant.id,
        request.params.publicId,
        auditActor(request),
      );
    },
  );
  app.get(
    '/tenant/services/:publicId/image',
    { schema: { params: PublicIdParamsSchema } },
    async (request, reply) => {
      options.authService.requirePermission(request.tenant, 'service.read');
      const image = await options.service.getImage(request.tenant.id, request.params.publicId);
      return reply
        .header('Cache-Control', 'private, max-age=300')
        .type(image.mimeType)
        .send(image.buffer);
    },
  );
};
