import {
  ProfessionalScheduleResponseSchema,
  SetProfessionalSchedulePeriodStatusRequestSchema,
  UpdateProfessionalSchedulePeriodRequestSchema,
  UpsertProfessionalScheduleRequestSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type ProfessionalScheduleService } from './professional-schedule.service.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';
import { type PrismaClient } from '../../database-client/client.js';

const professionalParams = z.object({ publicId: z.uuid() });
const periodParams = professionalParams.extend({ periodPublicId: z.uuid() });

export const professionalScheduleRoutes: FastifyPluginAsyncZod<{
  service: ProfessionalScheduleService;
  authService: AuthService;
  cookieName: string;
  client?: PrismaClient;
}> = async (app, options) => {
  await app.register(tenantContextPlugin, {
    authService: options.authService,
    cookieName: options.cookieName,
    client: options.client,
  });
  const actor = (request: { auth: { user: { id: bigint }; session: { id: bigint } } }) => ({
    userId: request.auth.user.id,
    sessionId: request.auth.session.id,
  });

  app.get(
    '/tenant/professionals/:publicId/schedule',
    {
      schema: { params: professionalParams, response: { 200: ProfessionalScheduleResponseSchema } },
    },
    (request) => {
      options.authService.requirePermission(request.tenant, 'professional.schedule.read');
      return options.service.list(request.tenant.id, request.params.publicId);
    },
  );

  app.post(
    '/tenant/professionals/:publicId/schedule',
    {
      schema: {
        params: professionalParams,
        body: UpsertProfessionalScheduleRequestSchema,
        response: { 200: ProfessionalScheduleResponseSchema },
      },
    },
    (request) => {
      options.authService.requirePermission(request.tenant, 'professional.schedule.manage');
      return options.service.create(
        request.tenant.id,
        request.params.publicId,
        request.body,
        actor(request),
      );
    },
  );

  app.patch(
    '/tenant/professionals/:publicId/schedule/:periodPublicId',
    {
      schema: {
        params: periodParams,
        body: UpdateProfessionalSchedulePeriodRequestSchema,
        response: { 200: ProfessionalScheduleResponseSchema },
      },
    },
    (request) => {
      options.authService.requirePermission(request.tenant, 'professional.schedule.manage');
      return options.service.update(
        request.tenant.id,
        request.params.publicId,
        request.params.periodPublicId,
        request.body,
        actor(request),
      );
    },
  );

  app.patch(
    '/tenant/professionals/:publicId/schedule/:periodPublicId/status',
    {
      schema: {
        params: periodParams,
        body: SetProfessionalSchedulePeriodStatusRequestSchema,
        response: { 200: ProfessionalScheduleResponseSchema },
      },
    },
    (request) => {
      options.authService.requirePermission(request.tenant, 'professional.schedule.manage');
      return options.service.setStatus(
        request.tenant.id,
        request.params.publicId,
        request.params.periodPublicId,
        request.body.active,
        actor(request),
      );
    },
  );

  app.delete(
    '/tenant/professionals/:publicId/schedule/:periodPublicId',
    { schema: { params: periodParams, response: { 200: ProfessionalScheduleResponseSchema } } },
    (request) => {
      options.authService.requirePermission(request.tenant, 'professional.schedule.manage');
      return options.service.remove(
        request.tenant.id,
        request.params.publicId,
        request.params.periodPublicId,
        actor(request),
      );
    },
  );
};
