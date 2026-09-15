import {
  ComboEligibleProfessionalsResponseSchema,
  ComboListResponseSchema,
  ComboPublicSchema,
  CreateComboRequestSchema,
  UpdateComboRequestSchema,
  SuccessResponseSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type ComboService } from '../services/combo.service.js';
import { validateServiceImageUpload } from '../services/service-image.storage.js';
import { AppError } from '../../errors/AppError.js';
import { type PlatformService } from './platform.service.js';
import { requestMetadata } from '../auth/request-context.js';

interface Options {
  service: PlatformService;
  comboService: ComboService;
}

const TenantParamsSchema = z.object({ tenantPublicId: z.uuid() });
const ComboParamsSchema = TenantParamsSchema.extend({ comboPublicId: z.uuid() });
const QuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().min(1).max(120).optional(),
    active: z.enum(['true', 'false']).optional(),
  })
  .strict();

export const platformComboRoutes: FastifyPluginAsyncZod<Options> = async (app, options) => {
  const allow = (request: any, permission: any) => {
    options.service.requirePermission(request.platformAuth, permission);
  };

  app.get(
    '/platform/tenants/:tenantPublicId/combos',
    { schema: { querystring: QuerySchema, response: { 200: ComboListResponseSchema } } },
    async (request: any) => {
      allow(request, 'platform.tenant.read');
      const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
      return options.comboService.list(tenantId, {
        page: request.query.page,
        limit: request.query.limit,
        search: request.query.search,
        active: request.query.active === undefined ? undefined : request.query.active === 'true',
      });
    },
  );

  app.get(
    '/platform/tenants/:tenantPublicId/combos/:comboPublicId',
    { schema: { params: ComboParamsSchema, response: { 200: ComboPublicSchema } } },
    async (request: any) => {
      allow(request, 'platform.tenant.read');
      const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
      return options.comboService.get(tenantId, request.params.comboPublicId);
    },
  );

  app.get(
    '/platform/tenants/:tenantPublicId/combos/:comboPublicId/professionals',
    {
      schema: {
        params: ComboParamsSchema,
        response: { 200: ComboEligibleProfessionalsResponseSchema },
      },
    },
    async (request: any) => {
      allow(request, 'platform.tenant.read');
      const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
      return options.comboService.eligibleProfessionals(tenantId, request.params.comboPublicId);
    },
  );

  app.post(
    '/platform/tenants/:tenantPublicId/combos',
    { schema: { params: TenantParamsSchema, body: CreateComboRequestSchema, response: { 201: ComboPublicSchema } } },
    async (request: any, reply) => {
      allow(request, 'platform.tenant.update');
      const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
      const combo = await options.comboService.create(tenantId, request.body);
      await options.service.recordTenantAudit(
        'platform.tenant.combo_created',
        'combo',
        combo.publicId,
        tenantId,
        request.platformAuth,
        requestMetadata(request),
      );
      return reply.status(201).send(combo);
    },
  );

  app.patch(
    '/platform/tenants/:tenantPublicId/combos/:comboPublicId',
    { schema: { params: ComboParamsSchema, body: UpdateComboRequestSchema, response: { 200: ComboPublicSchema } } },
    async (request: any) => {
      allow(request, 'platform.tenant.update');
      const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
      const combo = await options.comboService.update(tenantId, request.params.comboPublicId, request.body);
      await options.service.recordTenantAudit(
        'platform.tenant.combo_updated',
        'combo',
        request.params.comboPublicId,
        tenantId,
        request.platformAuth,
        requestMetadata(request),
      );
      return combo;
    },
  );

  app.post(
    '/platform/tenants/:tenantPublicId/combos/:comboPublicId/activate',
    { schema: { params: ComboParamsSchema, response: { 200: SuccessResponseSchema } } },
    async (request: any) => {
      allow(request, 'platform.tenant.update');
      const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
      await options.comboService.setActive(tenantId, request.params.comboPublicId, true);
      await options.service.recordTenantAudit(
        'platform.tenant.combo_activated',
        'combo',
        request.params.comboPublicId,
        tenantId,
        request.platformAuth,
        requestMetadata(request),
      );
      return { success: true } as const;
    },
  );

  app.post(
    '/platform/tenants/:tenantPublicId/combos/:comboPublicId/deactivate',
    { schema: { params: ComboParamsSchema, response: { 200: SuccessResponseSchema } } },
    async (request: any) => {
      allow(request, 'platform.tenant.update');
      const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
      await options.comboService.setActive(tenantId, request.params.comboPublicId, false);
      await options.service.recordTenantAudit(
        'platform.tenant.combo_deactivated',
        'combo',
        request.params.comboPublicId,
        tenantId,
        request.platformAuth,
        requestMetadata(request),
      );
      return { success: true } as const;
    },
  );

  app.put(
    '/platform/tenants/:tenantPublicId/combos/:comboPublicId/image',
    { schema: { params: ComboParamsSchema, response: { 200: ComboPublicSchema } } },
    async (request: any) => {
      allow(request, 'platform.tenant.update');
      const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
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
      const combo = await options.comboService.replaceImage(
        tenantId,
        request.params.comboPublicId,
        image,
      );
      await options.service.recordTenantAudit(
        'platform.tenant.combo_image_replaced',
        'combo',
        request.params.comboPublicId,
        tenantId,
        request.platformAuth,
        requestMetadata(request),
      );
      return combo;
    },
  );

  app.delete(
    '/platform/tenants/:tenantPublicId/combos/:comboPublicId/image',
    { schema: { params: ComboParamsSchema, response: { 200: ComboPublicSchema } } },
    async (request: any) => {
      allow(request, 'platform.tenant.update');
      const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
      const combo = await options.comboService.removeImage(tenantId, request.params.comboPublicId);
      await options.service.recordTenantAudit(
        'platform.tenant.combo_image_removed',
        'combo',
        request.params.comboPublicId,
        tenantId,
        request.platformAuth,
        requestMetadata(request),
      );
      return combo;
    },
  );

  app.get(
    '/platform/tenants/:tenantPublicId/combos/:comboPublicId/image',
    { schema: { params: ComboParamsSchema } },
    async (request: any, reply) => {
      allow(request, 'platform.tenant.read');
      const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
      const image = await options.comboService.getImage(tenantId, request.params.comboPublicId);
      return reply
        .header('Cache-Control', 'private, max-age=300')
        .type(image.mimeType)
        .send(image.buffer);
    },
  );
};
