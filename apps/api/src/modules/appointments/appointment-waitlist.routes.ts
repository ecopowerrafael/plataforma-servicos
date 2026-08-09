import {
  AppointmentPublicSchema,
  AppointmentWaitlistFilterSchema,
  AppointmentWaitlistListResponseSchema,
  AppointmentWaitlistPublicSchema,
  CancelAppointmentWaitlistRequestSchema,
  ConvertAppointmentWaitlistRequestSchema,
  CreateAppointmentWaitlistRequestSchema,
  SuccessResponseSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type AppointmentWaitlistService } from './appointment-waitlist.service.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';
const params = z.object({ publicId: z.uuid() }).strict();
export const appointmentWaitlistRoutes: FastifyPluginAsyncZod<{
  service: AppointmentWaitlistService;
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
    '/tenant/appointment-waitlist',
    {
      schema: {
        querystring: AppointmentWaitlistFilterSchema,
        response: { 200: AppointmentWaitlistListResponseSchema },
      },
    },
    (request) => {
      options.authService.requirePermission(request.tenant, 'appointment.waitlist.read');
      return options.service.list(request.tenant.id, request.query);
    },
  );
  app.get(
    '/tenant/appointment-waitlist/:publicId',
    { schema: { params, response: { 200: AppointmentWaitlistPublicSchema } } },
    (request) => {
      options.authService.requirePermission(request.tenant, 'appointment.waitlist.read');
      return options.service.get(request.tenant.id, request.params.publicId);
    },
  );
  app.post(
    '/tenant/appointment-waitlist',
    {
      schema: {
        body: CreateAppointmentWaitlistRequestSchema,
        response: { 201: AppointmentWaitlistPublicSchema },
      },
    },
    async (request, reply) => {
      options.authService.requirePermission(request.tenant, 'appointment.waitlist.manage');
      return reply
        .status(201)
        .send(await options.service.create(request.tenant.id, request.body, actor(request)));
    },
  );
  app.post(
    '/tenant/appointment-waitlist/:publicId/cancel',
    {
      schema: {
        params,
        body: CancelAppointmentWaitlistRequestSchema,
        response: { 200: AppointmentWaitlistPublicSchema },
      },
    },
    (request) => {
      options.authService.requirePermission(request.tenant, 'appointment.waitlist.manage');
      return options.service.cancel(
        request.tenant.id,
        request.params.publicId,
        request.body.reason,
        actor(request),
      );
    },
  );
  app.post(
    '/tenant/appointment-waitlist/:publicId/convert',
    {
      schema: {
        params,
        body: ConvertAppointmentWaitlistRequestSchema,
        response: { 200: AppointmentPublicSchema },
      },
    },
    (request) => {
      options.authService.requirePermission(request.tenant, 'appointment.waitlist.manage');
      return options.service.convert(
        request.tenant.id,
        request.params.publicId,
        request.body,
        actor(request),
      );
    },
  );
  app.delete(
    '/tenant/appointment-waitlist/:publicId',
    {
      schema: {
        params,
        body: CancelAppointmentWaitlistRequestSchema,
        response: { 200: SuccessResponseSchema },
      },
    },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'appointment.waitlist.manage');
      await options.service.cancel(
        request.tenant.id,
        request.params.publicId,
        request.body.reason,
        actor(request),
      );
      return { success: true } as const;
    },
  );
};
