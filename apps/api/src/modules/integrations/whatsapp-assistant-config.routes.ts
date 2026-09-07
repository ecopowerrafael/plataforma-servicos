import { randomUUID } from 'node:crypto';

import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { Prisma } from '../../database-client/client.js';
import {
  WhatsAppAssistantConfigSchema,
  resolveAssistantConfig,
  validatePlaceholders,
} from './whatsapp-assistant-config.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';
import { type PrismaClient } from '../../database-client/client.js';

export const whatsappAssistantConfigRoutes: FastifyPluginAsyncZod<{
  authService: AuthService;
  cookieName: string;
  client: PrismaClient;
}> = async (app, o) => {
  await app.register(tenantContextPlugin, { authService: o.authService, cookieName: o.cookieName, client: o.client });

  const client = o.client;

  app.get(
    '/tenant/integrations/whatsapp/assistant-config',
    {
      schema: {
        response: {
          200: z.object({
            config: WhatsAppAssistantConfigSchema,
            isCustomized: z.boolean(),
          }),
        },
      },
    },
    async (r) => {
      o.authService.requirePermission(r.tenant, 'integration.read');

      const settings = await client.tenantWhatsAppSettings.findUnique({
        where: { tenantId: r.tenant.id },
        select: { assistantConfig: true },
      });
      const legacyConfig = settings === null
        ? await client.tenantWhatsAppConfig.findFirst({
            where: { tenantId: r.tenant.id },
            select: { assistantConfig: true },
            orderBy: { id: 'asc' },
          })
        : null;

      const assistantConfig = settings?.assistantConfig ?? legacyConfig?.assistantConfig;
      const resolved = resolveAssistantConfig(assistantConfig);

      return {
        config: resolved,
        isCustomized: assistantConfig !== null && assistantConfig !== undefined,
      };
    },
  );

  app.patch(
    '/tenant/integrations/whatsapp/assistant-config',
    {
      schema: {
        body: WhatsAppAssistantConfigSchema,
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async (r) => {
      o.authService.requirePermission(r.tenant, 'integration.manage');

      const config = r.body;

      // Validar placeholders
      const newCustomerError = validatePlaceholders(config.greeting.newCustomerBody, false);
      if (newCustomerError) {
        throw new Error(`newCustomerBody: ${newCustomerError}`);
      }

      const returningCustomerError = validatePlaceholders(config.greeting.returningCustomerBody, true);
      if (returningCustomerError) {
        throw new Error(`returningCustomerBody: ${returningCustomerError}`);
      }

      // Garantir pelo menos um botão habilitado
      const hasEnabledButton = config.menu.buttons.some((b) => b.enabled);
      if (!hasEnabledButton) {
        throw new Error('Pelo menos um botão do menu deve estar habilitado');
      }

      const legacy = await client.tenantWhatsAppConfig.findFirst({
        where: { tenantId: r.tenant.id },
        select: { provider: true },
        orderBy: { id: 'asc' },
      });
      await client.tenantWhatsAppSettings.upsert({
        where: { tenantId: r.tenant.id },
        create: { publicId: randomUUID(), tenantId: r.tenant.id, selectedProvider: legacy?.provider ?? 'WAPI', assistantConfig: config },
        update: { assistantConfig: config },
      });

      return { success: true as const };
    },
  );

  app.post(
    '/tenant/integrations/whatsapp/assistant-config/restore',
    {
      schema: {
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async (r) => {
      o.authService.requirePermission(r.tenant, 'integration.manage');

      const legacy = await client.tenantWhatsAppConfig.findFirst({
        where: { tenantId: r.tenant.id },
        select: { provider: true },
        orderBy: { id: 'asc' },
      });
      await client.tenantWhatsAppSettings.upsert({
        where: { tenantId: r.tenant.id },
        create: { publicId: randomUUID(), tenantId: r.tenant.id, selectedProvider: legacy?.provider ?? 'WAPI', assistantConfig: Prisma.DbNull },
        update: { assistantConfig: Prisma.DbNull },
      });

      return { success: true as const };
    },
  );
};
