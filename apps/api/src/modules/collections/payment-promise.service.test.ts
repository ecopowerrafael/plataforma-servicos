import { describe, expect, it, vi } from 'vitest';

import { PaymentPromiseService } from './payment-promise.service.js';
import { type DebtService } from './debt.service.js';
import { Prisma, type PrismaClient } from '../../database-client/client.js';

const now = new Date('2026-08-24T12:00:00.000Z'); // 2026-08-24, UTC

/**
 * $transaction aqui é um passthrough: chama o callback com o próprio mock
 * client como `tx`, então toda asserção em `client.X.Y` continua válida —
 * mas se o callback rejeitar, a rejeição propaga (mesmo comportamento do
 * Prisma real: transação que lança não confirma nada).
 */
function mockClient(overrides: Record<string, unknown> = {}) {
  const client: Record<string, unknown> = {
    paymentPromise: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({ publicId: 'promise-public-id' }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    collectionAttempt: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
  client.$transaction = vi.fn((callback: (tx: unknown) => unknown) => callback(client));
  return client as unknown as PrismaClient;
}

function mockDebts(overrides: Record<string, unknown> = {}) {
  return {
    markPromiseScheduled: vi.fn().mockResolvedValue(undefined),
    resumeAfterPromiseOverdue: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as DebtService;
}

const activePromise = (overrides: Record<string, unknown> = {}) => ({
  id: 500n,
  tenantId: 10n,
  debtId: 1n,
  promisedDate: new Date('2026-08-24T00:00:00.000Z'),
  dueReminderSentAt: null,
  tenant: { timezone: 'UTC' },
  ...overrides,
});

describe('PaymentPromiseService.createOrReplace', () => {
  it('substitui promessa ativa anterior, cria a nova, marca a Debt e cancela SCHEDULED pendentes — tudo numa transação', async () => {
    const client = mockClient();
    const debts = mockDebts();
    const promisedDate = new Date('2026-08-27T00:00:00.000Z');

    const result = await new PaymentPromiseService(client, debts).createOrReplace(10n, 1n, promisedDate, 'WHATSAPP');

    expect(result).toEqual({ publicId: 'promise-public-id' });
    expect(client.$transaction).toHaveBeenCalledOnce();
    expect(client.paymentPromise.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 10n, debtId: 1n, status: 'ACTIVE' },
      data: { status: 'REPLACED' },
    });
    expect(client.paymentPromise.create).toHaveBeenCalledWith({
      data: { publicId: expect.any(String), tenantId: 10n, debtId: 1n, promisedDate, status: 'ACTIVE', source: 'WHATSAPP' },
    });
    expect(debts.markPromiseScheduled).toHaveBeenCalledWith(10n, 1n, client);
    expect(client.collectionAttempt.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 10n, debtId: 1n, status: 'SCHEDULED' },
      data: { status: 'CANCELED', skippedAt: expect.any(Date), skipReason: 'PROMISE_SCHEDULED' },
    });
  });

  it('1) create da nova promessa falha: a promessa anterior deveria continuar ACTIVE (rejeita, não engole o erro)', async () => {
    const client = mockClient({
      paymentPromise: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockRejectedValue(new Error('conexão perdida')),
        findMany: vi.fn(),
      },
    });
    const debts = mockDebts();

    await expect(
      new PaymentPromiseService(client, debts).createOrReplace(10n, 1n, new Date('2026-08-27T00:00:00.000Z'), 'WHATSAPP'),
    ).rejects.toThrow('conexão perdida');

    // Nada depois do create deveria ter rodado — é isso que garante que a
    // transação não "meio confirma": Debt não marcada, attempts não cancelados.
    expect(debts.markPromiseScheduled).not.toHaveBeenCalled();
    expect(client.collectionAttempt.updateMany).not.toHaveBeenCalled();
  });

  it('2) markPromiseScheduled falha: a nova promessa não deveria ficar ACTIVE isolada (rejeita, não engole o erro)', async () => {
    const client = mockClient();
    const debts = mockDebts({ markPromiseScheduled: vi.fn().mockRejectedValue(new Error('falha ao marcar Debt')) });

    await expect(
      new PaymentPromiseService(client, debts).createOrReplace(10n, 1n, new Date('2026-08-27T00:00:00.000Z'), 'WHATSAPP'),
    ).rejects.toThrow('falha ao marcar Debt');

    // O cancelamento dos SCHEDULED pendentes é o passo seguinte — não deveria rodar.
    expect(client.collectionAttempt.updateMany).not.toHaveBeenCalled();
  });

  it('5) retry: depois de uma falha, uma nova chamada processa normalmente', async () => {
    const failing = mockClient({ paymentPromise: { updateMany: vi.fn(), create: vi.fn().mockRejectedValue(new Error('x')), findMany: vi.fn() } });
    await expect(
      new PaymentPromiseService(failing, mockDebts()).createOrReplace(10n, 1n, new Date('2026-08-27T00:00:00.000Z'), 'WHATSAPP'),
    ).rejects.toThrow();

    const retryClient = mockClient();
    const debts = mockDebts();
    await expect(
      new PaymentPromiseService(retryClient, debts).createOrReplace(10n, 1n, new Date('2026-08-27T00:00:00.000Z'), 'WHATSAPP'),
    ).resolves.toEqual({ publicId: 'promise-public-id' });
    expect(debts.markPromiseScheduled).toHaveBeenCalledOnce();
  });
});

describe('PaymentPromiseService.sweep', () => {
  it('promessa cujo dia é hoje e ainda não lembrada: cria PROMISE_DUE e marca dueReminderSentAt numa transação', async () => {
    const client = mockClient({
      paymentPromise: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([activePromise()]),
      },
    });
    const result = await new PaymentPromiseService(client, mockDebts()).sweep(now);

    expect(result).toEqual({ dueReminders: 1, overdue: 0 });
    expect(client.paymentPromise.updateMany).toHaveBeenCalledWith({
      where: { id: 500n, dueReminderSentAt: null },
      data: { dueReminderSentAt: now },
    });
    expect(client.collectionAttempt.create).toHaveBeenCalledWith({
      data: {
        publicId: expect.any(String),
        tenantId: 10n,
        debtId: 1n,
        cycleNumber: 0,
        attemptNumber: 1,
        attemptType: 'PROMISE_DUE',
        scheduledAt: now,
        status: 'SCHEDULED',
        templateKey: 'collection.promise_due',
      },
    });
  });

  it('idempotente: já lembrada hoje (dueReminderSentAt preenchido) não processa de novo', async () => {
    const client = mockClient({
      paymentPromise: {
        updateMany: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([activePromise({ dueReminderSentAt: now })]),
      },
    });
    const result = await new PaymentPromiseService(client, mockDebts()).sweep(now);

    expect(result).toEqual({ dueReminders: 0, overdue: 0 });
    expect(client.paymentPromise.updateMany).not.toHaveBeenCalled();
    expect(client.collectionAttempt.create).not.toHaveBeenCalled();
  });

  it('claim perdido no lembrete do dia (outra instância já pegou) não reprocessa', async () => {
    const client = mockClient({
      paymentPromise: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([activePromise()]),
      },
    });
    const result = await new PaymentPromiseService(client, mockDebts()).sweep(now);

    expect(result).toEqual({ dueReminders: 0, overdue: 0 });
    expect(client.collectionAttempt.create).not.toHaveBeenCalled();
  });

  it('3) criação do PROMISE_DUE falha: dueReminderSentAt não deveria continuar preenchido (transação rejeita)', async () => {
    const client = mockClient({
      paymentPromise: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([activePromise()]),
      },
      collectionAttempt: {
        updateMany: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockRejectedValue(new Error('DB caiu no meio')),
      },
    });

    // sweep() não deixa uma falha de item derrubar o loop inteiro — mas o
    // item em si deve refletir "não processado" (transação não confirmada).
    const result = await new PaymentPromiseService(client, mockDebts()).sweep(now);
    expect(result).toEqual({ dueReminders: 0, overdue: 0 });
  });

  it('promessa vencida (dia já passou): marca OVERDUE, devolve a Debt a OPEN e cria PROMISE_OVERDUE numa transação', async () => {
    const client = mockClient({
      paymentPromise: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([
          activePromise({ promisedDate: new Date('2026-08-20T00:00:00.000Z') }),
        ]),
      },
    });
    const debts = mockDebts();

    const result = await new PaymentPromiseService(client, debts).sweep(now);

    expect(result).toEqual({ dueReminders: 0, overdue: 1 });
    expect(client.paymentPromise.updateMany).toHaveBeenCalledWith({
      where: { id: 500n, status: 'ACTIVE' },
      data: { status: 'OVERDUE' },
    });
    expect(debts.resumeAfterPromiseOverdue).toHaveBeenCalledWith(10n, 1n, client);
    expect(client.collectionAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ attemptType: 'PROMISE_OVERDUE', templateKey: 'collection.promise_overdue' }) }),
    );
  });

  it('claim perdido na promessa vencida (outra instância já marcou OVERDUE) não reprocessa', async () => {
    const client = mockClient({
      paymentPromise: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([
          activePromise({ promisedDate: new Date('2026-08-20T00:00:00.000Z') }),
        ]),
      },
    });
    const debts = mockDebts();

    const result = await new PaymentPromiseService(client, debts).sweep(now);

    expect(result).toEqual({ dueReminders: 0, overdue: 0 });
    expect(debts.resumeAfterPromiseOverdue).not.toHaveBeenCalled();
  });

  it('4) criação do PROMISE_OVERDUE falha: promessa/Debt não deveriam avançar (transação rejeita)', async () => {
    const client = mockClient({
      paymentPromise: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([
          activePromise({ promisedDate: new Date('2026-08-20T00:00:00.000Z') }),
        ]),
      },
      collectionAttempt: {
        updateMany: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockRejectedValue(new Error('DB caiu no meio')),
      },
    });
    const debts = mockDebts();

    const result = await new PaymentPromiseService(client, debts).sweep(now);
    expect(result).toEqual({ dueReminders: 0, overdue: 0 });
    // resumeAfterPromiseOverdue roda ANTES da criação do attempt, dentro da
    // mesma transação — se a transação inteira reverte, isso não conta como
    // "efeito real" fora dela (é exatamente o que a transação garante).
    expect(debts.resumeAfterPromiseOverdue).toHaveBeenCalledWith(10n, 1n, client);
  });

  it('5) retry: depois de uma falha na criação do attempt, uma nova rodada do sweep processa normalmente', async () => {
    const failingCreate = vi.fn().mockRejectedValue(new Error('DB caiu'));
    const failingClient = mockClient({
      paymentPromise: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), create: vi.fn(), findMany: vi.fn().mockResolvedValue([activePromise()]) },
      collectionAttempt: { updateMany: vi.fn(), count: vi.fn().mockResolvedValue(0), create: failingCreate },
    });
    const firstResult = await new PaymentPromiseService(failingClient, mockDebts()).sweep(now);
    expect(firstResult).toEqual({ dueReminders: 0, overdue: 0 });

    // Rodada seguinte, tudo funcionando: dueReminderSentAt ainda null (a
    // transação anterior reverteu), então o claim consegue de novo.
    const retryClient = mockClient({
      paymentPromise: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), create: vi.fn(), findMany: vi.fn().mockResolvedValue([activePromise()]) },
    });
    const secondResult = await new PaymentPromiseService(retryClient, mockDebts()).sweep(now);
    expect(secondResult).toEqual({ dueReminders: 1, overdue: 0 });
  });

  it('promessa com data futura não é tocada', async () => {
    const client = mockClient({
      paymentPromise: {
        updateMany: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([
          activePromise({ promisedDate: new Date('2026-08-30T00:00:00.000Z') }),
        ]),
      },
    });
    const result = await new PaymentPromiseService(client, mockDebts()).sweep(now);

    expect(result).toEqual({ dueReminders: 0, overdue: 0 });
    expect(client.paymentPromise.updateMany).not.toHaveBeenCalled();
  });

  it('numera attemptNumber sequencialmente dentro do cycleNumber 0 da Debt', async () => {
    const client = mockClient({
      paymentPromise: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([activePromise()]),
      },
      collectionAttempt: {
        updateMany: vi.fn(),
        count: vi.fn().mockResolvedValue(2),
        create: vi.fn().mockResolvedValue({}),
      },
    });
    await new PaymentPromiseService(client, mockDebts()).sweep(now);

    expect(client.collectionAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ cycleNumber: 0, attemptNumber: 3 }) }),
    );
  });

  it('idempotência: P2002 na criação do attempt (corrida residual) não derruba a transação nem duplica', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const client = mockClient({
      paymentPromise: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([activePromise()]),
      },
      collectionAttempt: {
        updateMany: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockRejectedValue(p2002),
      },
    });

    const result = await new PaymentPromiseService(client, mockDebts()).sweep(now);
    // O claim (dueReminderSentAt) já foi feito e a transação NÃO rejeita para
    // P2002 (é tratado como "já existe"), então conta como processado.
    expect(result).toEqual({ dueReminders: 1, overdue: 0 });
  });
});
