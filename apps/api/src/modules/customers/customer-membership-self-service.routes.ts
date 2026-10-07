import {
  CreateCustomerMembershipRequestSchema,
  CustomerMembershipAvailablePlanListResponseSchema,
  CustomerMembershipActionResponseSchema,
  CustomerMembershipPublicSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type PrismaClient } from '../../database-client/client.js';
import { type CustomerAuthService } from './customer-auth.service.js';
import { CustomerMembershipSelfService } from './customer-membership-self-service.service.js';

interface Options {
  authService: CustomerAuthService;
  cookieName: string;
  client: PrismaClient;
}

const SlugParamsSchema = z.object({ slug: z.string().trim().min(1).max(63) }).strict();
const EmptyBodySchema = z.object({}).strict();

export const customerMembershipSelfServiceRoutes: FastifyPluginAsyncZod<Options> = (
  app,
  options,
) => {
  const service = new CustomerMembershipSelfService(options.client);

  const authenticate = (rawToken: string | undefined, slug: string) =>
    options.authService.authenticateForTenantSlug(rawToken, slug);

  app.get(
    '/public/sites/:slug/customer/membership/plans',
    {
      schema: {
        params: SlugParamsSchema,
        response: { 200: CustomerMembershipAvailablePlanListResponseSchema },
      },
    },
    async (request) => {
      const session = await authenticate(request.cookies[options.cookieName], request.params.slug);
      return service.listAvailablePlans(session.tenantId);
    },
  );

  app.post(
    '/public/sites/:slug/customer/membership',
    {
      schema: {
        params: SlugParamsSchema,
        body: CreateCustomerMembershipRequestSchema,
        response: { 201: CustomerMembershipPublicSchema },
      },
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const session = await authenticate(request.cookies[options.cookieName], request.params.slug);
      const membership = await service.create(
        session.tenantId,
        session.customer.publicId,
        request.body.planPublicId,
        session.id,
      );
      return reply.code(201).send(membership);
    },
  );

  app.post(
    '/public/sites/:slug/customer/membership/cancel',
    {
      schema: {
        params: SlugParamsSchema,
        body: EmptyBodySchema,
        response: { 200: CustomerMembershipActionResponseSchema },
      },
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (request) => {
      const session = await authenticate(request.cookies[options.cookieName], request.params.slug);
      return service.cancel(session.tenantId, session.customer.id, session.id);
    },
  );

  app.post(
    '/public/sites/:slug/customer/membership/cancel-at-period-end',
    {
      schema: {
        params: SlugParamsSchema,
        body: EmptyBodySchema,
        response: { 200: CustomerMembershipActionResponseSchema },
      },
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (request) => {
      const session = await authenticate(request.cookies[options.cookieName], request.params.slug);
      return service.scheduleCancelAtPeriodEnd(session.tenantId, session.customer.id, session.id);
    },
  );

  app.delete(
    '/public/sites/:slug/customer/membership/cancel-at-period-end',
    {
      schema: {
        params: SlugParamsSchema,
        response: { 200: CustomerMembershipActionResponseSchema },
      },
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (request) => {
      const session = await authenticate(request.cookies[options.cookieName], request.params.slug);
      return service.revokeCancelAtPeriodEnd(session.tenantId, session.customer.id, session.id);
    },
  );

  return Promise.resolve();
};
