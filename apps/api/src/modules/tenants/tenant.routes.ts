import {
  CreateBusinessUnitRequestSchema,
  TenantContextResponseSchema,
  TenantSettingsInputSchema,
  TenantSettingsResponseSchema,
  TenantUnitResponseSchema,
  TenantUnitsResponseSchema,
  TenantExperienceResponseSchema,
  UpdateBusinessUnitRequestSchema,
  type TenantContextResponse,
  type TenantSettingsResponse,
  type TenantUnitResponse,
  type TenantUnitsResponse,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { tenantContextPlugin } from './tenant-context.plugin.js';
import { type TenantExperienceResolver } from './tenant-experience.resolver.js';
import { type TenantService } from './tenant.service.js';
import { type AuthService } from '../auth/auth.service.js';

interface TenantRoutesOptions {
  service: TenantService;
  authService: AuthService;
  cookieName: string;
  experience?: TenantExperienceResolver;
}

const EmptyQuerySchema = z.object({}).strict();
const UnitParamsSchema = z.object({ publicId: z.uuid() }).strict();
const actor = (r: { auth: { user: { id: bigint }; session: { id: bigint } } }) => ({
  userId: r.auth.user.id,
  sessionId: r.auth.session.id,
});

export const tenantRoutes: FastifyPluginAsyncZod<TenantRoutesOptions> = async (app, options) => {
  await app.register(tenantContextPlugin, {
    authService: options.authService,
    cookieName: options.cookieName,
  });

  app.get(
    '/tenant/context',
    {
      schema: {
        querystring: EmptyQuerySchema,
        response: { 200: TenantContextResponseSchema },
      },
    },
    (request): TenantContextResponse => {
      options.authService.requirePermission(request.tenant, 'tenant.read');
      return {
        tenant: {
          publicId: request.tenant.publicId,
          slug: request.tenant.slug,
          displayName: request.tenant.displayName,
          status: request.tenant.status,
          timezone: request.tenant.timezone,
          locale: request.tenant.locale,
          currency: request.tenant.currency,
        },
      };
    },
  );

  const experienceResolver = options.experience;
  if (experienceResolver !== undefined) {
    app.get(
      '/tenant/experience',
      {
        schema: {
          querystring: EmptyQuerySchema,
          response: { 200: TenantExperienceResponseSchema },
        },
      },
      async (request) => {
        options.authService.requirePermission(request.tenant, 'tenant.read');
        const experience = await experienceResolver.findByTenantPublicId(request.tenant.publicId);
        if (experience === null)
          throw new Error('A experi\u00eancia do estabelecimento n\u00e3o foi encontrada.');
        return experience;
      },
    );
  }

  app.get(
    '/tenant/units',
    {
      schema: {
        querystring: EmptyQuerySchema,
        response: { 200: TenantUnitsResponseSchema },
      },
    },
    async (request): Promise<TenantUnitsResponse> => {
      options.authService.requirePermission(request.tenant, 'unit.read');
      return { units: await options.service.listBusinessUnits(request.tenant.id) };
    },
  );

  app.get(
    '/tenant/units/:publicId',
    {
      schema: {
        params: UnitParamsSchema,
        querystring: EmptyQuerySchema,
        response: { 200: TenantUnitResponseSchema },
      },
    },
    async (request): Promise<TenantUnitResponse> => {
      options.authService.requirePermission(request.tenant, 'unit.read');
      return {
        unit: await options.service.getBusinessUnit(request.tenant.id, request.params.publicId),
      };
    },
  );

  app.post(
    '/tenant/units',
    {
      schema: {
        body: CreateBusinessUnitRequestSchema,
        response: { 201: TenantUnitResponseSchema },
      },
    },
    async (request, reply) => {
      options.authService.requirePermission(request.tenant, 'unit.create');
      const unit = await options.service.createBusinessUnit(
        request.tenant.id,
        request.tenant.timezone,
        request.body,
        actor(request),
      );
      return reply.status(201).send({ unit });
    },
  );

  app.patch(
    '/tenant/units/:publicId',
    {
      schema: {
        params: UnitParamsSchema,
        body: UpdateBusinessUnitRequestSchema,
        response: { 200: TenantUnitResponseSchema },
      },
    },
    async (request): Promise<TenantUnitResponse> => {
      options.authService.requirePermission(request.tenant, 'unit.update');
      const unit = await options.service.updateBusinessUnit(
        request.tenant.id,
        request.params.publicId,
        request.tenant.timezone,
        request.body,
        actor(request),
      );
      return { unit };
    },
  );

  for (const [path, active] of [
    ['activate', true],
    ['deactivate', false],
  ] as const)
    app.post(
      `/tenant/units/:publicId/${path}`,
      { schema: { params: UnitParamsSchema, response: { 200: TenantUnitResponseSchema } } },
      async (request): Promise<TenantUnitResponse> => {
        options.authService.requirePermission(request.tenant, 'unit.update');
        const unit = await options.service.setBusinessUnitActive(
          request.tenant.id,
          request.params.publicId,
          active,
          actor(request),
        );
        return { unit };
      },
    );

  app.post(
    '/tenant/units/:publicId/set-headquarters',
    { schema: { params: UnitParamsSchema, response: { 200: TenantUnitResponseSchema } } },
    async (request): Promise<TenantUnitResponse> => {
      options.authService.requirePermission(request.tenant, 'unit.update');
      const unit = await options.service.setHeadquarters(
        request.tenant.id,
        request.params.publicId,
        actor(request),
      );
      return { unit };
    },
  );

  app.get(
    '/tenant/settings',
    {
      schema: {
        querystring: EmptyQuerySchema,
        response: { 200: TenantSettingsResponseSchema },
      },
    },
    async (request): Promise<TenantSettingsResponse> => {
      options.authService.requirePermission(request.tenant, 'tenant.read');
      return { settings: await options.service.getSettings(request.tenant.id) };
    },
  );

  app.patch(
    '/tenant/settings',
    {
      schema: {
        body: TenantSettingsInputSchema,
        response: { 200: TenantSettingsResponseSchema },
      },
    },
    async (request): Promise<TenantSettingsResponse> => {
      options.authService.requirePermission(request.tenant, 'tenant.update');
      const settings = TenantSettingsInputSchema.parse(request.body);
      return { settings: await options.service.updateSettings(request.tenant.id, settings) };
    },
  );
};
