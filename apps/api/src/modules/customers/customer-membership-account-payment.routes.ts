import { CustomerMembershipPaymentResponseSchema } from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type PrismaClient } from '../../database-client/client.js';
import { type CustomerAuthService } from './customer-auth.service.js';
import { CustomerMembershipAccountPaymentService } from './customer-membership-account-payment.service.js';
import { type PaymentGatewayService } from '../payments/gateway/payment-gateway.service.js';

interface Options {
  authService: CustomerAuthService;
  cookieName: string;
  client: PrismaClient;
  paymentGateway?: PaymentGatewayService;
}

const SlugParamsSchema = z.object({ slug: z.string().trim().min(1).max(63) }).strict();

export const customerMembershipAccountPaymentRoutes: FastifyPluginAsyncZod<Options> = (
  app,
  options,
) => {
  const service = new CustomerMembershipAccountPaymentService(
    options.client,
    options.paymentGateway,
  );

  const authenticate = (rawToken: string | undefined, slug: string) =>
    options.authService.authenticateForTenantSlug(rawToken, slug);

  app.get(
    '/public/sites/:slug/customer/membership/payment',
    {
      schema: {
        params: SlugParamsSchema,
        response: { 200: CustomerMembershipPaymentResponseSchema },
      },
    },
    async (request) => {
      const session = await authenticate(request.cookies[options.cookieName], request.params.slug);
      return service.getForCustomer(session.tenantId, session.customer.id);
    },
  );

  app.post(
    '/public/sites/:slug/customer/membership/payment/gateway',
    {
      schema: {
        params: SlugParamsSchema,
        response: { 200: CustomerMembershipPaymentResponseSchema },
      },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request) => {
      const session = await authenticate(request.cookies[options.cookieName], request.params.slug);
      return service.createOrReuse(session.tenantId, session.customer.id, {
        userId: null,
        sessionId: session.id,
      });
    },
  );

  app.post(
    '/public/sites/:slug/customer/membership/payment/refresh',
    {
      schema: {
        params: SlugParamsSchema,
        response: { 200: CustomerMembershipPaymentResponseSchema },
      },
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request) => {
      const session = await authenticate(request.cookies[options.cookieName], request.params.slug);
      return service.refresh(session.tenantId, session.customer.id);
    },
  );

  return Promise.resolve();
};
