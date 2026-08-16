import {
  CreateProfessionalRequestSchema,
  ProfessionalListResponseSchema,
  ProfessionalPublicSchema,
  ProfessionalStatusResponseSchema,
  UpdateProfessionalRequestSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type ProfessionalService } from './professional.service.js';
import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { type AuthService } from '../auth/auth.service.js';
import { type AuthorizedTenantContext } from '../auth/identity.repository.js';
import { validateServiceImageUpload } from '../services/service-image.storage.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';
interface Options {
  service: ProfessionalService;
  authService: AuthService;
  cookieName: string;
  client?: PrismaClient;
}
const params = z.object({ publicId: z.uuid() }).strict();
const ImageVariantQuerySchema = z.object({ variant: z.enum(['original', 'thumbnail']).default('original') }).strict();
const query = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().min(1).max(120).optional(),
    active: z.enum(['true', 'false']).optional(),
  })
  .strict();
const actor = (r: { auth: { user: { id: bigint }; session: { id: bigint } } }) => ({
  userId: r.auth.user.id,
  sessionId: r.auth.session.id,
});
export const professionalRoutes: FastifyPluginAsyncZod<Options> = async (app, options) => {
  await app.register(tenantContextPlugin, {
    authService: options.authService,
    cookieName: options.cookieName,
    client: options.client,
  });
  const ownProfessional = async (r: { tenant: AuthorizedTenantContext; auth: { user: { id: bigint } }; params: { publicId: string } }) => {
    if (r.tenant.membership.permissions.includes('professional.image.manage')) {
      options.authService.requirePermission(r.tenant, 'professional.image.manage');
      return;
    }
    options.authService.requirePermission(r.tenant, 'professional.self.update');
    if ((await options.service.me(r.tenant.id, r.auth.user.id)).publicId !== r.params.publicId)
      throw new AppError({ code: 'PROFESSIONAL_NOT_FOUND', message: 'Profissional não encontrado.', statusCode: 404 });
  };
  app.get(
    '/tenant/professionals',
    { schema: { querystring: query, response: { 200: ProfessionalListResponseSchema } } },
    (r) => {
      options.authService.requirePermission(r.tenant, 'professional.read');
      return options.service.list(r.tenant.id, {
        page: r.query.page,
        limit: r.query.limit,
        search: r.query.search,
        active: r.query.active === undefined ? undefined : r.query.active === 'true',
      });
    },
  );
  app.get(
    '/tenant/professionals/:publicId',
    { schema: { params, response: { 200: ProfessionalPublicSchema } } },
    (r) => {
      options.authService.requirePermission(r.tenant, 'professional.read');
      return options.service.get(r.tenant.id, r.params.publicId);
    },
  );
  app.post(
    '/tenant/professionals',
    {
      schema: {
        body: CreateProfessionalRequestSchema,
        response: { 201: ProfessionalPublicSchema },
      },
    },
    async (r, reply) => {
      options.authService.requirePermission(r.tenant, 'professional.create');
      return reply.status(201).send(await options.service.create(r.tenant.id, r.body, actor(r)));
    },
  );
  app.patch(
    '/tenant/professionals/:publicId',
    {
      schema: {
        params,
        body: UpdateProfessionalRequestSchema,
        response: { 200: ProfessionalPublicSchema },
      },
    },
    (r) => {
      options.authService.requirePermission(r.tenant, 'professional.update');
      return options.service.update(r.tenant.id, r.params.publicId, r.body, actor(r));
    },
  );
  for (const [path, active] of [
    ['activate', true],
    ['deactivate', false],
  ] as const)
    app.post(
      `/tenant/professionals/:publicId/${path}`,
      { schema: { params, response: { 200: ProfessionalStatusResponseSchema } } },
      async (r) => {
        options.authService.requirePermission(r.tenant, 'professional.status.manage');
        await options.service.setActive(r.tenant.id, r.params.publicId, active, actor(r));
        return { success: true } as const;
      },
    );
  app.put(
    '/tenant/professionals/:publicId/photo',
    { schema: { params, response: { 200: ProfessionalPublicSchema } } },
    async (r) => {
      await ownProfessional(r);
      const upload = await r.file();
      if (upload === undefined)
        throw new AppError({
          code: 'PROFESSIONAL_PHOTO_REQUIRED',
          message: 'Uma foto \u00e9 obrigat\u00f3ria.',
          statusCode: 400,
        });
      const image = await upload.toBuffer();
      validateServiceImageUpload(image, upload.filename, upload.mimetype);
      return options.service.replacePhoto(r.tenant.id, r.params.publicId, image, actor(r));
    },
  );
  app.delete(
    '/tenant/professionals/:publicId/photo',
    { schema: { params, response: { 200: ProfessionalPublicSchema } } },
    (r) => {
      return ownProfessional(r).then(() => options.service.removePhoto(r.tenant.id, r.params.publicId, actor(r)));
    },
  );
  app.get('/tenant/professionals/:publicId/photo', { schema: { params, querystring: ImageVariantQuerySchema } }, async (r, reply) => {
    if (r.tenant.membership.permissions.includes('professional.read')) options.authService.requirePermission(r.tenant, 'professional.read');
    else await ownProfessional(r);
    const photo = await options.service.photo(r.tenant.id, r.params.publicId, r.query.variant);
    return reply
      .header('Cache-Control', 'private, max-age=300')
      .type(photo.mimeType)
      .send(photo.buffer);
  });
};
