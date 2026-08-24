import {
  ProfessionalServiceStatusResponseSchema,
  ProfessionalServicesResponseSchema,
  UpsertProfessionalServiceRequestSchema,
  BulkUpsertProfessionalServiceRequestSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type ProfessionalServiceLinkService } from './professional-service.service.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';
const base = z.object({ publicId: z.uuid() });
const pair = base.extend({ servicePublicId: z.uuid() });
interface Options {
  service: ProfessionalServiceLinkService;
  authService: AuthService;
  cookieName: string;
  client?: PrismaClient;
}
export const professionalServiceRoutes: FastifyPluginAsyncZod<Options> = async (app, o) => {
  await app.register(tenantContextPlugin, { authService: o.authService, cookieName: o.cookieName, client: o.client });
  const actor = (r: { auth: { user: { id: bigint }; session: { id: bigint } } }) => ({
    userId: r.auth.user.id,
    sessionId: r.auth.session.id,
  });
  app.get(
    '/tenant/professionals/:publicId/services',
    { schema: { params: base, response: { 200: ProfessionalServicesResponseSchema } } },
    (r) => {
      o.authService.requirePermission(r.tenant, 'professional.service.read');
      return o.service.listProfessional(r.tenant.id, r.params.publicId);
    },
  );
  app.get(
    '/tenant/services/:publicId/professionals',
    { schema: { params: base, response: { 200: ProfessionalServicesResponseSchema } } },
    (r) => {
      o.authService.requirePermission(r.tenant, 'professional.service.read');
      return o.service.listService(r.tenant.id, r.params.publicId);
    },
  );
  app.put(
    '/tenant/professionals/:publicId/services',
    { schema: { params: base, body: UpsertProfessionalServiceRequestSchema } },
    (r) => {
      o.authService.requirePermission(r.tenant, 'professional.service.manage');
      return o.service.upsert(r.tenant.id, r.params.publicId, r.body, actor(r));
    },
  );
  app.put(
    '/tenant/professionals/:publicId/services/bulk',
    { schema: { params: base, body: BulkUpsertProfessionalServiceRequestSchema, response: { 200: ProfessionalServicesResponseSchema } } },
    (r) => {
      o.authService.requirePermission(r.tenant, 'professional.service.manage');
      return o.service.bulkUpsert(r.tenant.id, r.params.publicId, r.body, actor(r));
    },
  );
  app.put(
    '/tenant/services/:publicId/professionals/bulk',
    { schema: { params: base, body: BulkUpsertProfessionalServiceRequestSchema, response: { 200: ProfessionalServicesResponseSchema } } },
    (r) => {
      o.authService.requirePermission(r.tenant, 'professional.service.manage');
      return o.service.bulkUpsertByService(r.tenant.id, r.params.publicId, r.body, actor(r));
    },
  );
  for (const [path, active] of [
    ['activate', true],
    ['deactivate', false],
  ] as const)
    app.post(
      `/tenant/professionals/:publicId/services/:servicePublicId/${path}`,
      { schema: { params: pair, response: { 200: ProfessionalServiceStatusResponseSchema } } },
      async (r) => {
        o.authService.requirePermission(r.tenant, 'professional.service.manage');
        await o.service.status(
          r.tenant.id,
          r.params.publicId,
          r.params.servicePublicId,
          active,
          actor(r),
        );
        return { success: true } as const;
      },
    );
};
