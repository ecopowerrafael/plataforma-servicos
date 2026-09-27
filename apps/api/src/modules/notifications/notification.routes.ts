import {
  CreateNotificationCampaignRequestSchema,
  NotificationCampaignListResponseSchema,
  NotificationCampaignSummarySchema,
  NotificationListQuerySchema,
  NotificationListResponseSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type NotificationService } from './notification.service.js';
import { type NotificationCampaignService } from './notification-campaign.service.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';

const params = z.object({ publicId: z.uuid() });

export const notificationRoutes: FastifyPluginAsyncZod<{
  service: NotificationService;
  campaigns?: NotificationCampaignService;
  authService: AuthService;
  cookieName: string;
  client?: PrismaClient;
}> = async (app, o) => {
  await app.register(tenantContextPlugin, {
    authService: o.authService,
    cookieName: o.cookieName,
    client: o.client,
  });

  app.get(
    '/tenant/notifications',
    {
      schema: {
        querystring: NotificationListQuerySchema,
        response: { 200: NotificationListResponseSchema },
      },
    },
    (r) => {
      o.authService.requirePermission(r.tenant, 'notification.read');
      return o.service.list(r.tenant.id, r.query);
    },
  );

  app.post(
    '/tenant/notifications/:publicId/retry',
    { schema: { params, response: { 200: z.object({ success: z.literal(true) }) } } },
    async (r) => {
      o.authService.requirePermission(r.tenant, 'notification.read');
      await o.service.retry(r.tenant.id, r.params.publicId);
      return { success: true as const };
    },
  );

  if (o.campaigns !== undefined) {
    app.get(
      '/tenant/notification-campaigns',
      { schema: { response: { 200: NotificationCampaignListResponseSchema } } },
      (r) => {
        o.authService.requirePermission(r.tenant, 'notification.read');
        return o.campaigns!.list(r.tenant.id);
      },
    );
    app.post(
      '/tenant/notification-campaigns',
      {
        schema: {
          body: CreateNotificationCampaignRequestSchema,
          response: { 201: NotificationCampaignSummarySchema },
        },
      },
      async (r, reply) => {
        // Não há uma permissão específica de envio no domínio atual;
        // automações já são o recurso de escrita de comunicações do tenant.
        o.authService.requirePermission(r.tenant, 'automation.manage');
        const created = await o.campaigns!.create(r.tenant.id, r.body);
        return reply.code(201).send(created);
      },
    );
  }
};
