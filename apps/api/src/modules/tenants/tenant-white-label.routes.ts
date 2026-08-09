import {
  PublicTenantManifestSchema,
  PublicTenantSiteResponseSchema,
  SuccessResponseSchema,
  TenantMediaAssetSchema,
  TenantMediaListResponseSchema,
  TenantWhiteLabelResponseSchema,
  UpdateTenantBrandingRequestSchema,
  UpdateTenantMediaMetadataRequestSchema,
  UpdateTenantPublicSiteRequestSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { tenantContextPlugin } from './tenant-context.plugin.js';
import { type TenantWhiteLabelService } from './tenant-white-label.service.js';
import { AppError } from '../../errors/AppError.js';
import { type AuthService } from '../auth/auth.service.js';
import { validateServiceImageUpload } from '../services/service-image.storage.js';
import { type PrismaClient } from '../../database-client/client.js';

interface Options {
  service: TenantWhiteLabelService;
  authService: AuthService;
  cookieName: string;
  client?: PrismaClient;
}
const AssetKindSchema = z
  .object({
    kind: z.enum([
      'LOGO',
      'LOGO_COMPACT',
      'FAVICON',
      'APP_ICON',
      'SPLASH',
      'BANNER_DESKTOP',
      'BANNER_MOBILE',
      'INSTITUTIONAL',
    ]),
  })
  .strict();
const AssetParamsSchema = z.object({ assetPublicId: z.uuid() }).strict();
const PublicSlugSchema = z.object({ slug: z.string().trim().min(2).max(63) }).strict();
const PublicEntityParamsSchema = z.object({ publicId: z.uuid() }).strict();
const actor = (request: { auth: { user: { id: bigint }; session: { id: bigint } } }) => ({
  userId: request.auth.user.id,
  sessionId: request.auth.session.id,
});

export const tenantWhiteLabelRoutes: FastifyPluginAsyncZod<Options> = async (app, options) => {
  await app.register(tenantContextPlugin, {
    authService: options.authService,
    cookieName: options.cookieName,
    client: options.client,
  });
  app.get(
    '/tenant/white-label',
    { schema: { response: { 200: TenantWhiteLabelResponseSchema } } },
    (request) => {
      options.authService.requirePermission(request.tenant, 'tenant.branding.read');
      return options.service.get(request.tenant.id);
    },
  );
  app.patch(
    '/tenant/branding',
    {
      schema: {
        body: UpdateTenantBrandingRequestSchema,
        response: { 200: TenantWhiteLabelResponseSchema },
      },
    },
    (request) => {
      options.authService.requirePermission(request.tenant, 'tenant.branding.manage');
      return options.service.updateBranding(request.tenant.id, request.body, actor(request));
    },
  );
  app.get(
    '/tenant/media',
    { schema: { response: { 200: TenantMediaListResponseSchema } } },
    (request) => {
      options.authService.requirePermission(request.tenant, 'tenant.branding.read');
      return options.service.listAssets(request.tenant.id);
    },
  );
  app.post(
    '/tenant/media/:kind',
    { schema: { params: AssetKindSchema, response: { 201: TenantMediaAssetSchema } } },
    async (request, reply) => {
      options.authService.requirePermission(request.tenant, 'tenant.branding.manage');
      const upload = await request.file();
      if (upload === undefined)
        throw new AppError({
          code: 'TENANT_MEDIA_REQUIRED',
          message: 'Uma imagem \u00e9 obrigat\u00f3ria.',
          statusCode: 400,
        });
      const image = await upload.toBuffer();
      validateServiceImageUpload(image, upload.filename, upload.mimetype);
      return reply
        .status(201)
        .send(
          await options.service.upload(
            request.tenant.id,
            request.params.kind,
            upload.filename,
            image,
            actor(request),
          ),
        );
    },
  );
  app.patch(
    '/tenant/media/:assetPublicId',
    {
      schema: {
        params: AssetParamsSchema,
        body: UpdateTenantMediaMetadataRequestSchema,
        response: { 200: TenantMediaAssetSchema },
      },
    },
    (request) => {
      options.authService.requirePermission(request.tenant, 'tenant.branding.manage');
      return options.service.updateAsset(
        request.tenant.id,
        request.params.assetPublicId,
        request.body.altText,
        actor(request),
      );
    },
  );
  app.delete(
    '/tenant/media/:assetPublicId',
    { schema: { params: AssetParamsSchema, response: { 200: SuccessResponseSchema } } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'tenant.branding.manage');
      await options.service.deleteAsset(
        request.tenant.id,
        request.params.assetPublicId,
        actor(request),
      );
      return { success: true } as const;
    },
  );
  app.patch(
    '/tenant/public-site',
    { schema: { body: UpdateTenantPublicSiteRequestSchema } },
    (request) => {
      options.authService.requirePermission(request.tenant, 'tenant.branding.manage');
      return options.service.updateSite(request.tenant.id, request.body, actor(request));
    },
  );
};

export const publicTenantWhiteLabelRoutes: FastifyPluginAsyncZod<{
  service: TenantWhiteLabelService;
}> = (app, options) => {
  app.get(
    '/public/sites/:slug',
    {
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      schema: { params: PublicSlugSchema, response: { 200: PublicTenantSiteResponseSchema } },
    },
    (request) => options.service.publicSite(request.params.slug),
  );
  app.get(
    '/public/sites/:slug/manifest.webmanifest',
    {
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      schema: { params: PublicSlugSchema, response: { 200: PublicTenantManifestSchema } },
    },
    async (request, reply) =>
      reply
        .type('application/manifest+json')
        .send(await options.service.manifest(request.params.slug)),
  );
  app.get(
    '/public/media/:assetPublicId',
    {
      config: { rateLimit: { max: 240, timeWindow: '1 minute' } },
      schema: { params: AssetParamsSchema },
    },
    async (request, reply) => {
      const image = await options.service.getMedia(request.params.assetPublicId);
      return reply
        .header('Cache-Control', 'public, max-age=300')
        .type(image.mimeType)
        .send(image.buffer);
    },
  );
  app.get(
    '/public/services/:publicId/image',
    {
      config: { rateLimit: { max: 240, timeWindow: '1 minute' } },
      schema: { params: PublicEntityParamsSchema },
    },
    async (request, reply) => {
      const image = await options.service.publicServiceImage(request.params.publicId);
      return reply
        .header('Cache-Control', 'public, max-age=300')
        .type(image.mimeType)
        .send(image.buffer);
    },
  );
  app.get(
    '/public/professionals/:publicId/image',
    {
      config: { rateLimit: { max: 240, timeWindow: '1 minute' } },
      schema: { params: PublicEntityParamsSchema },
    },
    async (request, reply) => {
      const image = await options.service.publicProfessionalImage(request.params.publicId);
      return reply
        .header('Cache-Control', 'public, max-age=300')
        .type(image.mimeType)
        .send(image.buffer);
    },
  );
  return Promise.resolve();
};
