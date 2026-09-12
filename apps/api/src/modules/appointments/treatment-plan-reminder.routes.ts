import {
  TreatmentPlanReminderConfigSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type TreatmentPlanReminderService } from './treatment-plan-reminder.service.js';
import { type TreatmentPlanReminderRepository } from './treatment-plan-reminder.repository.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';

interface Options {
  service: TreatmentPlanReminderService;
  repository: TreatmentPlanReminderRepository;
  authService: AuthService;
  cookieName: string;
  client?: PrismaClient;
}

const PublicIdParamsSchema = z.object({ publicId: z.uuid() }).strict();
const TenantIdParamsSchema = z.object({ tenantPublicId: z.uuid() }).strict();

export const treatmentPlanReminderRoutes: FastifyPluginAsyncZod<Options> = async (
  app,
  options,
) => {
  await app.register(tenantContextPlugin, {
    authService: options.authService,
    cookieName: options.cookieName,
    client: options.client,
  });

  // GET /platform/tenants/:tenantPublicId/reminder-config
  app.get(
    '/platform/tenants/:tenantPublicId/reminder-config',
    { schema: { params: TenantIdParamsSchema } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'appointment.read');

      const config = await options.repository.getConfig(request.tenant.id);

      return {
        enabled: config?.enabled ?? true,
        channel: config?.channel ?? 'WHATSAPP',
        sequence: config?.sequence ?? [],
      };
    },
  );

  // PATCH /platform/tenants/:tenantPublicId/reminder-config
  app.patch(
    '/platform/tenants/:tenantPublicId/reminder-config',
    { schema: { params: TenantIdParamsSchema, body: TreatmentPlanReminderConfigSchema } },
    async (request: any) => {
      options.authService.requirePermission(request.tenant, 'appointment.read');

      const updated = await options.repository.updateConfig(request.tenant.id, {
        enabled: request.body.enabled,
        channel: request.body.channel,
        sequence: JSON.parse(JSON.stringify(request.body.sequence)),
      });

      return {
        enabled: updated.enabled,
        channel: updated.channel,
        sequence: updated.sequence,
      };
    },
  );

  // GET /tenant/treatment-plans/:publicId/reminder
  app.get(
    '/tenant/treatment-plans/:publicId/reminder',
    { schema: { params: PublicIdParamsSchema } },
    async (request) => {
      const state = await options.repository.getByTreatmentPlanId(
        // Fetch the treatment plan ID from publicId
        (await options.client?.treatmentPlan.findUnique({
          where: { publicId: request.params.publicId },
          select: { id: true },
        }))?.id ?? 0n,
      );

      if (state === null) {
        return {
          state: null,
          history: [],
        };
      }

      const history = await options.repository.getReminderLogs(state.id, 20);

      return {
        state: {
          nextReminderAt: state.nextReminderAt?.toISOString() ?? null,
          lastReminderAt: state.lastReminderAt?.toISOString() ?? null,
          remindersSent: state.remindersSent,
          status: state.status,
          channel: state.channel,
          currentStepIndex: state.currentStepIndex,
        },
        history: history.map((log: any) => ({
          stepIndex: log.stepIndex,
          channel: log.channel,
          sentAt: log.sentAt.toISOString(),
          messageTemplate: log.messageTemplate,
          sentMessage: log.sentMessage,
          status: log.status,
          errorMessage: log.errorMessage,
        })),
      };
    },
  );

  // POST /tenant/treatment-plans/:publicId/reminder/send-now
  app.post(
    '/tenant/treatment-plans/:publicId/reminder/send-now',
    { schema: { params: PublicIdParamsSchema } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'appointment.read');

      const planId = await options.client?.treatmentPlan.findUnique({
        where: { publicId: request.params.publicId },
        select: { id: true },
      });

      if (!planId) {
        return { success: false, message: 'Orçamento não encontrado' };
      }

      try {
        await options.service.sendManualReminder(planId.id);
        return { success: true, message: 'Lembrete enviado com sucesso' };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao enviar lembrete';
        return { success: false, message };
      }
    },
  );

  // POST /tenant/treatment-plans/:publicId/reminder/pause
  app.post(
    '/tenant/treatment-plans/:publicId/reminder/pause',
    { schema: { params: PublicIdParamsSchema } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'appointment.read');

      const planId = await options.client?.treatmentPlan.findUnique({
        where: { publicId: request.params.publicId },
        select: { id: true },
      });

      if (!planId) {
        return { success: false, message: 'Orçamento não encontrado' };
      }

      await options.service.pauseReminder(planId.id);
      return { success: true, message: 'Lembretes pausados' };
    },
  );

  // POST /tenant/treatment-plans/:publicId/reminder/resume
  app.post(
    '/tenant/treatment-plans/:publicId/reminder/resume',
    { schema: { params: PublicIdParamsSchema } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'appointment.read');

      const planId = await options.client?.treatmentPlan.findUnique({
        where: { publicId: request.params.publicId },
        select: { id: true },
      });

      if (!planId) {
        return { success: false, message: 'Orçamento não encontrado' };
      }

      await options.service.resumeReminder(planId.id);
      return { success: true, message: 'Lembretes retomados' };
    },
  );
};
