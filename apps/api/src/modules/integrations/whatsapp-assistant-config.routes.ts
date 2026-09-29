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
import { PlanEntitlementService } from '../tenants/plan-entitlement.service.js';

export const whatsappAssistantConfigRoutes: FastifyPluginAsyncZod<{
  authService: AuthService;
  cookieName: string;
  client: PrismaClient;
}> = async (app, o) => {
  await app.register(tenantContextPlugin, { authService: o.authService, cookieName: o.cookieName, client: o.client });

  const client = o.client;
  const assertWhatsApp = (tenantId: bigint) => new PlanEntitlementService().assertFeatureEnabledForTenant(client, tenantId, 'whatsapp.enabled');

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
      await assertWhatsApp(r.tenant.id);

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
      await assertWhatsApp(r.tenant.id);

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
      await assertWhatsApp(r.tenant.id);

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

  app.get('/tenant/integrations/whatsapp/assistant-config/intelligence', async (r) => {
    o.authService.requirePermission(r.tenant, 'integration.read');
    await assertWhatsApp(r.tenant.id);
    const [services, combos, professionals, aliases] = await Promise.all([
      client.service.findMany({ where: { tenantId: r.tenant.id, active: true }, select: { publicId: true, name: true } }),
      client.combo.findMany({ where: { tenantId: r.tenant.id, active: true }, select: { publicId: true, name: true } }),
      client.professional.findMany({ where: { tenantId: r.tenant.id, active: true }, select: { publicId: true, name: true } }),
      client.tenantIntelligenceEntityAlias.findMany({ where: { tenantId: r.tenant.id, enabled: true }, orderBy: { normalizedAlias: 'asc' } }),
    ]);
    return { services, combos, professionals, aliases };
  });

  app.post('/tenant/integrations/whatsapp/assistant-config/intelligence/aliases', { schema: { body: z.object({ entityType: z.enum(['SERVICE', 'COMBO', 'PROFESSIONAL']), entityPublicId: z.uuid(), alias: z.string().trim().min(1).max(160) }) } }, async (r, reply) => {
    o.authService.requirePermission(r.tenant, 'integration.manage');
    await assertWhatsApp(r.tenant.id);
    const entity = r.body.entityType === 'SERVICE'
      ? await client.service.findFirst({ where: { tenantId: r.tenant.id, publicId: r.body.entityPublicId }, select: { publicId: true } })
      : r.body.entityType === 'COMBO'
        ? await client.combo.findFirst({ where: { tenantId: r.tenant.id, publicId: r.body.entityPublicId }, select: { publicId: true } })
        : await client.professional.findFirst({ where: { tenantId: r.tenant.id, publicId: r.body.entityPublicId }, select: { publicId: true } });
    if (entity === null) return reply.code(404).send({ message: 'Entidade não encontrada neste tenant.' });
    const normalizedAlias = r.body.alias.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLowerCase().replace(/\s+/gu, ' ').trim();
    return reply.code(201).send(await client.tenantIntelligenceEntityAlias.create({ data: { publicId: randomUUID(), tenantId: r.tenant.id, entityType: r.body.entityType, entityPublicId: r.body.entityPublicId, alias: r.body.alias, normalizedAlias } }));
  });

  app.delete('/tenant/integrations/whatsapp/assistant-config/intelligence/aliases/:publicId', { schema: { params: z.object({ publicId: z.uuid() }) } }, async (r) => {
    o.authService.requirePermission(r.tenant, 'integration.manage');
    await assertWhatsApp(r.tenant.id);
    await client.tenantIntelligenceEntityAlias.deleteMany({ where: { publicId: r.params.publicId, tenantId: r.tenant.id } });
    return { success: true as const };
  });
};
