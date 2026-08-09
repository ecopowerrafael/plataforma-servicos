import {
  AvailabilityQuerySchema,
  AvailabilityResponseSchema,
  CalendarQuerySchema,
  CalendarResponseSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { type AvailabilityService } from './availability.service.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';
import { type PrismaClient } from '../../database-client/client.js';

export const availabilityRoutes: FastifyPluginAsyncZod<{
  service: AvailabilityService;
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
    '/tenant/availability',
    {
      schema: {
        querystring: AvailabilityQuerySchema,
        response: { 200: AvailabilityResponseSchema },
      },
    },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'availability.read');
      await options.service.auditRead(request.tenant.id, actor(request), 'availability.read');
      return options.service.available(request.tenant.id, request.query);
    },
  );
  app.get(
    '/tenant/calendar',
    { schema: { querystring: CalendarQuerySchema, response: { 200: CalendarResponseSchema } } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'calendar.read');
      await options.service.auditRead(request.tenant.id, actor(request), 'calendar.read');
      return options.service.calendar(request.tenant.id, request.query);
    },
  );
};
