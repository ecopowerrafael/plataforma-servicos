import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { platformAuthenticationPlugin } from './platform-auth.plugin.js';
import { type PlatformService } from './platform.service.js';
import { type AuthService } from '../auth/auth.service.js';
import { EntityResolver } from '../integrations/intelligence-entity-resolver.js';
import { chooseBestMatch } from '../integrations/intelligence-rule-matcher.js';
import { type IntelligenceRuleRepository } from '../integrations/intelligence-rule.repository.js';
import { type IntelligenceRuleService } from '../integrations/intelligence-rule.service.js';

const intent = z.enum(['BOOKING', 'AVAILABILITY', 'PRICE_QUERY', 'PAYMENT_METHODS', 'PAYMENT', 'CANCEL', 'RESCHEDULE', 'BOOKING_QUERY', 'UNKNOWN']);
const ruleInput = z.object({ name: z.string().trim().min(1).max(120), description: z.string().max(1000).optional(), intent, enabled: z.boolean().optional(), priority: z.number().int().min(-32768).max(32767).optional(), baseConfidence: z.number().min(0).max(1), patterns: z.array(z.string().trim().min(1).max(500)).min(1) });
const updateInput = ruleInput.partial();

export const intelligenceRuleRoutes: FastifyPluginAsyncZod<{ service: IntelligenceRuleService; repository: IntelligenceRuleRepository; platformService: PlatformService; authService: AuthService; cookieName: string }> = async (app, options) => {
  await app.register(platformAuthenticationPlugin, { platformService: options.platformService, authService: options.authService, cookieName: options.cookieName });
  const allow = (request: { platformAuth: Parameters<PlatformService['requirePermission']>[0] }) => { options.platformService.requirePermission(request.platformAuth, 'platform.commercial_policy.manage'); };
  app.get('/platform/intelligence/rules', async (request) => { allow(request); return { items: await options.service.list(), tags: options.service.availableTags() }; });
  app.post('/platform/intelligence/rules', { schema: { body: ruleInput } }, async (request, reply) => { allow(request); return reply.status(201).send(await options.service.create(request.body)); });
  app.post('/platform/intelligence/aliases', { schema: { body: z.object({ tenantId: z.coerce.bigint(), entityType: z.enum(['SERVICE', 'COMBO', 'PROFESSIONAL']), entityPublicId: z.uuid(), alias: z.string().trim().min(1).max(160) }) } }, async (request, reply) => { allow(request); return reply.status(201).send(await options.repository.setAlias(request.body)); });
  app.patch('/platform/intelligence/rules/:publicId', { schema: { params: z.object({ publicId: z.uuid() }), body: updateInput } }, async (request) => { allow(request); return options.service.update(request.params.publicId, request.body); });
  app.delete('/platform/intelligence/rules/:publicId', { schema: { params: z.object({ publicId: z.uuid() }) } }, async (request) => { allow(request); await options.service.delete(request.params.publicId); return { success: true }; });
  app.post('/platform/intelligence/simulator', { schema: { body: z.object({ text: z.string().min(1).max(2000), tenantPublicId: z.uuid().optional() }) } }, async (request) => {
    allow(request);
    const rules = await options.repository.findActiveForMatching();
    const matches = rules.flatMap((rule) => rule.patterns.map((pattern) => chooseBestMatch(request.body.text, [{ ruleId: rule.publicId, ruleName: rule.name, intent: rule.intent, priority: rule.priority, baseConfidence: Number(rule.baseConfidence), patternId: pattern.publicId, pattern: pattern.pattern }]))).filter((match): match is NonNullable<typeof match> => match !== null).sort((a, b) => b.score - a.score);
    const winner = matches[0] ?? null;
    const catalog = request.body.tenantPublicId === undefined ? null : await options.repository.catalogForTenant(request.body.tenantPublicId);
    const resolver = new EntityResolver();
    const entityCandidates = catalog === null ? [] : [
      ...catalog.services.map((item) => ({ publicId: item.publicId, name: item.name, entityType: 'SERVICE' as const })),
      ...catalog.combos.map((item) => ({ publicId: item.publicId, name: item.name, entityType: 'COMBO' as const })),
      ...catalog.professionals.map((item) => ({ publicId: item.publicId, name: item.publicName || item.name, entityType: 'PROFESSIONAL' as const })),
    ];
    const resolved = winner?.entities.map((entity) => resolver.resolve(entity.tag, entity.value, entityCandidates, catalog?.aliases.map((alias) => ({ publicId: alias.entityPublicId, name: alias.entityPublicId, entityType: alias.entityType as 'SERVICE' | 'COMBO' | 'PROFESSIONAL', alias: alias.alias, enabled: alias.enabled })) ?? [])) ?? [];
    return { intent: winner?.intent ?? 'UNKNOWN', rule: winner?.ruleName ?? null, pattern: winner?.pattern ?? null, patternsConsidered: matches.map((match) => match.pattern), confidence: winner?.baseConfidence ?? 0, entities: resolved.map((item) => ({ tag: item.tag, value: item.value, entity: item.entity ?? null })), ambiguousEntities: resolved.filter((item) => item.ambiguous).map((item) => item.value), unresolvedEntities: resolved.filter((item) => item.entity === undefined && !item.ambiguous).map((item) => item.value), missingFields: winner === null ? ['INTENT'] : [] };
  });
};
