import {
  AutomationListResponseSchema,
  AutomationPublicSchema,
  AutomationTriggerSchema,
  UpdateAutomationRequestSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type AutomationService } from './automation.service.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';
import { type PrismaClient } from '../../database-client/client.js';
export const automationRoutes: FastifyPluginAsyncZod<{
  service: AutomationService;
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
    '/tenant/automations',
    { schema: { response: { 200: AutomationListResponseSchema } } },
    (r) => {
      options.authService.requirePermission(r.tenant, 'automation.read');
      return options.service.list(r.tenant.id);
    },
  );
  app.put(
    '/tenant/automations/:trigger',
    {
      schema: {
        params: z.object({ trigger: AutomationTriggerSchema }).strict(),
        body: UpdateAutomationRequestSchema,
        response: { 200: AutomationPublicSchema },
      },
    },
    (r) => {
      options.authService.requirePermission(r.tenant, 'automation.manage');
      return options.service.update(r.tenant.id, r.params.trigger, r.body, {
        userId: r.auth.user.id,
        sessionId: r.auth.session.id,
      });
    },
  );
};
