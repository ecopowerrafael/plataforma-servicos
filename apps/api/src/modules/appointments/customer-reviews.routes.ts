import {
  AppointmentReviewListResponseSchema,
  AppointmentReviewPublicSchema,
  CreateAppointmentReviewRequestSchema,
  UpdateAppointmentReviewRequestSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type AppointmentReviewService } from './appointment-review.service.js';
import { type CustomerAuthService } from '../customers/customer-auth.service.js';

interface Options {
  service: AppointmentReviewService;
  authService: CustomerAuthService;
  cookieName: string;
}

const SlugParamsSchema = z.object({ slug: z.string().trim().min(1).max(63) }).strict();
const AppointmentParamsSchema = z
  .object({ slug: z.string().trim().min(1).max(63), publicId: z.uuid() })
  .strict();

export const customerReviewsRoutes: FastifyPluginAsyncZod<Options> = (app, options) => {
  app.get(
    '/public/sites/:slug/customer/reviews',
    {
      schema: { params: SlugParamsSchema, response: { 200: AppointmentReviewListResponseSchema } },
    },
    async (request) => {
      const session = await options.authService.authenticate(request.cookies[options.cookieName]);
      return options.service.list(session.tenantId, session.customer.id);
    },
  );

  app.post(
    '/public/sites/:slug/customer/appointments/:publicId/review',
    {
      schema: {
        params: AppointmentParamsSchema,
        body: CreateAppointmentReviewRequestSchema,
        response: { 201: AppointmentReviewPublicSchema },
      },
    },
    async (request, reply) => {
      const session = await options.authService.authenticate(request.cookies[options.cookieName]);
      const created = await options.service.create(
        session.tenantId,
        session.customer.id,
        request.params.publicId,
        request.body,
      );
      return reply.status(201).send(created);
    },
  );

  app.patch(
    '/public/sites/:slug/customer/appointments/:publicId/review',
    {
      schema: {
        params: AppointmentParamsSchema,
        body: UpdateAppointmentReviewRequestSchema,
        response: { 200: AppointmentReviewPublicSchema },
      },
    },
    async (request) => {
      const session = await options.authService.authenticate(request.cookies[options.cookieName]);
      return options.service.update(
        session.tenantId,
        session.customer.id,
        request.params.publicId,
        request.body,
      );
    },
  );

  return Promise.resolve();
};
