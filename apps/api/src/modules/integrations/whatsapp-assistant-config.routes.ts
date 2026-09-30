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
import { IntelligenceRuleRepository } from './intelligence-rule.repository.js';
import { chooseBestMatch } from './intelligence-rule-matcher.js';
import { EntityResolver } from './intelligence-entity-resolver.js';
import { interpretText } from './whatsapp-text-interpreter.js';

export const whatsappAssistantConfigRoutes: FastifyPluginAsyncZod<{
  authService: AuthService;
  cookieName: string;
  client: PrismaClient;
}> = async (app, o) => {
  await app.register(tenantContextPlugin, { authService: o.authService, cookieName: o.cookieName, client: o.client });

  const client = o.client;
  const assertWhatsApp = (tenantId: bigint) => new PlanEntitlementService().assertFeatureEnabledForTenant(client, tenantId, 'whatsapp.enabled');
  const intelligenceRepository = new IntelligenceRuleRepository(client);
  const safePattern = (item: { publicId: string; intent: string; pattern: string; enabled: boolean }) => ({
    publicId: item.publicId,
    intent: item.intent,
    pattern: item.pattern,
    enabled: item.enabled,
  });

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
    const [patterns, rules] = await Promise.all([intelligenceRepository.listTenantPatterns(r.tenant.id), intelligenceRepository.findActiveForMatching()]);
    return {
      services,
      combos,
      professionals,
      aliases: aliases.map((item) => ({ publicId: item.publicId, entityType: item.entityType, entityPublicId: item.entityPublicId, alias: item.alias })),
      patterns: patterns.map(safePattern),
      rules: rules.map((rule) => ({ publicId: rule.publicId, name: rule.name, intent: rule.intent, patterns: rule.patterns.map((item) => ({ publicId: item.publicId, pattern: item.pattern })) })),
    };
  });

  app.post('/tenant/integrations/whatsapp/assistant-config/intelligence/patterns', { schema: { body: z.object({ intent: z.enum(['BOOKING', 'AVAILABILITY', 'PRICE_QUERY', 'PAYMENT_METHODS', 'PAYMENT', 'CANCEL', 'RESCHEDULE', 'BOOKING_QUERY']), pattern: z.string().trim().min(1).max(500) }) } }, async (r, reply) => {
    o.authService.requirePermission(r.tenant, 'integration.manage'); await assertWhatsApp(r.tenant.id);
    const created = await intelligenceRepository.createTenantPattern({ tenantId: r.tenant.id, intent: r.body.intent, pattern: r.body.pattern });
    return reply.code(201).send(safePattern(created));
  });
  app.patch('/tenant/integrations/whatsapp/assistant-config/intelligence/patterns/:publicId', { schema: { params: z.object({ publicId: z.uuid() }), body: z.object({ intent: z.enum(['BOOKING', 'AVAILABILITY', 'PRICE_QUERY', 'PAYMENT_METHODS', 'PAYMENT', 'CANCEL', 'RESCHEDULE', 'BOOKING_QUERY']).optional(), pattern: z.string().trim().min(1).max(500).optional(), enabled: z.boolean().optional() }) } }, async (r) => {
    o.authService.requirePermission(r.tenant, 'integration.manage'); await assertWhatsApp(r.tenant.id); await intelligenceRepository.updateTenantPattern(r.tenant.id, r.params.publicId, r.body); return { success: true as const };
  });
  app.delete('/tenant/integrations/whatsapp/assistant-config/intelligence/patterns/:publicId', { schema: { params: z.object({ publicId: z.uuid() }) } }, async (r) => {
    o.authService.requirePermission(r.tenant, 'integration.manage'); await assertWhatsApp(r.tenant.id); await intelligenceRepository.deleteTenantPattern(r.tenant.id, r.params.publicId); return { success: true as const };
  });
  app.post('/tenant/integrations/whatsapp/assistant-config/intelligence/simulator', { schema: { body: z.object({ text: z.string().trim().min(1).max(2000) }) } }, async (r) => {
    o.authService.requirePermission(r.tenant, 'integration.read'); await assertWhatsApp(r.tenant.id);
    const tenant = await client.tenant.findUniqueOrThrow({ where: { id: r.tenant.id }, select: { publicId: true } });
    const [rules, custom, catalog] = await Promise.all([intelligenceRepository.findActiveForMatching(), intelligenceRepository.listTenantPatterns(r.tenant.id), intelligenceRepository.catalogForTenant(tenant.publicId)]);
    const candidates = [...rules.flatMap((rule) => rule.patterns.map((item) => ({ ruleId: rule.publicId, ruleName: rule.name, intent: rule.intent, priority: rule.priority, baseConfidence: Number(rule.baseConfidence), patternId: item.publicId, pattern: item.pattern }))), ...custom.filter((item) => item.enabled).map((item) => ({ ruleId: `tenant:${item.publicId}`, ruleName: 'Treinamento do estabelecimento', intent: item.intent, priority: 1, baseConfidence: 0.8, patternId: item.publicId, pattern: item.pattern }))];
    const winner = chooseBestMatch(r.body.text, candidates); const resolver = new EntityResolver(); const entities = [...catalog.services.map((item) => ({ publicId: item.publicId, name: item.name, entityType: 'SERVICE' as const })), ...catalog.combos.map((item) => ({ publicId: item.publicId, name: item.name, entityType: 'COMBO' as const })), ...catalog.professionals.map((item) => ({ publicId: item.publicId, name: item.publicName ?? item.name, entityType: 'PROFESSIONAL' as const }))]; const aliases = catalog.aliases.map((alias) => ({ publicId: alias.entityPublicId, name: alias.entityPublicId, entityType: alias.entityType as 'SERVICE' | 'COMBO' | 'PROFESSIONAL', alias: alias.alias })); const resolved = winner?.entities.map((item) => resolver.resolve(item.tag, item.value, entities, aliases)) ?? []; const interpretation = interpretText({ text: r.body.text, catalog: { services: catalog.services, combos: catalog.combos, professionals: catalog.professionals.map((item) => ({ publicId: item.publicId, name: item.publicName ?? item.name })) }, aliases: catalog.aliases.map((alias) => ({ entityType: alias.entityType as 'SERVICE' | 'COMBO' | 'PROFESSIONAL', entityPublicId: alias.entityPublicId, alias: alias.alias })) }); const finalIntent = winner?.intent ?? interpretation.intent; const semanticEntities = Object.entries(interpretation.entities).flatMap(([key, value]) => { if (value === undefined) return []; const tag = key.endsWith('Name') ? key.replace(/Name$/u, '').toUpperCase() : key === 'date' ? 'DATE' : key === 'time' ? 'TIME' : key === 'dayPeriod' ? 'DAY_PERIOD' : key === 'paymentMethod' ? 'PAYMENT_METHOD' : null; if (tag === null) return []; const resolvedEntity = resolved.find((item) => item.tag === tag)?.entity; const catalogEntity = tag === 'SERVICE' ? catalog.services.find((item) => item.name === value) : tag === 'COMBO' ? catalog.combos.find((item) => item.name === value) : tag === 'PROFESSIONAL' ? catalog.professionals.find((item) => (item.publicName ?? item.name) === value) : undefined; return [{ tag, value: String(value), entity: resolvedEntity ?? catalogEntity ?? null }]; }); const outputEntities = semanticEntities.length > 0 ? semanticEntities : resolved.map((item) => ({ tag: item.tag, value: item.value, entity: item.entity ?? null })); const missingFields = finalIntent === 'BOOKING' && interpretation.entities.serviceName === undefined && interpretation.entities.comboName === undefined ? ['SERVICE'] : [];
    return { intent: finalIntent, pattern: winner?.pattern ?? null, source: winner?.ruleId?.startsWith('tenant:') ? 'TENANT_TRAINING' : 'PLATFORM', confidence: Math.max(0, Math.min(1, (winner?.baseConfidence ?? interpretation.confidence) - (missingFields.length > 0 ? 0.2 : 0))), entities: outputEntities, ambiguousEntities: resolved.filter((item) => item.ambiguous).map((item) => item.value), missingFields };
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
    const created = await client.tenantIntelligenceEntityAlias.create({ data: { publicId: randomUUID(), tenantId: r.tenant.id, entityType: r.body.entityType, entityPublicId: r.body.entityPublicId, alias: r.body.alias, normalizedAlias } });
    return reply.code(201).send({ publicId: created.publicId, entityType: created.entityType, entityPublicId: created.entityPublicId, alias: created.alias });
  });

  app.delete('/tenant/integrations/whatsapp/assistant-config/intelligence/aliases/:publicId', { schema: { params: z.object({ publicId: z.uuid() }) } }, async (r) => {
    o.authService.requirePermission(r.tenant, 'integration.manage');
    await assertWhatsApp(r.tenant.id);
    await client.tenantIntelligenceEntityAlias.deleteMany({ where: { publicId: r.params.publicId, tenantId: r.tenant.id } });
    return { success: true as const };
  });
};
