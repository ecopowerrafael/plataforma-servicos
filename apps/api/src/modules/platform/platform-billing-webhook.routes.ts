import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type PlatformBillingService } from './platform-billing.service.js';

export const platformBillingWebhookRoutes: FastifyPluginAsyncZod<{ service: PlatformBillingService }> = async (app, options) => {
  await Promise.resolve();
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => { done(null, body); });
  app.post('/public/platform-billing/webhooks/:provider', { schema: { params: z.object({ provider: z.literal('mercadopago') }) } }, async (request, reply) => {
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(request.headers)) {
      if (typeof value === 'string') headers[key] = value;
      else if (Array.isArray(value)) headers[key] = value.join(', ');
    }
    const raw = typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {});
    return reply.status(200).send(await options.service.webhook(request.params.provider, raw, headers));
  });
};
