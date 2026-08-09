import {
  AppointmentCheckInRequestSchema,
  AppointmentHistoryResponseSchema,
  AppointmentListResponseSchema,
  AppointmentPublicSchema,
  AppointmentQuerySchema,
  AppointmentStatusRequestSchema,
  AppointmentStatusResponseSchema,
  CreateAppointmentRequestSchema,
  UpdateAppointmentRequestSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type AppointmentService } from './appointment.service.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type AuthService } from '../auth/auth.service.js';
import { type AppointmentNotificationService } from '../notifications/appointment-notification.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';
const params = z.object({ publicId: z.uuid() });
export const appointmentRoutes: FastifyPluginAsyncZod<{
  service: AppointmentService;
  authService: AuthService;
  cookieName: string;
  notifications?: AppointmentNotificationService;
  client?: PrismaClient;
}> = async (app, o) => {
  await app.register(tenantContextPlugin, { authService: o.authService, cookieName: o.cookieName, client: o.client });
  const actor = (r: { auth: { user: { id: bigint }; session: { id: bigint } } }) => ({
    userId: r.auth.user.id,
    sessionId: r.auth.session.id,
  });
  app.get(
    '/tenant/appointments',
    {
      schema: {
        querystring: AppointmentQuerySchema,
        response: { 200: AppointmentListResponseSchema },
      },
    },
    (r) => {
      o.authService.requirePermission(r.tenant, 'appointment.read');
      return o.service.list(r.tenant.id, r.query);
    },
  );
  app.get(
    '/tenant/appointments/:publicId',
    { schema: { params, response: { 200: AppointmentPublicSchema } } },
    (r) => {
      o.authService.requirePermission(r.tenant, 'appointment.read');
      return o.service.get(r.tenant.id, r.params.publicId);
    },
  );
  app.get(
    '/tenant/appointments/:publicId/history',
    { schema: { params, response: { 200: AppointmentHistoryResponseSchema } } },
    (r) => {
      o.authService.requirePermission(r.tenant, 'appointment.read');
      return o.service.history(r.tenant.id, r.params.publicId);
    },
  );
  app.post(
    '/tenant/appointments',
    {
      schema: { body: CreateAppointmentRequestSchema, response: { 201: AppointmentPublicSchema } },
    },
    async (r, reply) => {
      o.authService.requirePermission(r.tenant, 'appointment.create');
      if (r.body.isFitIn) o.authService.requirePermission(r.tenant, 'appointment.fit_in.manage');
      const created = await o.service.create(r.tenant.id, r.body, actor(r));
      if (o.notifications !== undefined)
        await o.notifications.notifyBookingConfirmed(r.tenant.id, created);
      return reply.status(201).send(created);
    },
  );
  app.patch(
    '/tenant/appointments/:publicId',
    {
      schema: {
        params,
        body: UpdateAppointmentRequestSchema,
        response: { 200: AppointmentPublicSchema },
      },
    },
    (r) => {
      o.authService.requirePermission(r.tenant, 'appointment.update');
      if (r.body.isFitIn) o.authService.requirePermission(r.tenant, 'appointment.fit_in.manage');
      return o.service.update(r.tenant.id, r.params.publicId, r.body, actor(r));
    },
  );
  for (const status of ['CONFIRMED', 'IN_PROGRESS', 'CANCELED', 'COMPLETED', 'NO_SHOW'] as const)
    app.post(
      `/tenant/appointments/:publicId/${status.toLowerCase()}`,
      {
        schema: {
          params,
          body: AppointmentStatusRequestSchema,
          response: { 200: AppointmentStatusResponseSchema },
        },
      },
      async (r) => {
        o.authService.requirePermission(r.tenant, 'appointment.status.manage');
        const result = await o.service.status(
          r.tenant.id,
          r.params.publicId,
          status,
          r.body.reason,
          actor(r),
        );
        if (status === 'CANCELED' && o.notifications !== undefined) {
          const appointment = await o.service.get(r.tenant.id, r.params.publicId);
          await o.notifications.notifyBookingCanceled(r.tenant.id, appointment);
        }
        return result;
      },
    );
  app.post(
    '/tenant/appointments/:publicId/checkin',
    {
      schema: {
        params,
        body: AppointmentCheckInRequestSchema,
        response: { 200: AppointmentPublicSchema },
      },
    },
    (r) => {
      o.authService.requirePermission(r.tenant, 'appointment.checkin.manage');
      return o.service.checkIn(r.tenant.id, r.params.publicId, r.body.checkedInAt, actor(r));
    },
  );
};
