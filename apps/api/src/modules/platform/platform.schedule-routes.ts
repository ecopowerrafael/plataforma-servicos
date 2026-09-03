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
import { type BusinessUnitOperatingHoursService } from '../tenants/business-unit-operating-hours.service.js';
import { type ProfessionalScheduleService } from '../professionals/professional-schedule.service.js';
import { type ProfessionalUnavailabilityService } from '../professionals/professional-unavailability.service.js';
import { type BusinessUnitDateOverridesService } from '../tenants/business-unit-date-overrides.service.js';
import { requestMetadata } from '../auth/request-context.js';

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

export const platformScheduleRoutes: FastifyPluginAsyncZod<Options> = async (app, options) => {
  const allow = (request: any, permission: any) => {
    options.service.requirePermission(request.platformAuth, permission);
  };

  // OPERATING HOURS
  if (options.businessUnitOperatingHoursService !== undefined) {
    app.get(
      '/platform/tenants/:tenantPublicId/units/:unitPublicId/operating-hours',
      { schema: { params: UnitParamsSchema, response: { 200: BusinessUnitOperatingHoursResponseSchema } } },
      async (request: any) => {
        allow(request, 'platform.tenant.read');
        await options.service.resolveTenantId(request.params.tenantPublicId);
        return options.businessUnitOperatingHoursService!.list(
          request.platformAuth.tenantId,
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
      async (request: any) => {
        allow(request, 'platform.tenant.update');
        await options.service.resolveTenantId(request.params.tenantPublicId);
        const result = await options.businessUnitOperatingHoursService!.replace(
          request.platformAuth.tenantId,
          request.params.unitPublicId,
          request.body,
          { userId: request.platformAuth.userId, sessionId: request.platformAuth.sessionId },
        );
        await options.service.recordTenantAudit(
          'platform.tenant.operating_hours_updated',
          'business_unit',
          request.params.unitPublicId,
          request.platformAuth.tenantId,
          request.platformAuth,
          requestMetadata(request),
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
      async (request: any) => {
        allow(request, 'platform.tenant.read');
        await options.service.resolveTenantId(request.params.tenantPublicId);
        return options.professionalScheduleService!.list(
          request.platformAuth.tenantId,
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
      async (request: any) => {
        allow(request, 'platform.tenant.update');
        await options.service.resolveTenantId(request.params.tenantPublicId);
        const result = await options.professionalScheduleService!.create(
          request.platformAuth.tenantId,
          request.params.professionalPublicId,
          request.body,
          { userId: request.platformAuth.userId, sessionId: request.platformAuth.sessionId },
        );
        await options.service.recordTenantAudit(
          'platform.tenant.professional_schedule_created',
          'professional',
          request.params.professionalPublicId,
          request.platformAuth.tenantId,
          request.platformAuth,
          requestMetadata(request),
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
      async (request: any) => {
        allow(request, 'platform.tenant.update');
        await options.service.resolveTenantId(request.params.tenantPublicId);
        const result = await options.professionalScheduleService!.replace(
          request.platformAuth.tenantId,
          request.params.professionalPublicId,
          request.body,
          { userId: request.platformAuth.userId, sessionId: request.platformAuth.sessionId },
        );
        await options.service.recordTenantAudit(
          'platform.tenant.professional_schedule_replaced',
          'professional',
          request.params.professionalPublicId,
          request.platformAuth.tenantId,
          request.platformAuth,
          requestMetadata(request),
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
      async (request: any) => {
        allow(request, 'platform.tenant.update');
        await options.service.resolveTenantId(request.params.tenantPublicId);
        const result = await options.professionalScheduleService!.update(
          request.platformAuth.tenantId,
          request.params.professionalPublicId,
          request.params.periodPublicId,
          request.body,
          { userId: request.platformAuth.userId, sessionId: request.platformAuth.sessionId },
        );
        await options.service.recordTenantAudit(
          'platform.tenant.professional_schedule_updated',
          'professional',
          request.params.professionalPublicId,
          request.platformAuth.tenantId,
          request.platformAuth,
          requestMetadata(request),
        );
        return result;
      },
    );

    app.delete(
      '/platform/tenants/:tenantPublicId/professionals/:professionalPublicId/schedule/:periodPublicId',
      { schema: { params: SchedulePeriodParamsSchema, response: { 200: ProfessionalScheduleResponseSchema } } },
      async (request: any) => {
        allow(request, 'platform.tenant.update');
        await options.service.resolveTenantId(request.params.tenantPublicId);
        const result = await options.professionalScheduleService!.remove(
          request.platformAuth.tenantId,
          request.params.professionalPublicId,
          request.params.periodPublicId,
          { userId: request.platformAuth.userId, sessionId: request.platformAuth.sessionId },
        );
        await options.service.recordTenantAudit(
          'platform.tenant.professional_schedule_deleted',
          'professional',
          request.params.professionalPublicId,
          request.platformAuth.tenantId,
          request.platformAuth,
          requestMetadata(request),
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
      async (request: any) => {
        allow(request, 'platform.tenant.read');
        await options.service.resolveTenantId(request.params.tenantPublicId);
        return options.professionalUnavailabilityService!.list(
          request.platformAuth.tenantId,
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
      async (request: any) => {
        allow(request, 'platform.tenant.update');
        await options.service.resolveTenantId(request.params.tenantPublicId);
        const result = await options.professionalUnavailabilityService!.create(
          request.platformAuth.tenantId,
          request.params.professionalPublicId,
          request.body,
          { userId: request.platformAuth.userId, sessionId: request.platformAuth.sessionId },
        );
        await options.service.recordTenantAudit(
          'platform.tenant.professional_unavailability_created',
          'professional',
          request.params.professionalPublicId,
          request.platformAuth.tenantId,
          request.platformAuth,
          requestMetadata(request),
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
      async (request: any) => {
        allow(request, 'platform.tenant.update');
        await options.service.resolveTenantId(request.params.tenantPublicId);
        const result = await options.professionalUnavailabilityService!.update(
          request.platformAuth.tenantId,
          request.params.professionalPublicId,
          request.params.unavailabilityPublicId,
          request.body,
          { userId: request.platformAuth.userId, sessionId: request.platformAuth.sessionId },
        );
        await options.service.recordTenantAudit(
          'platform.tenant.professional_unavailability_updated',
          'professional',
          request.params.professionalPublicId,
          request.platformAuth.tenantId,
          request.platformAuth,
          requestMetadata(request),
        );
        return result;
      },
    );

    app.delete(
      '/platform/tenants/:tenantPublicId/professionals/:professionalPublicId/unavailabilities/:unavailabilityPublicId',
      { schema: { params: UnavailabilityParamsSchema, response: { 200: ProfessionalUnavailabilityListResponseSchema } } },
      async (request: any) => {
        allow(request, 'platform.tenant.update');
        await options.service.resolveTenantId(request.params.tenantPublicId);
        const result = await options.professionalUnavailabilityService!.remove(
          request.platformAuth.tenantId,
          request.params.professionalPublicId,
          request.params.unavailabilityPublicId,
          { userId: request.platformAuth.userId, sessionId: request.platformAuth.sessionId },
        );
        await options.service.recordTenantAudit(
          'platform.tenant.professional_unavailability_deleted',
          'professional',
          request.params.professionalPublicId,
          request.platformAuth.tenantId,
          request.platformAuth,
          requestMetadata(request),
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
          params: UnitParamsSchema.extend({ from: z.string(), to: z.string() }).optional(),
          response: { 200: BusinessUnitDateOverridesResponseSchema },
        },
      },
      async (request: any) => {
        allow(request, 'platform.tenant.read');
        await options.service.resolveTenantId(request.params.tenantPublicId);
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        const oneMonthLater = new Date();
        oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
        const from = oneMonthAgo.toISOString().slice(0, 10);
        const to = oneMonthLater.toISOString().slice(0, 10);
        return options.businessUnitDateOverridesService!.list(
          request.platformAuth.tenantId,
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
      async (request: any) => {
        allow(request, 'platform.tenant.update');
        await options.service.resolveTenantId(request.params.tenantPublicId);
        await options.businessUnitDateOverridesService!.replace(
          request.platformAuth.tenantId,
          request.params.unitPublicId,
          request.params.date,
          request.body,
          { userId: request.platformAuth.userId, sessionId: request.platformAuth.sessionId },
        );
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        const oneMonthLater = new Date();
        oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
        const from = oneMonthAgo.toISOString().slice(0, 10);
        const to = oneMonthLater.toISOString().slice(0, 10);
        const result = await options.businessUnitDateOverridesService!.list(
          request.platformAuth.tenantId,
          request.params.unitPublicId,
          from,
          to,
        );
        await options.service.recordTenantAudit(
          'platform.tenant.date_override_updated',
          'business_unit',
          request.params.unitPublicId,
          request.platformAuth.tenantId,
          request.platformAuth,
          requestMetadata(request),
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
      async (request: any) => {
        allow(request, 'platform.tenant.update');
        await options.service.resolveTenantId(request.params.tenantPublicId);
        await options.businessUnitDateOverridesService!.remove(
          request.platformAuth.tenantId,
          request.params.unitPublicId,
          request.params.date,
          { userId: request.platformAuth.userId, sessionId: request.platformAuth.sessionId },
        );
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        const oneMonthLater = new Date();
        oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
        const from = oneMonthAgo.toISOString().slice(0, 10);
        const to = oneMonthLater.toISOString().slice(0, 10);
        const result = await options.businessUnitDateOverridesService!.list(
          request.platformAuth.tenantId,
          request.params.unitPublicId,
          from,
          to,
        );
        await options.service.recordTenantAudit(
          'platform.tenant.date_override_deleted',
          'business_unit',
          request.params.unitPublicId,
          request.platformAuth.tenantId,
          request.platformAuth,
          requestMetadata(request),
        );
        return result;
      },
    );
  }
};
