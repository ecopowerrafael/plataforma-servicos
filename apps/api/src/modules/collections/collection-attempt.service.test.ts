import { describe, expect, it, vi } from 'vitest';

import { CollectionAttemptEngineService } from './collection-attempt.service.js';

import { Prisma, type PrismaClient } from '../../database-client/client.js';

function mockClient(overrides: Record<string, unknown> = {}) {
  return {
    debt: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    collectionAttempt: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
    ...overrides,
  } as unknown as PrismaClient;
}

const openDebt = (overrides: Record<string, unknown> = {}) => ({
  id: 1n,
  tenantId: 10n,
  collectionRule: {
    maxAttemptsPerDay: 1,
    consecutiveDays: 3,
    pauseDaysAfterCycle: 4,
    maxCycles: null,
    allowedStartHour: 9,
    allowedEndHour: 18,
    skipSundays: true,
  },
  tenant: { timezone: 'UTC' },
  ...overrides,
});

// 2026-08-24T12:00:00Z é segunda-feira, dentro do horário permitido em UTC.
const now = new Date('2026-08-24T12:00:00.000Z');

describe('CollectionAttemptEngineService.run', () => {
  it('só processa Debt com status OPEN', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const client = mockClient({ debt: { findMany, findFirst: vi.fn() } });
    await new CollectionAttemptEngineService(client).run(now);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'OPEN' } }));
  });

  it('cria CollectionAttempt com os campos certos para a primeira tentativa', async () => {
    const create = vi.fn().mockResolvedValue({});
    const client = mockClient({
      debt: { findMany: vi.fn().mockResolvedValue([openDebt()]), findFirst: vi.fn() },
      collectionAttempt: { findMany: vi.fn().mockResolvedValue([]), create },
    });

    const result = await new CollectionAttemptEngineService(client).run(now);

    expect(result).toEqual({ created: 1, skipped: 0 });
    expect(create).toHaveBeenCalledWith({
      data: {
        publicId: expect.any(String),
        tenantId: 10n,
        debtId: 1n,
        cycleNumber: 1,
        attemptNumber: 1,
        attemptType: 'INITIAL_COLLECTION',
        scheduledAt: now,
        status: 'SCHEDULED',
        templateKey: 'collection.initial',
      },
    });
  });

  it('idempotente: corrida entre execuções (P2002 na constraint única) vira skip, não erro', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const create = vi.fn().mockRejectedValue(p2002);
    const client = mockClient({
      debt: { findMany: vi.fn().mockResolvedValue([openDebt()]), findFirst: vi.fn() },
      collectionAttempt: { findMany: vi.fn().mockResolvedValue([]), create },
    });

    const result = await new CollectionAttemptEngineService(client).run(now);

    expect(result).toEqual({ created: 0, skipped: 1 });
  });

  it('propaga erros que não são de constraint única', async () => {
    const create = vi.fn().mockRejectedValue(new Error('conexão perdida'));
    const client = mockClient({
      debt: { findMany: vi.fn().mockResolvedValue([openDebt()]), findFirst: vi.fn() },
      collectionAttempt: { findMany: vi.fn().mockResolvedValue([]), create },
    });

    await expect(new CollectionAttemptEngineService(client).run(now)).rejects.toThrow('conexão perdida');
  });

  it('debt fora do horário permitido é contado como skipped, sem tentar criar', async () => {
    const create = vi.fn();
    const client = mockClient({
      debt: { findMany: vi.fn().mockResolvedValue([openDebt()]), findFirst: vi.fn() },
      collectionAttempt: { findMany: vi.fn().mockResolvedValue([]), create },
    });

    const earlyMorning = new Date('2026-08-24T05:00:00.000Z');
    const result = await new CollectionAttemptEngineService(client).run(earlyMorning);

    expect(result).toEqual({ created: 0, skipped: 1 });
    expect(create).not.toHaveBeenCalled();
  });

  it('exclui PROMISE_DUE/PROMISE_OVERDUE (Fase 5, cycleNumber 0) do cálculo de ciclo da régua', async () => {
    const existingAttemptsFindMany = vi.fn().mockResolvedValue([]);
    const client = mockClient({
      debt: { findMany: vi.fn().mockResolvedValue([openDebt()]), findFirst: vi.fn() },
      collectionAttempt: { findMany: existingAttemptsFindMany, create: vi.fn().mockResolvedValue({}) },
    });
    await new CollectionAttemptEngineService(client).run(now);
    expect(existingAttemptsFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { debtId: 1n, attemptType: { notIn: ['PROMISE_DUE', 'PROMISE_OVERDUE'] } },
      }),
    );
  });

  it('nunca toca NotificationLog (só agenda, não envia)', async () => {
    const client = mockClient({
      debt: { findMany: vi.fn().mockResolvedValue([openDebt()]), findFirst: vi.fn() },
      collectionAttempt: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}) },
    });
    await new CollectionAttemptEngineService(client).run(now);
    expect((client as any).notificationLog).toBeUndefined();
  });
});

describe('CollectionAttemptEngineService.listForDebt', () => {
  it('tenant isolation: 404 quando a Debt não é do tenant', async () => {
    const client = mockClient({ debt: { findMany: vi.fn(), findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(
      new CollectionAttemptEngineService(client).listForDebt(10n, 'debt-de-outro-tenant'),
    ).rejects.toMatchObject({ code: 'DEBT_NOT_FOUND', statusCode: 404 });
  });

  it('lista as tentativas da Debt, mais recentes primeiro', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        publicId: '00000000-0000-4000-8000-000000000001',
        cycleNumber: 1,
        attemptNumber: 1,
        attemptType: 'INITIAL_COLLECTION',
        status: 'SCHEDULED',
        scheduledAt: now,
        templateKey: 'collection.initial',
        sentAt: null,
        respondedAt: null,
        skippedAt: null,
        skipReason: null,
        createdAt: now,
      },
    ]);
    const client = mockClient({
      debt: { findMany: vi.fn(), findFirst: vi.fn().mockResolvedValue({ id: 1n }) },
      collectionAttempt: { findMany, create: vi.fn() },
    });

    const result = await new CollectionAttemptEngineService(client).listForDebt(10n, 'debt-uuid');

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.attemptType).toBe('INITIAL_COLLECTION');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 10n, debtId: 1n }, orderBy: { id: 'desc' } }),
    );
  });
});
