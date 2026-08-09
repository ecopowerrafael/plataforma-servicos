import {
  AppointmentListResponseSchema,
  AppointmentPublicSchema,
  AppointmentStatusRequestSchema,
  AppointmentStatusResponseSchema,
  CustomerRescheduleAppointmentRequestSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type AppointmentService } from './appointment.service.js';
import { type CustomerAuthService } from '../customers/customer-auth.service.js';

interface Options {
  service: AppointmentService;
  authService: CustomerAuthService;
  cookieName: string;
}

const SlugParamsSchema = z.object({ slug: z.string().trim().min(1).max(63) }).strict();
const AppointmentParamsSchema = z
  .object({ slug: z.string().trim().min(1).max(63), publicId: z.uuid() })
  .strict();

export const customerAppointmentsRoutes: FastifyPluginAsyncZod<Options> = (app, options) => {
  app.get(
    '/public/sites/:slug/customer/appointments/upcoming',
    { schema: { params: SlugParamsSchema, response: { 200: AppointmentListResponseSchema } } },
    async (request) => {
      const session = await options.authService.authenticate(request.cookies[options.cookieName]);
      return options.service.listUpcomingForCustomer(session.tenantId, session.customer.id);
    },
  );

  app.get(
    '/public/sites/:slug/customer/appointments/history',
    { schema: { params: SlugParamsSchema, response: { 200: AppointmentListResponseSchema } } },
    async (request) => {
      const session = await options.authService.authenticate(request.cookies[options.cookieName]);
      return options.service.listHistoryForCustomer(session.tenantId, session.customer.id);
    },
  );

  app.post(
    '/public/sites/:slug/customer/appointments/:publicId/cancel',
    {
      schema: {
        params: AppointmentParamsSchema,
        body: AppointmentStatusRequestSchema,
        response: { 200: AppointmentStatusResponseSchema },
      },
    },
    async (request) => {
      const session = await options.authService.authenticate(request.cookies[options.cookieName]);
      return options.service.cancelForCustomer(
        session.tenantId,
        session.customer.id,
        request.params.publicId,
        request.body.reason,
      );
    },
  );

  app.patch(
    '/public/sites/:slug/customer/appointments/:publicId/reschedule',
    {
      schema: {
        params: AppointmentParamsSchema,
        body: CustomerRescheduleAppointmentRequestSchema,
        response: { 200: AppointmentPublicSchema },
      },
    },
    async (request) => {
      const session = await options.authService.authenticate(request.cookies[options.cookieName]);
      return options.service.rescheduleForCustomer(
        session.tenantId,
        session.customer.id,
        request.params.publicId,
        request.body.startsAt,
        request.body.reason,
      );
    },
  );

  return Promise.resolve();
};
