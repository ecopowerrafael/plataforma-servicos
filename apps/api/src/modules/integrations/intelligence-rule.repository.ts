import { randomUUID } from 'node:crypto';

import { normalizePattern } from './intelligence-rules.js';
import { type PrismaClient } from '../../database-client/client.js';

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
