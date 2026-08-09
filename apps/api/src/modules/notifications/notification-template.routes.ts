import {
  NotificationKindSchema,
  NotificationTemplateListResponseSchema,
  UpdateNotificationTemplateRequestSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type NotificationTemplateService } from './notification-template.service.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';
import { type PrismaClient } from '../../database-client/client.js';

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
};
