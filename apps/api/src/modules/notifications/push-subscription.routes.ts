import {
  PushSubscriptionListResponseSchema,
  SubscribePushRequestSchema,
  SuccessResponseSchema,
  UnsubscribePushRequestSchema,
  VapidPublicKeyResponseSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type PushSubscriptionService } from './push-subscription.service.js';
import { type CustomerAuthService } from '../customers/customer-auth.service.js';

const SlugParamsSchema = z.object({ slug: z.string().trim().min(1).max(63) }).strict();

interface Options {
  service: PushSubscriptionService;
  authService: CustomerAuthService;
  cookieName: string;
  vapidPublicKey: string | null;
}

export const pushSubscriptionRoutes: FastifyPluginAsyncZod<Options> = (app, options) => {
  app.get(
    '/public/push/vapid-public-key',
    { schema: { response: { 200: VapidPublicKeyResponseSchema } } },
    () => ({ publicKey: options.vapidPublicKey }),
  );

  app.post(
    '/public/sites/:slug/customer/push/subscribe',
    {
      schema: {
        params: SlugParamsSchema,
        body: SubscribePushRequestSchema,
        response: { 200: z.object({ publicId: z.uuid() }) },
      },
    },
    async (request) => {
      const session = await options.authService.authenticate(request.cookies[options.cookieName]);
      return options.service.subscribe(session.tenantId, session.customer.id, request.body);
    },
  );

  app.post(
    '/public/sites/:slug/customer/push/unsubscribe',
    {
      schema: {
        params: SlugParamsSchema,
        body: UnsubscribePushRequestSchema,
        response: { 200: SuccessResponseSchema },
      },
    },
    async (request) => {
      const session = await options.authService.authenticate(request.cookies[options.cookieName]);
      return options.service.unsubscribe(
        session.tenantId,
        session.customer.id,
        request.body.endpoint,
      );
    },
  );

  app.get(
    '/public/sites/:slug/customer/push/subscriptions',
    {
      schema: {
        params: SlugParamsSchema,
        response: { 200: PushSubscriptionListResponseSchema },
      },
    },
    async (request) => {
      const session = await options.authService.authenticate(request.cookies[options.cookieName]);
      return options.service.list(session.tenantId, session.customer.id);
    },
  );

  return Promise.resolve();
};
