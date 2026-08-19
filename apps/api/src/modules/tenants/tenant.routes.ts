import {
  CreateBusinessUnitRequestSchema,
  BusinessProfileCodeSchema,
  OperatingModelSchema,
  TenantSlugSchema,
  TenantContextResponseSchema,
  TenantIdentityResponseSchema,
  TenantSettingsInputSchema,
  TenantSettingsResponseSchema,
  TenantUnitResponseSchema,
  TenantUnitsResponseSchema,
  TenantExperienceResponseSchema,
  UpdateTenantIdentityRequestSchema,
  UpdateBusinessUnitRequestSchema,
  type TenantContextResponse,
  type TenantSettingsResponse,
  type TenantUnitResponse,
  type TenantUnitsResponse,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { tenantContextPlugin } from './tenant-context.plugin.js';
import { getTenantIdentity, updateTenantIdentity, updateTenantOnboarding } from './tenant-identity.service.js';
import { type TenantExperienceResolver } from './tenant-experience.resolver.js';
import { type TenantService } from './tenant.service.js';
import { canAccessUnit } from './unit-scope.js';
import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { type AuthService } from '../auth/auth.service.js';

interface TenantRoutesOptions {
  service: TenantService;
  authService: AuthService;
  cookieName: string;
  experience?: TenantExperienceResolver;
  client: PrismaClient;
}

const EmptyQuerySchema = z.object({}).strict();
const ensureUnitAccess = (allowed: string[] | null, publicId: string) => {
  if (!canAccessUnit(allowed, publicId))
    throw new AppError({
      code: 'UNIT_NOT_FOUND',
      message: 'A unidade não foi encontrada.',
      statusCode: 404,
    });
};
const UnitParamsSchema = z.object({ publicId: z.uuid() }).strict();
const OnboardingSlugQuerySchema = z.object({ slug: TenantSlugSchema }).strict();
const OnboardingRequestSchema = z.object({
  step: z.string().trim().min(1).max(40),
  completed: z.boolean().optional(),
  hideChecklist: z.boolean().optional(),
  businessProfile: BusinessProfileCodeSchema.optional(),
  operatingModel: OperatingModelSchema.optional(),
  businessTypeCustom: z.string().trim().min(2).max(120).nullable().optional(),
  displayName: z.string().trim().min(2).max(120).optional(),
  slug: TenantSlugSchema.optional(),
}).strict();
const actor = (r: { auth: { user: { id: bigint }; session: { id: bigint } } }) => ({
  userId: r.auth.user.id,
  sessionId: r.auth.session.id,
});

export const tenantRoutes: FastifyPluginAsyncZod<TenantRoutesOptions> = async (app, options) => {
  await app.register(tenantContextPlugin, {
    authService: options.authService,
    cookieName: options.cookieName,
    client: options.client,
  });

  app.get('/tenant/onboarding', async (request) => {
    options.authService.requirePermission(request.tenant, 'tenant.read');
    const tenant = await options.client.tenant.findUniqueOrThrow({
      where: { id: request.tenant.id },
      select: {
        onboardingStep: true,
        onboardingCompletedAt: true,
        onboardingChecklistHiddenAt: true,
        operatingModel: true,
      },
    });
    return tenant;
  });
  app.patch('/tenant/onboarding', { schema: { body: OnboardingRequestSchema } }, async (request) => {
    options.authService.requirePermission(request.tenant, 'tenant.update');
    if (!request.tenant.membership.isOwner) throw new AppError({ code: 'PERMISSION_DENIED', message: 'Apenas o proprietário pode atualizar o onboarding.', statusCode: 403 });
    return updateTenantOnboarding(options.client, request.tenant.id, request.body);
  });
  app.get('/tenant/onboarding/slug-availability', { schema: { querystring: OnboardingSlugQuerySchema } }, async (request) => {
    options.authService.requirePermission(request.tenant, 'tenant.read');
    const conflict = await options.client.tenant.findFirst({
      where: { slug: request.query.slug, id: { not: request.tenant.id } },
      select: { id: true },
    });
    return { available: conflict === null };
  });
  app.get('/tenant/onboarding/checklist', async (request) => {
    options.authService.requirePermission(request.tenant, 'tenant.read');
    const [tenant, services, professionals, schedules, appointments, branding] = await Promise.all([
      options.client.tenant.findUniqueOrThrow({ where: { id: request.tenant.id }, select: { onboardingCompletedAt: true, onboardingChecklistHiddenAt: true } }),
      options.client.service.count({ where: { tenantId: request.tenant.id, active: true } }),
      options.client.professional.count({ where: { tenantId: request.tenant.id, active: true } }),
      options.client.professionalWorkSchedule.count({ where: { tenantId: request.tenant.id } }),
      options.client.appointment.count({ where: { tenantId: request.tenant.id } }),
      options.client.tenantBranding.count({ where: { tenantId: request.tenant.id } }),
    ]);
    return { hidden: tenant.onboardingChecklistHiddenAt !== null, items: [
      { key: 'company', complete: tenant.onboardingCompletedAt !== null },
      { key: 'branding', complete: branding > 0 },
      { key: 'service', complete: services > 0 },
      { key: 'professional', complete: professionals > 0 },
      { key: 'schedule', complete: schedules > 0 },
      { key: 'appointment', complete: appointments > 0 },
      { key: 'share', complete: false },
    ] };
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

  app.get('/tenant/identity', { schema: { response: { 200: TenantIdentityResponseSchema } } }, async (request) => {
    options.authService.requirePermission(request.tenant, 'tenant.read');
    return getTenantIdentity(options.client, request.tenant.id);
  });

  app.patch('/tenant/identity', { schema: { body: UpdateTenantIdentityRequestSchema, response: { 200: TenantIdentityResponseSchema } } }, async (request) => {
    options.authService.requirePermission(request.tenant, 'tenant.update');
    if (!request.tenant.membership.isOwner)
      throw new AppError({ code: 'PERMISSION_DENIED', message: 'Apenas o proprietário pode alterar a identidade do estabelecimento.', statusCode: 403 });
    return updateTenantIdentity(options.client, request.tenant.id, request.body);
  });

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
      const units = await options.service.listBusinessUnits(request.tenant.id);
      const allowed = request.tenant.membership.unitPublicIds ?? null;
      return {
        units:
          allowed === null ? units : units.filter(({ publicId }) => allowed.includes(publicId)),
      };
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
      ensureUnitAccess(request.tenant.membership.unitPublicIds ?? null, request.params.publicId);
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
      ensureUnitAccess(request.tenant.membership.unitPublicIds ?? null, request.params.publicId);
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
        ensureUnitAccess(request.tenant.membership.unitPublicIds ?? null, request.params.publicId);
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
      ensureUnitAccess(request.tenant.membership.unitPublicIds ?? null, request.params.publicId);
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
