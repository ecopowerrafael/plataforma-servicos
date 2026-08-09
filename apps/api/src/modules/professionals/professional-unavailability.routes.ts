import {
  CreateProfessionalUnavailabilityRequestSchema,
  ProfessionalUnavailabilityListQuerySchema,
  ProfessionalUnavailabilityListResponseSchema,
  SetProfessionalUnavailabilityStatusRequestSchema,
  UpdateProfessionalUnavailabilityRequestSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type ProfessionalUnavailabilityService } from './professional-unavailability.service.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';
import { type PrismaClient } from '../../database-client/client.js';

const professionalParams = z.object({ publicId: z.uuid() });
const itemParams = professionalParams.extend({ itemPublicId: z.uuid() });

export const professionalUnavailabilityRoutes: FastifyPluginAsyncZod<{
  service: ProfessionalUnavailabilityService;
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
    '/tenant/professionals/:publicId/unavailabilities',
    {
      schema: {
        params: professionalParams,
        querystring: ProfessionalUnavailabilityListQuerySchema,
        response: { 200: ProfessionalUnavailabilityListResponseSchema },
      },
    },
    (request) => {
      options.authService.requirePermission(request.tenant, 'professional.unavailability.read');
      return options.service.list(request.tenant.id, request.params.publicId, request.query);
    },
  );
  app.post(
    '/tenant/professionals/:publicId/unavailabilities',
    {
      schema: {
        params: professionalParams,
        body: CreateProfessionalUnavailabilityRequestSchema,
        response: { 200: ProfessionalUnavailabilityListResponseSchema },
      },
    },
    (request) => {
      options.authService.requirePermission(request.tenant, 'professional.unavailability.manage');
      return options.service.create(
        request.tenant.id,
        request.params.publicId,
        request.body,
        actor(request),
      );
    },
  );
  app.patch(
    '/tenant/professionals/:publicId/unavailabilities/:itemPublicId',
    {
      schema: {
        params: itemParams,
        body: UpdateProfessionalUnavailabilityRequestSchema,
        response: { 200: ProfessionalUnavailabilityListResponseSchema },
      },
    },
    (request) => {
      options.authService.requirePermission(request.tenant, 'professional.unavailability.manage');
      return options.service.update(
        request.tenant.id,
        request.params.publicId,
        request.params.itemPublicId,
        request.body,
        actor(request),
      );
    },
  );
  app.patch(
    '/tenant/professionals/:publicId/unavailabilities/:itemPublicId/status',
    {
      schema: {
        params: itemParams,
        body: SetProfessionalUnavailabilityStatusRequestSchema,
        response: { 200: ProfessionalUnavailabilityListResponseSchema },
      },
    },
    (request) => {
      options.authService.requirePermission(request.tenant, 'professional.unavailability.manage');
      return options.service.setStatus(
        request.tenant.id,
        request.params.publicId,
        request.params.itemPublicId,
        request.body.active,
        actor(request),
      );
    },
  );
  app.delete(
    '/tenant/professionals/:publicId/unavailabilities/:itemPublicId',
    {
      schema: {
        params: itemParams,
        response: { 200: ProfessionalUnavailabilityListResponseSchema },
      },
    },
    (request) => {
      options.authService.requirePermission(request.tenant, 'professional.unavailability.manage');
      return options.service.remove(
        request.tenant.id,
        request.params.publicId,
        request.params.itemPublicId,
        actor(request),
      );
    },
  );
};
