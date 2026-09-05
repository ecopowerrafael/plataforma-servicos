import {
  CreateBusinessUnitRequestSchema,
  UpdateBusinessUnitRequestSchema,
  TenantUnitsResponseSchema,
  TenantUnitResponseSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type PlatformService } from './platform.service.js';
import { type PlatformAuthContext } from './platform.service.js';
import { type TenantService } from '../tenants/tenant.service.js';

interface Options {
  service: PlatformService;
  tenantService: TenantService;
}

const TenantParamsSchema = z.object({ tenantPublicId: z.uuid() });
const UnitParamsSchema = TenantParamsSchema.extend({ unitPublicId: z.uuid() });

export const platformUnitsRoutes: FastifyPluginAsyncZod<Options> = async (app, options) => {
  const allow = (request: any, permission: any) => {
    options.service.requirePermission(request.platformAuth as PlatformAuthContext, permission);
  };

  app.get(
    '/platform/tenants/:tenantPublicId/units',
    { schema: { params: TenantParamsSchema, response: { 200: TenantUnitsResponseSchema } } },
    async (request) => {
      allow(request, 'platform.tenant.read');
      const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
      const units = await options.tenantService.listBusinessUnits(tenantId);
      return { units };
    },
  );

  app.post(
    '/platform/tenants/:tenantPublicId/units',
    {
      schema: {
        params: TenantParamsSchema,
        body: CreateBusinessUnitRequestSchema,
        response: { 201: TenantUnitResponseSchema },
      },
    },
    async (request, reply) => {
      allow(request, 'platform.tenant.update');
      const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
      const platformAuth = request.platformAuth as PlatformAuthContext;
      const unit = await options.tenantService.createBusinessUnit(
        tenantId,
        'UTC',
        request.body,
        { userId: platformAuth.user.id, sessionId: null },
      );
      return reply.status(201).send({ unit });
    },
  );

  app.patch(
    '/platform/tenants/:tenantPublicId/units/:unitPublicId',
    {
      schema: {
        params: UnitParamsSchema,
        body: UpdateBusinessUnitRequestSchema,
        response: { 200: TenantUnitResponseSchema },
      },
    },
    async (request) => {
      allow(request, 'platform.tenant.update');
      const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
      const platformAuth = request.platformAuth as PlatformAuthContext;
      const unit = await options.tenantService.updateBusinessUnit(
        tenantId,
        request.params.unitPublicId,
        'UTC',
        request.body,
        { userId: platformAuth.user.id, sessionId: null },
      );
      return { unit };
    },
  );

  for (const [path, active] of [
    ['activate', true],
    ['deactivate', false],
  ] as const)
    app.post(
      `/platform/tenants/:tenantPublicId/units/:unitPublicId/${path}`,
      { schema: { params: UnitParamsSchema, response: { 200: TenantUnitResponseSchema } } },
      async (request) => {
        allow(request, 'platform.tenant.update');
        const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
        const platformAuth = request.platformAuth as PlatformAuthContext;
        const unit = await options.tenantService.setBusinessUnitActive(
          tenantId,
          request.params.unitPublicId,
          active,
          { userId: platformAuth.user.id, sessionId: null },
        );
        return { unit };
      },
    );

  app.post(
    '/platform/tenants/:tenantPublicId/units/:unitPublicId/set-headquarters',
    { schema: { params: UnitParamsSchema, response: { 200: TenantUnitResponseSchema } } },
    async (request) => {
      allow(request, 'platform.tenant.update');
      const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
      const platformAuth = request.platformAuth as PlatformAuthContext;
      const unit = await options.tenantService.setHeadquarters(
        tenantId,
        request.params.unitPublicId,
        { userId: platformAuth.user.id, sessionId: null },
      );
      return { unit };
    },
  );
};
