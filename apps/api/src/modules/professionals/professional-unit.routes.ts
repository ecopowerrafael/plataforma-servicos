import {
  ProfessionalUnitStatusResponseSchema,
  ProfessionalUnitsResponseSchema,
  UpsertProfessionalUnitRequestSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type ProfessionalUnitLinkService } from './professional-unit.service.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';
const base = z.object({ publicId: z.uuid() });
const pair = base.extend({ unitPublicId: z.uuid() });
interface Options {
  service: ProfessionalUnitLinkService;
  authService: AuthService;
  cookieName: string;
  client?: PrismaClient;
}
export const professionalUnitRoutes: FastifyPluginAsyncZod<Options> = async (app, o) => {
  await app.register(tenantContextPlugin, { authService: o.authService, cookieName: o.cookieName, client: o.client });
  const actor = (r: { auth: { user: { id: bigint }; session: { id: bigint } } }) => ({
    userId: r.auth.user.id,
    sessionId: r.auth.session.id,
  });
  app.get(
    '/tenant/professionals/:publicId/units',
    { schema: { params: base, response: { 200: ProfessionalUnitsResponseSchema } } },
    (r) => {
      o.authService.requirePermission(r.tenant, 'professional.unit.read');
      return o.service.listProfessional(r.tenant.id, r.params.publicId);
    },
  );
  app.get(
    '/tenant/units/:publicId/professionals',
    { schema: { params: base, response: { 200: ProfessionalUnitsResponseSchema } } },
    (r) => {
      o.authService.requirePermission(r.tenant, 'professional.unit.read');
      return o.service.listUnit(r.tenant.id, r.params.publicId);
    },
  );
  app.put(
    '/tenant/professionals/:publicId/units',
    { schema: { params: base, body: UpsertProfessionalUnitRequestSchema } },
    (r) => {
      o.authService.requirePermission(r.tenant, 'professional.unit.manage');
      return o.service.upsert(r.tenant.id, r.params.publicId, r.body, actor(r));
    },
  );
  for (const [path, active] of [
    ['activate', true],
    ['deactivate', false],
  ] as const)
    app.post(
      `/tenant/professionals/:publicId/units/:unitPublicId/${path}`,
      { schema: { params: pair, response: { 200: ProfessionalUnitStatusResponseSchema } } },
      async (r) => {
        o.authService.requirePermission(r.tenant, 'professional.unit.manage');
        await o.service.status(
          r.tenant.id,
          r.params.publicId,
          r.params.unitPublicId,
          active,
          actor(r),
        );
        return { success: true } as const;
      },
    );
};
