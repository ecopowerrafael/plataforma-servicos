import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type AppointmentReminderConfigService } from './appointment-reminder-config.service.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';
import { type PrismaClient } from '../../database-client/client.js';
import { PlanEntitlementService } from '../tenants/plan-entitlement.service.js';

const reminderConfigSchema = z.object({
  dayBeforeEnabled: z.boolean().optional(),
  dayBeforeDaysBefore: z.number().int().min(1).max(365).optional(),
  dayBeforeHour: z.number().int().min(0).max(23).optional(),
  dayBeforeMinute: z.number().int().min(0).max(59).optional(),
  upcomingEnabled: z.boolean().optional(),
  upcomingMinutesBefore: z.number().int().min(1).max(1440).optional(),
});

export const appointmentReminderConfigRoutes: FastifyPluginAsyncZod<{
  service: AppointmentReminderConfigService;
  authService: AuthService;
  cookieName: string;
  client?: PrismaClient;
}> = async (app, o) => {
  await app.register(tenantContextPlugin, { authService: o.authService, cookieName: o.cookieName, client: o.client });
  const assertWhatsApp = (tenantId: bigint) => o.client === undefined ? Promise.resolve() : new PlanEntitlementService().assertFeatureEnabledForTenant(o.client, tenantId, 'whatsapp.enabled');

  app.get(
    '/tenant/integrations/whatsapp/reminder-config',
    {
      schema: {
        response: {
          200: z.object({
            dayBeforeEnabled: z.boolean(),
            dayBeforeDaysBefore: z.number(),
            dayBeforeHour: z.number(),
            dayBeforeMinute: z.number(),
            upcomingEnabled: z.boolean(),
            upcomingMinutesBefore: z.number(),
          }),
        },
      },
    },
    async (r) => {
      o.authService.requirePermission(r.tenant, 'integration.read');
      await assertWhatsApp(r.tenant.id);
      const config = await o.service.getOrCreate(r.tenant.id);
      return {
        dayBeforeEnabled: config.dayBeforeEnabled,
        dayBeforeDaysBefore: config.dayBeforeDaysBefore,
        dayBeforeHour: config.dayBeforeHour,
        dayBeforeMinute: config.dayBeforeMinute,
        upcomingEnabled: config.upcomingEnabled,
        upcomingMinutesBefore: config.upcomingMinutesBefore,
      };
    },
  );

  app.patch(
    '/tenant/integrations/whatsapp/reminder-config',
    {
      schema: {
        body: reminderConfigSchema,
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async (r) => {
      o.authService.requirePermission(r.tenant, 'integration.manage');
      await assertWhatsApp(r.tenant.id);
      const existing = await o.service.getOrCreate(r.tenant.id);
      await o.client?.appointmentReminderConfig.update({
        where: { tenantId: r.tenant.id },
        data: {
          dayBeforeEnabled: r.body.dayBeforeEnabled ?? existing.dayBeforeEnabled,
          dayBeforeDaysBefore: r.body.dayBeforeDaysBefore ?? existing.dayBeforeDaysBefore,
          dayBeforeHour: r.body.dayBeforeHour ?? existing.dayBeforeHour,
          dayBeforeMinute: r.body.dayBeforeMinute ?? existing.dayBeforeMinute,
          upcomingEnabled: r.body.upcomingEnabled ?? existing.upcomingEnabled,
          upcomingMinutesBefore: r.body.upcomingMinutesBefore ?? existing.upcomingMinutesBefore,
        },
      });
      return { success: true as const };
    },
  );
};
