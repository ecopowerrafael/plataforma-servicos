import {
  ExternalIntegrationListSchema,
  ExternalIntegrationSchema,
  SuccessResponseSchema,
  UpsertExternalIntegrationSchema,
  UpsertWhatsAppConfigSchema,
  WhatsAppConfigSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type IntegrationService } from './integration.service.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';

const params = z.object({ publicId: z.uuid() }).strict();
const actor = (request: { auth: { user: { id: bigint }; session: { id: bigint } } }) => ({
  userId: request.auth.user.id,
  sessionId: request.auth.session.id,
});
export const integrationRoutes: FastifyPluginAsyncZod<{
  service: IntegrationService;
  authService: AuthService;
  cookieName: string;
  client?: PrismaClient;
}> = async (app, options) => {
  await app.register(tenantContextPlugin, {
    authService: options.authService,
    cookieName: options.cookieName,
    client: options.client,
  });
  app.get(
    '/tenant/integrations/whatsapp',
    { schema: { response: { 200: WhatsAppConfigSchema } } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'integration.read');
      return options.service.whatsapp(request.tenant.id);
    },
  );
  app.put(
    '/tenant/integrations/whatsapp',
    { schema: { body: UpsertWhatsAppConfigSchema, response: { 200: WhatsAppConfigSchema } } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'integration.manage');
      return options.service.updateWhatsapp(request.tenant.id, request.body, actor(request));
    },
  );
  app.get(
    '/tenant/integrations/external',
    { schema: { response: { 200: ExternalIntegrationListSchema } } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'integration.read');
      return options.service.list(request.tenant.id);
    },
  );
  app.post(
    '/tenant/integrations/external',
    {
      schema: {
        body: UpsertExternalIntegrationSchema,
        response: { 201: ExternalIntegrationSchema },
      },
    },
    async (request, reply) => {
      options.authService.requirePermission(request.tenant, 'integration.manage');
      return reply
        .status(201)
        .send(await options.service.save(request.tenant.id, null, request.body, actor(request)));
    },
  );
  app.put(
    '/tenant/integrations/external/:publicId',
    {
      schema: {
        params,
        body: UpsertExternalIntegrationSchema,
        response: { 200: ExternalIntegrationSchema },
      },
    },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'integration.manage');
      return options.service.save(
        request.tenant.id,
        request.params.publicId,
        request.body,
        actor(request),
      );
    },
  );
  app.delete(
    '/tenant/integrations/external/:publicId',
    { schema: { params, response: { 200: SuccessResponseSchema } } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'integration.manage');
      await options.service.remove(request.tenant.id, request.params.publicId, actor(request));
      return { success: true } as const;
    },
  );
};
