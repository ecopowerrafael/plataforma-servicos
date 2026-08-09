import {
  AppointmentPublicSchema,
  AppointmentWaitlistListResponseSchema,
  AppointmentWaitlistPublicSchema,
  CancelAppointmentWaitlistRequestSchema,
  CreateAppointmentWaitlistRequestSchema,
  MatchAppointmentWaitlistRequestSchema,
  SuccessResponseSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type AppointmentWaitlistService } from './appointment-waitlist.service.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';

const params = z.object({ publicId: z.uuid() }).strict();

export const appointmentWaitlistRoutes: FastifyPluginAsyncZod<{
  service: AppointmentWaitlistService;
  authService: AuthService;
  cookieName: string;
}> = async (app, options) => {
  await app.register(tenantContextPlugin, {
    authService: options.authService,
    cookieName: options.cookieName,
  });

  app.get(
    '/tenant/appointment-waitlist',
    {
      schema: {
        querystring: z.object({ status: z.string().optional(), customerPublicId: z.uuid().optional() }).strict(),
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
      const created = await options.service.create(request.tenant.id, request.body);
      return reply.status(201).send(created);
    },
  );

  app.post(
    '/tenant/appointment-waitlist/:publicId/match',
    {
      schema: {
        params,
        body: MatchAppointmentWaitlistRequestSchema,
        response: { 200: AppointmentWaitlistPublicSchema },
      },
    },
    (request) => {
      options.authService.requirePermission(request.tenant, 'appointment.waitlist.manage');
      return options.service.recordOpportunity(request.tenant.id, request.params.publicId, request.body);
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
      return options.service.cancel(request.tenant.id, request.params.publicId, request.body.reason);
    },
  );

  app.post(
    '/tenant/appointment-waitlist/:publicId/convert',
    {
      schema: {
        params,
        body: z.object({
          customerPublicId: z.uuid(),
          professionalPublicId: z.uuid(),
          servicePublicId: z.uuid(),
          unitPublicId: z.uuid().nullable().optional(),
          startsAt: z.iso.datetime({ offset: true }),
          notes: z.string().trim().max(2000).nullable().optional(),
        }).strict(),
        response: { 200: AppointmentPublicSchema },
      },
    },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'appointment.waitlist.manage');
      return options.service.convertToAppointment(
        request.tenant.id,
        request.params.publicId,
        request.body,
      );
    },
  );

  app.delete(
    '/tenant/appointment-waitlist/:publicId',
    { schema: { params, response: { 200: SuccessResponseSchema } } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'appointment.waitlist.manage');
      await options.service.cancel(request.tenant.id, request.params.publicId);
      return { success: true };
    },
  );
};
