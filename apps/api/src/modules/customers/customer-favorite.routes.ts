import {
  CreateCustomerFavoriteRequestSchema,
  CustomerFavoriteListResponseSchema,
  CustomerFavoritePublicSchema,
  SuccessResponseSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type CustomerAuthService } from './customer-auth.service.js';
import { type CustomerFavoriteService } from './customer-favorite.service.js';

interface Options {
  service: CustomerFavoriteService;
  authService: CustomerAuthService;
  cookieName: string;
}

const SlugParamsSchema = z.object({ slug: z.string().trim().min(1).max(63) }).strict();
const FavoriteParamsSchema = z
  .object({ slug: z.string().trim().min(1).max(63), publicId: z.uuid() })
  .strict();

export const customerFavoriteRoutes: FastifyPluginAsyncZod<Options> = (app, options) => {
  app.get(
    '/public/sites/:slug/customer/favorites',
    { schema: { params: SlugParamsSchema, response: { 200: CustomerFavoriteListResponseSchema } } },
    async (request) => {
      const session = await options.authService.authenticate(request.cookies[options.cookieName]);
      return options.service.list(session.tenantId, session.customer.id);
    },
  );

  app.post(
    '/public/sites/:slug/customer/favorites',
    {
      schema: {
        params: SlugParamsSchema,
        body: CreateCustomerFavoriteRequestSchema,
        response: { 201: CustomerFavoritePublicSchema },
      },
    },
    async (request, reply) => {
      const session = await options.authService.authenticate(request.cookies[options.cookieName]);
      const created = await options.service.create(
        session.tenantId,
        session.customer.id,
        request.body,
      );
      return reply.status(201).send(created);
    },
  );

  app.delete(
    '/public/sites/:slug/customer/favorites/:publicId',
    { schema: { params: FavoriteParamsSchema, response: { 200: SuccessResponseSchema } } },
    async (request) => {
      const session = await options.authService.authenticate(request.cookies[options.cookieName]);
      return options.service.remove(session.tenantId, session.customer.id, request.params.publicId);
    },
  );

  return Promise.resolve();
};
