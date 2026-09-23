import {
  AvailabilityQuerySchema,
  AvailabilityResponseSchema,
  AvailableDatesQuerySchema,
  AvailableDatesResponseSchema,
  CreatePublicBookingRequestSchema,
  PublicBookingConfirmationSchema,
  PublicBookingServiceParamsSchema,
  PublicBookingSlugParamsSchema,
  PublicProfessionalServicesParamsSchema,
  PublicProfessionalServicesResponseSchema,
  PublicServiceProfessionalsResponseSchema,
} from '@plataforma/shared';
import { z } from 'zod';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { type PublicBookingService } from './public-booking.service.js';

export const publicBookingRoutes: FastifyPluginAsyncZod<{
  service: PublicBookingService;
}> = (app, options) => {
  app.get(
    '/public/sites/:slug/services/:servicePublicId/professionals',
    {
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      schema: {
        params: PublicBookingServiceParamsSchema,
        response: { 200: PublicServiceProfessionalsResponseSchema },
      },
    },
    (request) =>
      options.service.professionalsForService(request.params.slug, request.params.servicePublicId),
  );
  app.get(
    '/public/sites/:slug/combos/:comboPublicId/professionals',
    {
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      schema: {
        params: z.object({ slug: z.string(), comboPublicId: z.uuid() }).strict(),
        response: { 200: PublicServiceProfessionalsResponseSchema },
      },
    },
    (request) => {
      const params = request.params as { slug: string; comboPublicId: string };
      return options.service.professionalsForCombo(params.slug, params.comboPublicId);
    },
  );
  app.get(
    '/public/sites/:slug/professionals/:professionalPublicId/services',
    {
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      schema: {
        params: PublicProfessionalServicesParamsSchema,
        response: { 200: PublicProfessionalServicesResponseSchema },
      },
    },
    (request) =>
      options.service.servicesForProfessional(
        request.params.slug,
        request.params.professionalPublicId,
      ),
  );
  app.get(
    '/public/sites/:slug/availability',
    {
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      schema: {
        params: PublicBookingSlugParamsSchema,
        querystring: AvailabilityQuerySchema,
        response: { 200: AvailabilityResponseSchema },
      },
    },
    (request) => options.service.availability(request.params.slug, request.query),
  );
  app.get(
    '/public/sites/:slug/available-dates',
    {
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      schema: {
        params: PublicBookingSlugParamsSchema,
        querystring: AvailableDatesQuerySchema,
        response: { 200: AvailableDatesResponseSchema },
      },
    },
    async (request) => options.service.availableDates(request.params.slug, request.query),
  );
  app.post(
    '/public/sites/:slug/bookings',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        params: PublicBookingSlugParamsSchema,
        body: CreatePublicBookingRequestSchema,
        response: { 201: PublicBookingConfirmationSchema },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(await options.service.createBooking(request.params.slug, request.body)),
  );
  return Promise.resolve();
};
