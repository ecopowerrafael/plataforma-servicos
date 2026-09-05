import {
  BusinessUnitOperatingHoursResponseSchema,
  ReplaceBusinessUnitOperatingHoursRequestSchema,
  ProfessionalScheduleResponseSchema,
  UpsertProfessionalScheduleRequestSchema,
  UpdateProfessionalSchedulePeriodRequestSchema,
  ProfessionalUnavailabilityListResponseSchema,
  CreateProfessionalUnavailabilityRequestSchema,
  UpdateProfessionalUnavailabilityRequestSchema,
  ProfessionalUnavailabilityListQuerySchema,
  BusinessUnitDateOverridesResponseSchema,
  ReplaceBusinessUnitDateOverrideRequestSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type PlatformService } from './platform.service.js';
import { type PlatformAuthContext } from './platform.service.js';
import { type BusinessUnitOperatingHoursService } from '../tenants/business-unit-operating-hours.service.js';
import { type ProfessionalScheduleService } from '../professionals/professional-schedule.service.js';
import { type ProfessionalUnavailabilityService } from '../professionals/professional-unavailability.service.js';
import { type BusinessUnitDateOverridesService } from '../tenants/business-unit-date-overrides.service.js';

interface Options {
  service: PlatformService;
  businessUnitOperatingHoursService?: BusinessUnitOperatingHoursService | undefined;
  professionalScheduleService?: ProfessionalScheduleService | undefined;
  professionalUnavailabilityService?: ProfessionalUnavailabilityService | undefined;
  businessUnitDateOverridesService?: BusinessUnitDateOverridesService | undefined;
}

const TenantParamsSchema = z.object({ tenantPublicId: z.uuid() });
const UnitParamsSchema = TenantParamsSchema.extend({ unitPublicId: z.uuid() });
const ProfessionalParamsSchema = TenantParamsSchema.extend({ professionalPublicId: z.uuid() });
const UnavailabilityParamsSchema = ProfessionalParamsSchema.extend({ unavailabilityPublicId: z.uuid() });
const SchedulePeriodParamsSchema = ProfessionalParamsSchema.extend({ periodPublicId: z.uuid() });
const DateOverrideQuerySchema = z.object({ from: z.string().optional(), to: z.string().optional() });

export const platformScheduleRoutes: FastifyPluginAsyncZod<Options> = async (app, options) => {
  const allow = (request: any, permission: any) => {
    options.service.requirePermission(request.platformAuth as PlatformAuthContext, permission);
  };

  // OPERATING HOURS
  if (options.businessUnitOperatingHoursService !== undefined) {
    app.get(
      '/platform/tenants/:tenantPublicId/units/:unitPublicId/operating-hours',
      { schema: { params: UnitParamsSchema, response: { 200: BusinessUnitOperatingHoursResponseSchema } } },
      async (request) => {
        allow(request, 'platform.tenant.read');
        const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
        return options.businessUnitOperatingHoursService!.list(
          tenantId,
          request.params.unitPublicId,
        );
      },
    );

    app.put(
      '/platform/tenants/:tenantPublicId/units/:unitPublicId/operating-hours',
      {
        schema: {
          params: UnitParamsSchema,
          body: ReplaceBusinessUnitOperatingHoursRequestSchema,
          response: { 200: BusinessUnitOperatingHoursResponseSchema },
        },
      },
      async (request) => {
        allow(request, 'platform.tenant.update');
        const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
        const platformAuth = request.platformAuth as PlatformAuthContext;
        const result = await options.businessUnitOperatingHoursService!.replace(
          tenantId,
          request.params.unitPublicId,
          request.body,
          { userId: platformAuth.user.id, sessionId: null },
        );
        return result;
      },
    );
  }

  // PROFESSIONAL WORK SCHEDULES
  if (options.professionalScheduleService !== undefined) {
    app.get(
      '/platform/tenants/:tenantPublicId/professionals/:professionalPublicId/schedule',
      { schema: { params: ProfessionalParamsSchema, response: { 200: ProfessionalScheduleResponseSchema } } },
      async (request) => {
        allow(request, 'platform.tenant.read');
        const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
        return options.professionalScheduleService!.list(
          tenantId,
          request.params.professionalPublicId,
        );
      },
    );

    app.post(
      '/platform/tenants/:tenantPublicId/professionals/:professionalPublicId/schedule',
      {
        schema: {
          params: ProfessionalParamsSchema,
          body: UpsertProfessionalScheduleRequestSchema,
          response: { 200: ProfessionalScheduleResponseSchema },
        },
      },
      async (request) => {
        allow(request, 'platform.tenant.update');
        const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
        const platformAuth = request.platformAuth as PlatformAuthContext;
        const result = await options.professionalScheduleService!.create(
          tenantId,
          request.params.professionalPublicId,
          request.body,
          { userId: platformAuth.user.id, sessionId: null },
        );
        return result;
      },
    );

    app.put(
      '/platform/tenants/:tenantPublicId/professionals/:professionalPublicId/schedule',
      {
        schema: {
          params: ProfessionalParamsSchema,
          body: UpsertProfessionalScheduleRequestSchema,
          response: { 200: ProfessionalScheduleResponseSchema },
        },
      },
      async (request) => {
        allow(request, 'platform.tenant.update');
        const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
        const platformAuth = request.platformAuth as PlatformAuthContext;
        const result = await options.professionalScheduleService!.replace(
          tenantId,
          request.params.professionalPublicId,
          request.body,
          { userId: platformAuth.user.id, sessionId: null },
        );
        return result;
      },
    );

    app.patch(
      '/platform/tenants/:tenantPublicId/professionals/:professionalPublicId/schedule/:periodPublicId',
      {
        schema: {
          params: SchedulePeriodParamsSchema,
          body: UpdateProfessionalSchedulePeriodRequestSchema,
          response: { 200: ProfessionalScheduleResponseSchema },
        },
      },
      async (request) => {
        allow(request, 'platform.tenant.update');
        const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
        const platformAuth = request.platformAuth as PlatformAuthContext;
        const result = await options.professionalScheduleService!.update(
          tenantId,
          request.params.professionalPublicId,
          request.params.periodPublicId,
          request.body,
          { userId: platformAuth.user.id, sessionId: null },
        );
        return result;
      },
    );

    app.delete(
      '/platform/tenants/:tenantPublicId/professionals/:professionalPublicId/schedule/:periodPublicId',
      { schema: { params: SchedulePeriodParamsSchema, response: { 200: ProfessionalScheduleResponseSchema } } },
      async (request) => {
        allow(request, 'platform.tenant.update');
        const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
        const platformAuth = request.platformAuth as PlatformAuthContext;
        const result = await options.professionalScheduleService!.remove(
          tenantId,
          request.params.professionalPublicId,
          request.params.periodPublicId,
          { userId: platformAuth.user.id, sessionId: null },
        );
        return result;
      },
    );
  }

  // PROFESSIONAL UNAVAILABILITIES
  if (options.professionalUnavailabilityService !== undefined) {
    app.get(
      '/platform/tenants/:tenantPublicId/professionals/:professionalPublicId/unavailabilities',
      {
        schema: {
          params: ProfessionalParamsSchema,
          querystring: ProfessionalUnavailabilityListQuerySchema,
          response: { 200: ProfessionalUnavailabilityListResponseSchema },
        },
      },
      async (request) => {
        allow(request, 'platform.tenant.read');
        const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
        return options.professionalUnavailabilityService!.list(
          tenantId,
          request.params.professionalPublicId,
          request.query,
        );
      },
    );

    app.post(
      '/platform/tenants/:tenantPublicId/professionals/:professionalPublicId/unavailabilities',
      {
        schema: {
          params: ProfessionalParamsSchema,
          body: CreateProfessionalUnavailabilityRequestSchema,
          response: { 200: ProfessionalUnavailabilityListResponseSchema },
        },
      },
      async (request) => {
        allow(request, 'platform.tenant.update');
        const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
        const platformAuth = request.platformAuth as PlatformAuthContext;
        const result = await options.professionalUnavailabilityService!.create(
          tenantId,
          request.params.professionalPublicId,
          request.body,
          { userId: platformAuth.user.id, sessionId: null },
        );
        return result;
      },
    );

    app.patch(
      '/platform/tenants/:tenantPublicId/professionals/:professionalPublicId/unavailabilities/:unavailabilityPublicId',
      {
        schema: {
          params: UnavailabilityParamsSchema,
          body: UpdateProfessionalUnavailabilityRequestSchema,
          response: { 200: ProfessionalUnavailabilityListResponseSchema },
        },
      },
      async (request) => {
        allow(request, 'platform.tenant.update');
        const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
        const platformAuth = request.platformAuth as PlatformAuthContext;
        const result = await options.professionalUnavailabilityService!.update(
          tenantId,
          request.params.professionalPublicId,
          request.params.unavailabilityPublicId,
          request.body,
          { userId: platformAuth.user.id, sessionId: null },
        );
        return result;
      },
    );

    app.delete(
      '/platform/tenants/:tenantPublicId/professionals/:professionalPublicId/unavailabilities/:unavailabilityPublicId',
      { schema: { params: UnavailabilityParamsSchema, response: { 200: ProfessionalUnavailabilityListResponseSchema } } },
      async (request) => {
        allow(request, 'platform.tenant.update');
        const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
        const platformAuth = request.platformAuth as PlatformAuthContext;
        const result = await options.professionalUnavailabilityService!.remove(
          tenantId,
          request.params.professionalPublicId,
          request.params.unavailabilityPublicId,
          { userId: platformAuth.user.id, sessionId: null },
        );
        return result;
      },
    );
  }

  // BUSINESS UNIT DATE OVERRIDES
  if (options.businessUnitDateOverridesService !== undefined) {
    app.get(
      '/platform/tenants/:tenantPublicId/units/:unitPublicId/date-overrides',
      {
        schema: {
          params: UnitParamsSchema,
          querystring: DateOverrideQuerySchema,
          response: { 200: BusinessUnitDateOverridesResponseSchema },
        },
      },
      async (request) => {
        allow(request, 'platform.tenant.read');
        const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
        const query = request.query as { from?: string; to?: string };
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        const oneMonthLater = new Date();
        oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
        const from = query.from ?? oneMonthAgo.toISOString().slice(0, 10);
        const to = query.to ?? oneMonthLater.toISOString().slice(0, 10);
        return options.businessUnitDateOverridesService!.list(
          tenantId,
          request.params.unitPublicId,
          from,
          to,
        );
      },
    );

    app.put(
      '/platform/tenants/:tenantPublicId/units/:unitPublicId/date-overrides/:date',
      {
        schema: {
          params: UnitParamsSchema.extend({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
          body: ReplaceBusinessUnitDateOverrideRequestSchema,
          response: { 200: BusinessUnitDateOverridesResponseSchema },
        },
      },
      async (request) => {
        allow(request, 'platform.tenant.update');
        const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
        const platformAuth = request.platformAuth as PlatformAuthContext;
        await options.businessUnitDateOverridesService!.replace(
          tenantId,
          request.params.unitPublicId,
          request.params.date,
          request.body,
          { userId: platformAuth.user.id, sessionId: null },
        );
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        const oneMonthLater = new Date();
        oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
        const from = oneMonthAgo.toISOString().slice(0, 10);
        const to = oneMonthLater.toISOString().slice(0, 10);
        const result = await options.businessUnitDateOverridesService!.list(
          tenantId,
          request.params.unitPublicId,
          from,
          to,
        );
        return result;
      },
    );

    app.delete(
      '/platform/tenants/:tenantPublicId/units/:unitPublicId/date-overrides/:date',
      {
        schema: {
          params: UnitParamsSchema.extend({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
          response: { 200: BusinessUnitDateOverridesResponseSchema },
        },
      },
      async (request) => {
        allow(request, 'platform.tenant.update');
        const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
        const platformAuth = request.platformAuth as PlatformAuthContext;
        await options.businessUnitDateOverridesService!.remove(
          tenantId,
          request.params.unitPublicId,
          request.params.date,
          { userId: platformAuth.user.id, sessionId: null },
        );
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        const oneMonthLater = new Date();
        oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
        const from = oneMonthAgo.toISOString().slice(0, 10);
        const to = oneMonthLater.toISOString().slice(0, 10);
        const result = await options.businessUnitDateOverridesService!.list(
          tenantId,
          request.params.unitPublicId,
          from,
          to,
        );
        return result;
      },
    );
  }
};
