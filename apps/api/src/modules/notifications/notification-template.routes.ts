import {
  NotificationKindSchema,
  NotificationTemplateListResponseSchema,
  UpdateNotificationTemplateRequestSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type NotificationTemplateService } from './notification-template.service.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';

const params = z.object({ kind: NotificationKindSchema });

export const notificationTemplateRoutes: FastifyPluginAsyncZod<{
  service: NotificationTemplateService;
  authService: AuthService;
  cookieName: string;
  client?: PrismaClient;
}> = async (app, o) => {
  await app.register(tenantContextPlugin, { authService: o.authService, cookieName: o.cookieName, client: o.client });

  app.get(
    '/tenant/notification-templates',
    { schema: { response: { 200: NotificationTemplateListResponseSchema } } },
    (r) => {
      o.authService.requirePermission(r.tenant, 'notification.read');
      return o.service.list(r.tenant.id);
    },
  );

  app.put(
    '/tenant/notification-templates/:kind',
    {
      schema: {
        params,
        body: UpdateNotificationTemplateRequestSchema,
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async (r) => {
      o.authService.requirePermission(r.tenant, 'notification.template.manage');
      await o.service.update(r.tenant.id, r.params.kind, r.body);
      return { success: true as const };
    },
  );

  app.get(
    '/tenant/integrations/whatsapp/messages',
    {
      schema: {
        response: {
          200: z.object({
            items: z.array(
              z.object({
                kind: z.string(),
                enabled: z.boolean(),
                body: z.string().nullable(),
                buttons: z.array(
                  z.object({
                    actionKey: z.string(),
                    label: z.string(),
                    enabled: z.boolean(),
                    order: z.number(),
                  }),
                ),
                allowedActions: z.array(z.string()),
                isCustomized: z.boolean(),
                placeholders: z.array(z.string()),
              }),
            ),
          }),
        },
      },
    },
    async (r) => {
      o.authService.requirePermission(r.tenant, 'integration.read');
      const kinds = ['appointment.booking_confirmed', 'appointment.day_before_reminder', 'appointment.upcoming_reminder', 'appointment.booking_canceled'];
      const items = await Promise.all(
        kinds.map((kind) => o.service.getWhatsAppInfo(r.tenant.id, kind as any)),
      );
      return { items };
    },
  );

  app.patch(
    '/tenant/integrations/whatsapp/messages/:kind',
    {
      schema: {
        params,
        body: z.object({
          enabled: z.boolean().optional(),
          body: z.string().optional(),
          buttons: z.array(z.object({
            actionKey: z.string(),
            label: z.string(),
            enabled: z.boolean(),
            order: z.number(),
          })).optional(),
        }),
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async (r) => {
      o.authService.requirePermission(r.tenant, 'integration.manage');
      const updateData: any = {};
      if (r.body.body !== undefined) updateData.whatsappBody = r.body.body;
      if (r.body.enabled !== undefined) updateData.whatsappEnabled = r.body.enabled;
      if (r.body.buttons !== undefined) updateData.whatsappButtons = r.body.buttons;
      await o.service.update(r.tenant.id, r.params.kind, updateData as any);
      return { success: true as const };
    },
  );

  app.post(
    '/tenant/integrations/whatsapp/messages/:kind/restore',
    {
      schema: {
        params,
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async (r) => {
      o.authService.requirePermission(r.tenant, 'integration.manage');
      await o.client?.notificationTemplate.deleteMany({
        where: { tenantId: r.tenant.id, kind: r.params.kind },
      });
      return { success: true as const };
    },
  );
};
