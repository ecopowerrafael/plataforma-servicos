import { describe, expect, it, vi } from 'vitest';

import { CollectionRuleService } from './collection-rule.service.js';

import type { PrismaClient } from '../../database-client/client.js';

const rule = (overrides: Record<string, unknown> = {}) => ({
  id: 2n,
  publicId: '00000000-0000-4000-8000-000000000002',
  tenantId: 10n,
  name: 'Semanal',
  active: true,
  cadenceType: 'WEEKLY',
  cadenceDays: null,
  preferredWeekday: null,
  monthlyDay: null,
  allowedStartHour: 9,
  allowedEndHour: 18,
  maxAttemptsPerDay: 1,
  consecutiveDays: 3,
  pauseDaysAfterCycle: 4,
  maxCycles: null,
  skipSundays: true,
  partialPaymentEnabled: true,
  partialOfferPercentages: [20, 50],
  partialMinimumCents: 1000n,
  partialRoundingStepCents: 500n,
  askPromiseAfterPartialPayment: true,
  promiseQuickOptionsDays: [1, 3, 7, 10],
  noResponseFollowupNextDay: true,
  createdAt: new Date('2026-08-20T00:00:00.000Z'),
  updatedAt: new Date('2026-08-20T00:00:00.000Z'),
  ...overrides,
});

function mockClient(overrides: Record<string, unknown> = {}) {
  return {
    collectionRule: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
    },
    auditLog: { create: vi.fn().mockResolvedValue(undefined) },
    ...overrides,
  } as unknown as PrismaClient;
}

describe('CollectionRuleService — isolamento de tenant', () => {
  it('list filtra por tenantId', async () => {
    const client = mockClient();
    await new CollectionRuleService(client).list(10n);
    expect((client.collectionRule.findMany as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
      where: { tenantId: 10n },
    });
  });

  it('resolveActiveRuleId rejeita régua de outro tenant (findFirst já filtra tenantId)', async () => {
    const client = mockClient({
      collectionRule: { findFirst: vi.fn().mockResolvedValue(null) },
    });
    const service = new CollectionRuleService(client);
    await expect(service.resolveActiveRuleId(10n, 'rule-de-outro-tenant')).rejects.toMatchObject({
      code: 'COLLECTION_RULE_NOT_FOUND',
      statusCode: 404,
    });
    expect((client.collectionRule.findFirst as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
      where: { tenantId: 10n, publicId: 'rule-de-outro-tenant' },
    });
  });

  it('resolveActiveRuleId rejeita régua inativa', async () => {
    const client = mockClient({
      collectionRule: { findFirst: vi.fn().mockResolvedValue({ id: 2n, active: false }) },
    });
    const service = new CollectionRuleService(client);
    await expect(service.resolveActiveRuleId(10n, 'rule-uuid')).rejects.toMatchObject({
      code: 'COLLECTION_RULE_INACTIVE',
      statusCode: 409,
    });
  });

  it('resolveActiveRuleId resolve para o id interno quando ativa e do tenant certo', async () => {
    const client = mockClient({
      collectionRule: { findFirst: vi.fn().mockResolvedValue({ id: 2n, active: true }) },
    });
    const service = new CollectionRuleService(client);
    await expect(service.resolveActiveRuleId(10n, 'rule-uuid')).resolves.toBe(2n);
  });

  it('create grava valores monetários como BigInt e devolve schema público', async () => {
    const client = mockClient({
      collectionRule: { create: vi.fn().mockResolvedValue(rule()) },
    });
    const service = new CollectionRuleService(client);
    const created = await service.create(
      10n,
      {
        name: 'Semanal',
        active: true,
        cadenceType: 'WEEKLY',
        allowedStartHour: 9,
        allowedEndHour: 18,
        maxAttemptsPerDay: 1,
        consecutiveDays: 3,
        pauseDaysAfterCycle: 4,
        skipSundays: true,
        partialPaymentEnabled: true,
        partialOfferPercentages: [20, 50],
        partialMinimumCents: 1000,
        partialRoundingStepCents: 500,
        askPromiseAfterPartialPayment: true,
        promiseQuickOptionsDays: [1, 3, 7, 10],
        noResponseFollowupNextDay: true,
      },
      { userId: 1n, sessionId: 1n },
    );
    expect(created.partialMinimumCents).toBe('1000');
    const createArgs = (client.collectionRule.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(createArgs.data.partialMinimumCents).toBe(1000n);
    expect(createArgs.data.tenantId).toBe(10n);
  });

  it('update só envia campos informados (undefined não sobrescreve)', async () => {
    const client = mockClient({
      collectionRule: {
        findFirst: vi.fn().mockResolvedValue(rule()),
        update: vi.fn().mockResolvedValue(rule({ name: 'Semanal renomeada' })),
      },
    });
    const service = new CollectionRuleService(client);
    await service.update(10n, 'rule-uuid', { name: 'Semanal renomeada' }, { userId: 1n, sessionId: 1n });
    const updateArgs = (client.collectionRule.update as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(updateArgs.data).toStrictEqual({ name: 'Semanal renomeada' });
  });
});
