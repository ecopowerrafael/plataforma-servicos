import { UpsertProfessionalUnitRequestSchema, ProfessionalUnitsResponseSchema } from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type PlatformService } from './platform.service.js';
import { type PlatformAuthContext } from './platform.service.js';
import { type ProfessionalUnitLinkService } from '../professionals/professional-unit.service.js';

interface Options {
  service: PlatformService;
  professionalUnitLinkService: ProfessionalUnitLinkService;
}

const TenantUnitParamsSchema = z.object({ tenantPublicId: z.uuid(), unitPublicId: z.uuid() });
const TenantUnitProfessionalParamsSchema = TenantUnitParamsSchema.extend({ professionalPublicId: z.uuid() });

export const platformProfessionalUnitsRoutes: FastifyPluginAsyncZod<Options> = async (app, options) => {
  const allow = (request: any, permission: any) => {
    options.service.requirePermission(request.platformAuth as PlatformAuthContext, permission);
  };

  app.get(
    '/platform/tenants/:tenantPublicId/units/:unitPublicId/professionals',
    { schema: { params: TenantUnitParamsSchema, response: { 200: ProfessionalUnitsResponseSchema } } },
    async (request) => {
      allow(request, 'platform.tenant.read');
      const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
      return options.professionalUnitLinkService.listUnit(tenantId, request.params.unitPublicId);
    },
  );

  app.post(
    '/platform/tenants/:tenantPublicId/units/:unitPublicId/professionals/:professionalPublicId',
    {
      schema: {
        params: TenantUnitProfessionalParamsSchema,
        body: UpsertProfessionalUnitRequestSchema,
        response: { 201: z.object({ success: z.literal(true) }) },
      },
    },
    async (request, reply) => {
      allow(request, 'platform.tenant.update');
      const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
      const platformAuth = request.platformAuth as PlatformAuthContext;

      await options.professionalUnitLinkService.upsert(
        tenantId,
        request.params.professionalPublicId,
        { unitPublicId: request.params.unitPublicId, active: request.body.active },
        { userId: platformAuth.user.id, sessionId: null as any },
      );
      return reply.status(201).send({ success: true });
    },
  );

  app.delete(
    '/platform/tenants/:tenantPublicId/units/:unitPublicId/professionals/:professionalPublicId',
    { schema: { params: TenantUnitProfessionalParamsSchema } },
    async (request) => {
      allow(request, 'platform.tenant.update');
      const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
      const platformAuth = request.platformAuth as PlatformAuthContext;

      await options.professionalUnitLinkService.status(
        tenantId,
        request.params.professionalPublicId,
        request.params.unitPublicId,
        false,
        { userId: platformAuth.user.id, sessionId: null as any },
      );
      return { success: true };
    },
  );
};
