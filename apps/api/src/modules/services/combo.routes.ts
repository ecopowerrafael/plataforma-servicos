import {
  ComboEligibleProfessionalsResponseSchema,
  ComboListResponseSchema,
  ComboPublicSchema,
  ComboStatusResponseSchema,
  CreateComboRequestSchema,
  UpdateComboRequestSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type ComboService } from './combo.service.js';
import { validateServiceImageUpload } from './service-image.storage.js';
import { AppError } from '../../errors/AppError.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';
import { type PrismaClient } from '../../database-client/client.js';

interface Options {
  service: ComboService;
  authService: AuthService;
  cookieName: string;
  client?: PrismaClient;
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

export const comboRoutes: FastifyPluginAsyncZod<Options> = async (app, options) => {
  await app.register(tenantContextPlugin, {
    authService: options.authService,
    cookieName: options.cookieName,
    client: options.client,
  });

  app.get(
    '/tenant/combos',
    { schema: { querystring: QuerySchema, response: { 200: ComboListResponseSchema } } },
    (request) => {
      options.authService.requirePermission(request.tenant, 'combo.read');
      return options.service.list(request.tenant.id, {
        page: request.query.page,
        limit: request.query.limit,
        search: request.query.search,
        active: request.query.active === undefined ? undefined : request.query.active === 'true',
      });
    },
  );
  app.get(
    '/tenant/combos/:publicId',
    { schema: { params: PublicIdParamsSchema, response: { 200: ComboPublicSchema } } },
    (request) => {
      options.authService.requirePermission(request.tenant, 'combo.read');
      return options.service.get(request.tenant.id, request.params.publicId);
    },
  );
  app.get(
    '/tenant/combos/:publicId/professionals',
    {
      schema: {
        params: PublicIdParamsSchema,
        response: { 200: ComboEligibleProfessionalsResponseSchema },
      },
    },
    (request) => {
      options.authService.requirePermission(request.tenant, 'combo.read');
      return options.service.eligibleProfessionals(request.tenant.id, request.params.publicId);
    },
  );
  app.post(
    '/tenant/combos',
    { schema: { body: CreateComboRequestSchema, response: { 201: ComboPublicSchema } } },
    async (request, reply) => {
      options.authService.requirePermission(request.tenant, 'combo.create');
      return reply
        .status(201)
        .send(await options.service.create(request.tenant.id, request.body, auditActor(request)));
    },
  );
  app.patch(
    '/tenant/combos/:publicId',
    {
      schema: {
        params: PublicIdParamsSchema,
        body: UpdateComboRequestSchema,
        response: { 200: ComboPublicSchema },
      },
    },
    (request) => {
      options.authService.requirePermission(request.tenant, 'combo.update');
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
      `/tenant/combos/:publicId/${path}`,
      { schema: { params: PublicIdParamsSchema, response: { 200: ComboStatusResponseSchema } } },
      async (request) => {
        options.authService.requirePermission(request.tenant, 'combo.status.manage');
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
    '/tenant/combos/:publicId/image',
    { schema: { params: PublicIdParamsSchema, response: { 200: ComboPublicSchema } } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'combo.image.manage');
      const upload = await request.file();
      if (upload === undefined) {
        throw new AppError({
          code: 'COMBO_IMAGE_REQUIRED',
          message: 'Uma imagem é obrigatória.',
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
    '/tenant/combos/:publicId/image',
    { schema: { params: PublicIdParamsSchema, response: { 200: ComboPublicSchema } } },
    (request) => {
      options.authService.requirePermission(request.tenant, 'combo.image.manage');
      return options.service.removeImage(
        request.tenant.id,
        request.params.publicId,
        auditActor(request),
      );
    },
  );
  app.get(
    '/tenant/combos/:publicId/image',
    { schema: { params: PublicIdParamsSchema } },
    async (request, reply) => {
      options.authService.requirePermission(request.tenant, 'combo.read');
      const image = await options.service.getImage(request.tenant.id, request.params.publicId);
      return reply
        .header('Cache-Control', 'private, max-age=300')
        .type(image.mimeType)
        .send(image.buffer);
    },
  );
};
