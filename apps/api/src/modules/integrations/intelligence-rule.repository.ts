import { randomUUID } from 'node:crypto';

import { normalizePattern } from './intelligence-rules.js';
import { type PrismaClient } from '../../database-client/client.js';

const DEFAULT_RULES = [
  { id: '9c5b9a2e-0e6a-4f70-8f4c-100000000001', name: 'Agendamento básico', intent: 'BOOKING', patterns: ['quero {SERVICE}', 'quero agendar {SERVICE}', 'quero marcar {SERVICE}', 'quero {SERVICE} com {PROFESSIONAL}', 'quero {SERVICE} {DATE}', 'quero {SERVICE} com {PROFESSIONAL} {DATE}', 'quero {SERVICE} {DATE} às {TIME}'] },
  { id: '9c5b9a2e-0e6a-4f70-8f4c-100000000002', name: 'Disponibilidade', intent: 'AVAILABILITY', patterns: ['tem horário {DATE}', 'tem vaga {DATE}', 'tem {SERVICE} {DATE}', 'tem horário com {PROFESSIONAL} {DATE}', 'tem {SERVICE} {DATE} {DAY_PERIOD}'] },
  { id: '9c5b9a2e-0e6a-4f70-8f4c-100000000003', name: 'Consulta de preço', intent: 'PRICE_QUERY', patterns: ['quanto custa {SERVICE}', 'qual valor do {SERVICE}', 'preço do {SERVICE}', 'quanto é {SERVICE}'] },
  { id: '9c5b9a2e-0e6a-4f70-8f4c-100000000004', name: 'Formas de pagamento', intent: 'PAYMENT_METHODS', patterns: ['aceita {PAYMENT_METHOD}', 'posso pagar com {PAYMENT_METHOD}', 'como posso pagar'] },
] as const;

export class IntelligenceRuleRepository {
  public constructor(private readonly client: PrismaClient) {}

  public list() {
    return this.client.intelligenceRule.findMany({
      where: { deletedAt: null },
      include: { patterns: { orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
    });
  }

  public findActiveForMatching() {
    return this.client.intelligenceRule.findMany({
      where: { enabled: true, deletedAt: null },
      include: { patterns: { orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
    });
  }

  public async create(input: { name: string; description?: string | undefined; intent: string; enabled?: boolean | undefined; priority?: number | undefined; baseConfidence: number; patterns: string[] }) {
    return this.client.intelligenceRule.create({
      data: {
        publicId: randomUUID(), name: input.name.trim(), description: input.description?.trim() ?? null,
        intent: input.intent as never, enabled: input.enabled ?? true, priority: input.priority ?? 0, baseConfidence: input.baseConfidence,
        patterns: { create: input.patterns.map((pattern, index) => ({ publicId: randomUUID(), pattern, normalizedPattern: normalizePattern(pattern), sortOrder: index })) },
      }, include: { patterns: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  public async update(publicId: string, input: { name?: string | undefined; description?: string | null | undefined; intent?: string | undefined; enabled?: boolean | undefined; priority?: number | undefined; baseConfidence?: number | undefined; patterns?: string[] | undefined }) {
    return this.client.$transaction(async (tx) => {
      if (input.patterns !== undefined) await tx.intelligenceRulePattern.deleteMany({ where: { rule: { publicId } } });
      return tx.intelligenceRule.update({ where: { publicId }, data: {
        ...(input.name === undefined ? {} : { name: input.name.trim() }), ...(input.description === undefined ? {} : { description: input.description?.trim() ?? null }),
        ...(input.intent === undefined ? {} : { intent: input.intent as never }), ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
        ...(input.priority === undefined ? {} : { priority: input.priority }), ...(input.baseConfidence === undefined ? {} : { baseConfidence: input.baseConfidence }),
        ...(input.patterns === undefined ? {} : { patterns: { create: input.patterns.map((pattern, index) => ({ publicId: randomUUID(), pattern, normalizedPattern: normalizePattern(pattern), sortOrder: index })) } }),
      }, include: { patterns: { orderBy: { sortOrder: 'asc' } } }});
    });
  }

  public softDelete(publicId: string) {
    return this.client.intelligenceRule.update({ where: { publicId }, data: { deletedAt: new Date(), enabled: false } });
  }

  public setAlias(input: { tenantId: bigint; entityType: string; entityPublicId: string; alias: string }) {
    const normalizedAlias = normalizePattern(input.alias).replace(/\{[A-Z_]+\}/gu, '').trim();
    return this.client.tenantIntelligenceEntityAlias.create({ data: { publicId: randomUUID(), ...input, normalizedAlias } });
  }

  public listAliases(tenantId: bigint) {
    return this.client.tenantIntelligenceEntityAlias.findMany({ where: { tenantId, enabled: true }, orderBy: [{ entityType: 'asc' }, { normalizedAlias: 'asc' }] });
  }

  public listTenantPatterns(tenantId: bigint) {
    return this.client.tenantIntelligencePattern.findMany({ where: { tenantId }, orderBy: [{ intent: 'asc' }, { createdAt: 'asc' }] });
  }

  public createTenantPattern(input: { tenantId: bigint; intent: string; pattern: string }) {
    const normalizedPattern = normalizePattern(input.pattern);
    return this.client.tenantIntelligencePattern.create({ data: { publicId: randomUUID(), tenantId: input.tenantId, intent: input.intent as never, pattern: input.pattern.trim(), normalizedPattern } });
  }

  public updateTenantPattern(tenantId: bigint, publicId: string, input: { intent?: string; pattern?: string; enabled?: boolean }) {
    const normalizedPattern = input.pattern === undefined ? undefined : normalizePattern(input.pattern);
    return this.client.tenantIntelligencePattern.updateMany({ where: { tenantId, publicId }, data: { ...(input.intent === undefined ? {} : { intent: input.intent as never }), ...(input.pattern === undefined ? {} : { pattern: input.pattern.trim(), normalizedPattern }), ...(input.enabled === undefined ? {} : { enabled: input.enabled }) } });
  }

  public deleteTenantPattern(tenantId: bigint, publicId: string) {
    return this.client.tenantIntelligencePattern.deleteMany({ where: { tenantId, publicId } });
  }

  public async ensureDefaultRules(): Promise<void> {
    for (const rule of DEFAULT_RULES) {
      const existing = await this.client.intelligenceRule.findUnique({ where: { publicId: rule.id }, select: { id: true } });
      if (existing !== null) continue;
      await this.client.intelligenceRule.create({ data: { publicId: rule.id, name: rule.name, intent: rule.intent as never, enabled: true, priority: 0, baseConfidence: 0.75, patterns: { create: rule.patterns.map((pattern, index) => ({ publicId: randomUUID(), pattern, normalizedPattern: normalizePattern(pattern), sortOrder: index })) } } });
    }
  }

  public async catalogForTenant(tenantPublicId: string) {
    const tenant = await this.client.tenant.findUnique({ where: { publicId: tenantPublicId }, select: { id: true } });
    if (!tenant) throw new Error('TENANT_NOT_FOUND');
    const [services, combos, professionals, aliases] = await Promise.all([
      this.client.service.findMany({ where: { tenantId: tenant.id, active: true }, select: { publicId: true, name: true } }),
      this.client.combo.findMany({ where: { tenantId: tenant.id, active: true }, select: { publicId: true, name: true } }),
      this.client.professional.findMany({ where: { tenantId: tenant.id, active: true }, select: { publicId: true, name: true, publicName: true } }),
      this.listAliases(tenant.id),
    ]);
    return { tenantId: tenant.id, services, combos, professionals, aliases };
  }
}
