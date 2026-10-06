import { CustomerMembershipAccountResponseSchema } from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type CustomerAuthService } from './customer-auth.service.js';
import { CustomerMembershipAccountService } from './customer-membership-account.service.js';
import { type PrismaClient } from '../../database-client/client.js';

interface Options {
  authService: CustomerAuthService;
  cookieName: string;
  client: PrismaClient;
}

const SlugParamsSchema = z.object({ slug: z.string().trim().min(1).max(63) }).strict();

export const customerMembershipAccountRoutes: FastifyPluginAsyncZod<Options> = (app, options) => {
  const service = new CustomerMembershipAccountService(options.client);

  app.get(
    '/public/sites/:slug/customer/membership',
    {
      schema: {
        params: SlugParamsSchema,
        response: { 200: CustomerMembershipAccountResponseSchema },
      },
    },
    async (request) => {
      const session = await options.authService.authenticateForTenantSlug(
        request.cookies[options.cookieName],
        request.params.slug,
      );
      return service.getForCustomer(session.tenantId, session.customer.id);
    },
  );

  return Promise.resolve();
};
