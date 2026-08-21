import { describe, expect, it, vi } from 'vitest';

import { CollectionAttemptExecutionService } from './collection-attempt-execution.service.js';
import { type DebtService } from './debt.service.js';
import { type PaymentPromiseService } from './payment-promise.service.js';
import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { type NotificationService } from '../notifications/notification.service.js';

const now = new Date('2026-08-24T12:00:00.000Z');

const dueAttempt = (overrides: Record<string, unknown> = {}) => ({
  id: 100n,
  publicId: 'attempt-public-id',
  debtId: 1n,
  tenantId: 10n,
  templateKey: 'collection.initial',
  attemptType: 'INITIAL_COLLECTION',
  technicalRetryCount: 0,
  scheduledAt: now,
  status: 'SCHEDULED',
  ...overrides,
});

const openDebt = (overrides: Record<string, unknown> = {}) => ({
  id: 1n,
  tenantId: 10n,
  status: 'OPEN',
  currentBalanceCents: 5000n,
  balanceSyncPending: false,
  debtorName: 'Maria Silva',
  debtorWhatsapp: '5511999999999',
  dueDate: new Date('2026-09-01T00:00:00.000Z'),
  tenant: { displayName: 'Studio Bela', timezone: 'UTC' },
  ...overrides,
});

function mockClient(overrides: Record<string, unknown> = {}) {
  return {
    collectionAttempt: {
      findMany: vi.fn().mockResolvedValue([dueAttempt()]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    debt: {
      findUnique: vi.fn().mockResolvedValue(openDebt()),
    },
    tenantWhatsAppConfig: {
      findUnique: vi.fn().mockResolvedValue({ active: true }),
    },
    tenantSubscription: {
      findFirst: vi.fn().mockResolvedValue({
        plan: { limits: [{ booleanValue: true }] },
      }),
    },
    notificationLog: {
      findFirst: vi.fn().mockResolvedValue({ id: 900n, publicId: 'log-public-id' }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: 900n,
        status: 'SENT',
        sentAt: now,
        lastError: null,
      }),
    },
    whatsAppOutboundMessage: {
      findFirst: vi.fn().mockResolvedValue({ externalMessageId: 'WAMSG-1' }),
    },
    ...overrides,
  } as unknown as PrismaClient;
}

function mockNotifications(overrides: Record<string, unknown> = {}) {
  return {
    enqueue: vi.fn().mockResolvedValue(undefined),
    retry: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as NotificationService;
}

function mockDebts(overrides: Record<string, unknown> = {}) {
  return {
    recordEvent: vi.fn().mockResolvedValue(undefined),
    markHumanSupport: vi.fn().mockResolvedValue(undefined),
    markDisputed: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as DebtService;
}

function mockPaymentPromises(overrides: Record<string, unknown> = {}) {
  return {
    createOrReplace: vi.fn().mockResolvedValue({ publicId: 'promise-public-id' }),
    ...overrides,
  } as unknown as PaymentPromiseService;
}

describe('CollectionAttemptExecutionService.run', () => {
  it('1) tentativa vencida é enviada e marcada SENT', async () => {
    const client = mockClient();
    const notifications = mockNotifications();
    const debts = mockDebts();

    const result = await new CollectionAttemptExecutionService(client, notifications, debts, mockPaymentPromises()).run(now);

    expect(result).toEqual({ sent: 1, canceled: 0, failed: 0, retried: 0 });
    expect(client.collectionAttempt.update).toHaveBeenCalledWith({
      where: { id: 100n },
      data: {
        status: 'SENT',
        sentAt: now,
        notificationLogId: 900n,
        providerMessageId: 'WAMSG-1',
      },
    });
    expect(debts.recordEvent).toHaveBeenCalledWith(10n, 1n, 'COLLECTION_ATTEMPT_SENT', {
      collectionAttemptPublicId: 'attempt-public-id',
      templateKey: 'collection.initial',
    });
  });

  it('2) nada vencido: findMany já filtra por scheduledAt <= now, run() não processa nada', async () => {
    const client = mockClient({
      collectionAttempt: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn(),
        update: vi.fn(),
        findFirst: vi.fn(),
      },
    });
    const result = await new CollectionAttemptExecutionService(client, mockNotifications(), mockDebts(), mockPaymentPromises()).run(now);
    expect(result).toEqual({ sent: 0, canceled: 0, failed: 0, retried: 0 });
  });

  it('3) claim perdido (outra instância já pegou): não processa nem toca a Debt', async () => {
    const client = mockClient({
      collectionAttempt: {
        findMany: vi.fn().mockResolvedValue([dueAttempt()]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        update: vi.fn(),
        findFirst: vi.fn(),
      },
    });
    const debtFindUnique = vi.fn();
    (client as any).debt = { findUnique: debtFindUnique };

    const result = await new CollectionAttemptExecutionService(client, mockNotifications(), mockDebts(), mockPaymentPromises()).run(now);

    expect(result).toEqual({ sent: 0, canceled: 0, failed: 0, retried: 0 });
    expect(debtFindUnique).not.toHaveBeenCalled();
  });

  it.each([
    ['PAUSED', 'DEBT_PAUSED'],
    ['HUMAN_SUPPORT', 'DEBT_HUMAN_SUPPORT'],
    ['DISPUTED', 'DEBT_DISPUTED'],
    ['PAID', 'DEBT_PAID'],
    ['CANCELED', 'DEBT_CANCELED'],
  ])('4) Debt %s cancela a tentativa com skipReason %s', async (status, reason) => {
    const client = mockClient({ debt: { findUnique: vi.fn().mockResolvedValue(openDebt({ status })) } });
    const result = await new CollectionAttemptExecutionService(client, mockNotifications(), mockDebts(), mockPaymentPromises()).run(now);

    expect(result).toEqual({ sent: 0, canceled: 1, failed: 0, retried: 0 });
    expect(client.collectionAttempt.update).toHaveBeenCalledWith({
      where: { id: 100n },
      data: { status: 'CANCELED', skippedAt: now, skipReason: reason },
    });
  });

  it('4b) saldo zerado cancela a tentativa', async () => {
    const client = mockClient({
      debt: { findUnique: vi.fn().mockResolvedValue(openDebt({ currentBalanceCents: 0n })) },
    });
    const result = await new CollectionAttemptExecutionService(client, mockNotifications(), mockDebts(), mockPaymentPromises()).run(now);
    expect(result.canceled).toBe(1);
    expect(client.collectionAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ skipReason: 'DEBT_BALANCE_ZERO' }) }),
    );
  });

  it('4c) balanceSyncPending cancela a tentativa', async () => {
    const client = mockClient({
      debt: { findUnique: vi.fn().mockResolvedValue(openDebt({ balanceSyncPending: true })) },
    });
    const result = await new CollectionAttemptExecutionService(client, mockNotifications(), mockDebts(), mockPaymentPromises()).run(now);
    expect(result.canceled).toBe(1);
    expect(client.collectionAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ skipReason: 'DEBT_BALANCE_SYNC_PENDING' }) }),
    );
  });

  it('4d) PROMISE_DUE é enviado mesmo com Debt PROMISE_SCHEDULED (é o próprio lembrete que pausou a régua)', async () => {
    const client = mockClient({
      collectionAttempt: {
        findMany: vi.fn().mockResolvedValue([dueAttempt({ attemptType: 'PROMISE_DUE', templateKey: 'collection.promise_due' })]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({}),
        findFirst: vi.fn(),
      },
      debt: { findUnique: vi.fn().mockResolvedValue(openDebt({ status: 'PROMISE_SCHEDULED' })) },
    });
    const result = await new CollectionAttemptExecutionService(client, mockNotifications(), mockDebts(), mockPaymentPromises()).run(now);
    expect(result).toEqual({ sent: 1, canceled: 0, failed: 0, retried: 0 });
  });

  it('4e) tentativa normal (não PROMISE_DUE) continua bloqueada com Debt PROMISE_SCHEDULED', async () => {
    const client = mockClient({
      debt: { findUnique: vi.fn().mockResolvedValue(openDebt({ status: 'PROMISE_SCHEDULED' })) },
    });
    const result = await new CollectionAttemptExecutionService(client, mockNotifications(), mockDebts(), mockPaymentPromises()).run(now);
    expect(result.canceled).toBe(1);
    expect(client.collectionAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ skipReason: 'DEBT_STATUS_NOT_COLLECTIBLE' }) }),
    );
  });

  it('5) WhatsApp não configurado: FAILED terminal, sem enviar', async () => {
    const client = mockClient({ tenantWhatsAppConfig: { findUnique: vi.fn().mockResolvedValue(null) } });
    const notifications = mockNotifications();

    const result = await new CollectionAttemptExecutionService(client, notifications, mockDebts(), mockPaymentPromises()).run(now);

    expect(result).toEqual({ sent: 0, canceled: 0, failed: 1, retried: 0 });
    expect(notifications.enqueue).not.toHaveBeenCalled();
    expect(client.collectionAttempt.update).toHaveBeenCalledWith({
      where: { id: 100n },
      data: { status: 'FAILED', lastError: 'WHATSAPP_NOT_CONFIGURED' },
    });
  });

  it('6) telefone do devedor inválido: FAILED terminal, sem enviar', async () => {
    const client = mockClient({
      debt: { findUnique: vi.fn().mockResolvedValue(openDebt({ debtorWhatsapp: '123' })) },
    });
    const notifications = mockNotifications();

    const result = await new CollectionAttemptExecutionService(client, notifications, mockDebts(), mockPaymentPromises()).run(now);

    expect(result).toEqual({ sent: 0, canceled: 0, failed: 1, retried: 0 });
    expect(notifications.enqueue).not.toHaveBeenCalled();
    expect(client.collectionAttempt.update).toHaveBeenCalledWith({
      where: { id: 100n },
      data: { status: 'FAILED', lastError: 'INVALID_DEBTOR_WHATSAPP' },
    });
  });

  it('7) envia com o corpo renderizado e os 3 botões do Bot Cobra', async () => {
    const client = mockClient();
    const notifications = mockNotifications();

    await new CollectionAttemptExecutionService(client, notifications, mockDebts(), mockPaymentPromises()).run(now);

    expect(notifications.enqueue).toHaveBeenCalledWith(
      10n,
      expect.objectContaining({
        channel: 'WHATSAPP',
        targetType: 'collection_attempt',
        targetPublicId: 'attempt-public-id',
        recipient: '5511999999999',
        whatsappButtons: expect.arrayContaining([
          expect.objectContaining({ actionKey: 'COLLECTION_PAY_FULL' }),
          expect.objectContaining({ actionKey: 'COLLECTION_NEED_MORE_TIME' }),
          expect.objectContaining({ actionKey: 'COLLECTION_HUMAN_SUPPORT' }),
        ]),
      }),
      now,
    );
    expect(notifications.retry).toHaveBeenCalledWith(10n, 'log-public-id');
  });

  it('9) erro transitório do provider: volta para SCHEDULED com backoff, sem avançar scheduledAt', async () => {
    const client = mockClient({
      notificationLog: {
        findFirst: vi.fn().mockResolvedValue({ id: 900n, publicId: 'log-public-id' }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 900n,
          status: 'FAILED',
          sentAt: null,
          lastError: 'timeout',
        }),
      },
    });

    const result = await new CollectionAttemptExecutionService(client, mockNotifications(), mockDebts(), mockPaymentPromises()).run(now);

    expect(result).toEqual({ sent: 0, canceled: 0, failed: 0, retried: 1 });
    expect(client.collectionAttempt.update).toHaveBeenCalledWith({
      where: { id: 100n },
      data: {
        status: 'SCHEDULED',
        technicalRetryCount: 1,
        nextRetryAt: new Date(now.getTime() + 1 * 2 ** 1 * 60_000),
        lastError: 'timeout',
        notificationLogId: 900n,
      },
    });
  });

  it('10) 3ª falha técnica esgota o retry: FAILED terminal + DebtEvent', async () => {
    const client = mockClient({
      collectionAttempt: {
        findMany: vi.fn().mockResolvedValue([dueAttempt({ technicalRetryCount: 2 })]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({}),
        findFirst: vi.fn(),
      },
      notificationLog: {
        findFirst: vi.fn().mockResolvedValue({ id: 900n, publicId: 'log-public-id' }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 900n, status: 'FAILED', sentAt: null, lastError: 'timeout' }),
      },
    });
    const debts = mockDebts();

    const result = await new CollectionAttemptExecutionService(client, mockNotifications(), debts, mockPaymentPromises()).run(now);

    expect(result).toEqual({ sent: 0, canceled: 0, failed: 1, retried: 0 });
    expect(client.collectionAttempt.update).toHaveBeenCalledWith({
      where: { id: 100n },
      data: { status: 'FAILED', technicalRetryCount: 3, lastError: 'timeout', notificationLogId: 900n },
    });
    expect(debts.recordEvent).toHaveBeenCalledWith(10n, 1n, 'COLLECTION_ATTEMPT_FAILED', {
      collectionAttemptPublicId: 'attempt-public-id',
      templateKey: 'collection.initial',
    });
  });

  it('12) NOTIFICATION_ALREADY_SENT (crash entre envio e SENT numa rodada anterior) é tratado como sucesso', async () => {
    const client = mockClient();
    const notifications = mockNotifications({
      retry: vi.fn().mockRejectedValue(
        new AppError({ code: 'NOTIFICATION_ALREADY_SENT', message: 'já enviado', statusCode: 409 }),
      ),
    });

    const result = await new CollectionAttemptExecutionService(client, notifications, mockDebts(), mockPaymentPromises()).run(now);

    expect(result).toEqual({ sent: 1, canceled: 0, failed: 0, retried: 0 });
  });

  it('propaga (e trata como falha técnica) erros que não são NOTIFICATION_ALREADY_SENT', async () => {
    const client = mockClient();
    const notifications = mockNotifications({ retry: vi.fn().mockRejectedValue(new Error('conexão perdida')) });

    const result = await new CollectionAttemptExecutionService(client, notifications, mockDebts(), mockPaymentPromises()).run(now);

    expect(result).toEqual({ sent: 0, canceled: 0, failed: 0, retried: 1 });
  });

  it('13) exceção inesperada num item não derruba o loop nem trava em PROCESSING', async () => {
    const client = mockClient({
      debt: { findUnique: vi.fn().mockRejectedValue(new Error('DB caiu')) },
    });

    const result = await new CollectionAttemptExecutionService(client, mockNotifications(), mockDebts(), mockPaymentPromises()).run(now);

    expect(result).toEqual({ sent: 0, canceled: 0, failed: 0, retried: 1 });
    expect(client.collectionAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 100n }, data: expect.objectContaining({ status: 'SCHEDULED' }) }),
    );
  });

  it('idempotente: P2002 na criação da tentativa (Fase 3) não é responsabilidade deste serviço — claim próprio evita duplicidade', async () => {
    const client = mockClient({
      collectionAttempt: {
        findMany: vi.fn().mockResolvedValue([dueAttempt(), dueAttempt({ id: 101n, publicId: 'attempt-2' })]),
        updateMany: vi
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 }),
        update: vi.fn().mockResolvedValue({}),
        findFirst: vi.fn(),
      },
    });

    const result = await new CollectionAttemptExecutionService(client, mockNotifications(), mockDebts(), mockPaymentPromises()).run(now);

    expect(result.sent).toBe(1);
    expect(client.collectionAttempt.updateMany).toHaveBeenCalledTimes(2);
  });
});

describe('CollectionAttemptExecutionService.handleWhatsAppResponse', () => {
  it('14) COLLECTION_HUMAN_SUPPORT muda a Debt e cancela os SCHEDULED futuros', async () => {
    const client = mockClient({
      collectionAttempt: {
        findFirst: vi.fn().mockResolvedValue({ id: 100n, debtId: 1n, status: 'SENT' }),
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
        update: vi.fn().mockResolvedValue({}),
        findMany: vi.fn(),
      },
    });
    const debts = mockDebts();

    const result = await new CollectionAttemptExecutionService(client, mockNotifications(), debts, mockPaymentPromises()).handleWhatsAppResponse(
      10n,
      'attempt-public-id',
      'COLLECTION_HUMAN_SUPPORT',
    );

    expect(result).toEqual({ handled: true });
    expect(debts.markHumanSupport).toHaveBeenCalledWith(10n, 1n);
    expect(client.collectionAttempt.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 10n, debtId: 1n, status: 'SCHEDULED' },
      data: { status: 'CANCELED', skippedAt: expect.any(Date), skipReason: 'HUMAN_SUPPORT_REQUESTED' },
    });
    expect(debts.recordEvent).toHaveBeenCalledWith(10n, 1n, 'COLLECTION_RESPONSE_RECEIVED', {
      actionId: 'COLLECTION_HUMAN_SUPPORT',
    });
  });

  it('15) resposta estruturada válida marca a tentativa como RESPONDED', async () => {
    const client = mockClient({
      collectionAttempt: {
        findFirst: vi.fn().mockResolvedValue({ id: 100n, debtId: 1n, status: 'SENT' }),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn(),
        findMany: vi.fn(),
      },
    });

    const result = await new CollectionAttemptExecutionService(client, mockNotifications(), mockDebts(), mockPaymentPromises()).handleWhatsAppResponse(
      10n,
      'attempt-public-id',
      'COLLECTION_PAY_FULL',
    );

    expect(result).toEqual({ handled: true });
    expect(client.collectionAttempt.update).toHaveBeenCalledWith({
      where: { id: 100n },
      data: { status: 'RESPONDED', respondedAt: expect.any(Date) },
    });
  });

  it('16) isolamento de tenant: publicId de outro tenant não é encontrado', async () => {
    const client = mockClient({
      collectionAttempt: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
    });
    const debts = mockDebts();

    const result = await new CollectionAttemptExecutionService(client, mockNotifications(), debts, mockPaymentPromises()).handleWhatsAppResponse(
      999n,
      'attempt-public-id',
      'COLLECTION_PAY_FULL',
    );

    expect(result).toEqual({ handled: false });
    expect(debts.recordEvent).not.toHaveBeenCalled();
  });

  it('17) actionId desconhecido/nulo é ignorado', async () => {
    const client = mockClient();
    const debts = mockDebts();
    const service = new CollectionAttemptExecutionService(client, mockNotifications(), debts, mockPaymentPromises());

    expect(await service.handleWhatsAppResponse(10n, 'attempt-public-id', null)).toEqual({ handled: false });
    expect(await service.handleWhatsAppResponse(10n, 'attempt-public-id', 'NOT_A_REAL_ACTION')).toEqual({
      handled: false,
    });
    expect(debts.recordEvent).not.toHaveBeenCalled();
  });

  it.each([
    ['COLLECTION_PROMISE_1D', 1],
    ['COLLECTION_PROMISE_3D', 3],
    ['COLLECTION_PROMISE_7D', 7],
    ['COLLECTION_PROMISE_10D', 10],
  ])('18) %s cria/substitui a PaymentPromise com a data certa e confirma por WhatsApp', async (actionId, days) => {
    const client = mockClient({
      collectionAttempt: {
        findFirst: vi.fn().mockResolvedValue({ id: 100n, debtId: 1n, status: 'SENT' }),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn(),
        findMany: vi.fn(),
      },
    });
    const notifications = mockNotifications();
    const paymentPromises = mockPaymentPromises();

    const result = await new CollectionAttemptExecutionService(client, notifications, mockDebts(), paymentPromises).handleWhatsAppResponse(
      10n,
      'attempt-public-id',
      actionId,
      now,
    );

    expect(result).toEqual({ handled: true });
    const expectedDate = new Date('2026-08-24T00:00:00.000Z');
    expectedDate.setUTCDate(expectedDate.getUTCDate() + Number(days));
    expect(paymentPromises.createOrReplace).toHaveBeenCalledWith(10n, 1n, expectedDate, 'WHATSAPP');
    expect(notifications.enqueue).toHaveBeenCalledWith(
      10n,
      expect.objectContaining({ targetType: 'collection_reply', kind: 'collection.promise_confirmation' }),
      expect.any(Date),
    );
  });

  it('19) COLLECTION_NEED_MORE_TIME envia as 4 opções de prazo', async () => {
    const client = mockClient({
      collectionAttempt: {
        findFirst: vi.fn().mockResolvedValue({ id: 100n, debtId: 1n, status: 'SENT' }),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn(),
        findMany: vi.fn(),
      },
    });
    const notifications = mockNotifications();

    const result = await new CollectionAttemptExecutionService(client, notifications, mockDebts(), mockPaymentPromises()).handleWhatsAppResponse(
      10n,
      'attempt-public-id',
      'COLLECTION_NEED_MORE_TIME',
      now,
    );

    expect(result).toEqual({ handled: true });
    expect(notifications.enqueue).toHaveBeenCalledWith(
      10n,
      expect.objectContaining({
        targetType: 'collection_reply',
        kind: 'collection.need_more_time_options',
        whatsappButtons: expect.arrayContaining([
          expect.objectContaining({ actionKey: 'COLLECTION_PROMISE_1D' }),
          expect.objectContaining({ actionKey: 'COLLECTION_PROMISE_3D' }),
          expect.objectContaining({ actionKey: 'COLLECTION_PROMISE_7D' }),
          expect.objectContaining({ actionKey: 'COLLECTION_PROMISE_10D' }),
        ]),
      }),
      expect.any(Date),
    );
  });

  it('20) COLLECTION_DISPUTE muda a Debt para DISPUTED e cancela os SCHEDULED futuros', async () => {
    const client = mockClient({
      collectionAttempt: {
        findFirst: vi.fn().mockResolvedValue({ id: 100n, debtId: 1n, status: 'SENT' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({}),
        findMany: vi.fn(),
      },
    });
    const debts = mockDebts();

    const result = await new CollectionAttemptExecutionService(client, mockNotifications(), debts, mockPaymentPromises()).handleWhatsAppResponse(
      10n,
      'attempt-public-id',
      'COLLECTION_DISPUTE',
    );

    expect(result).toEqual({ handled: true });
    expect(debts.markDisputed).toHaveBeenCalledWith(10n, 1n);
    expect(client.collectionAttempt.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 10n, debtId: 1n, status: 'SCHEDULED' },
      data: { status: 'CANCELED', skippedAt: expect.any(Date), skipReason: 'DEBT_DISPUTED' },
    });
  });

  it.each(['COLLECTION_PAY_FULL', 'COLLECTION_PAYMENT_STATUS', 'COLLECTION_PROMISE_CUSTOM_DATE'])(
    '21) %s continua só com o ack genérico nesta fase (sem efeito colateral)',
    async (actionId) => {
      const client = mockClient({
        collectionAttempt: {
          findFirst: vi.fn().mockResolvedValue({ id: 100n, debtId: 1n, status: 'SENT' }),
          update: vi.fn().mockResolvedValue({}),
          updateMany: vi.fn(),
          findMany: vi.fn(),
        },
      });
      const notifications = mockNotifications();
      const debts = mockDebts();
      const paymentPromises = mockPaymentPromises();

      const result = await new CollectionAttemptExecutionService(client, notifications, debts, paymentPromises).handleWhatsAppResponse(
        10n,
        'attempt-public-id',
        actionId,
      );

      expect(result).toEqual({ handled: true });
      expect(client.collectionAttempt.update).toHaveBeenCalledWith({
        where: { id: 100n },
        data: { status: 'RESPONDED', respondedAt: expect.any(Date) },
      });
      expect(notifications.enqueue).not.toHaveBeenCalled();
      expect(paymentPromises.createOrReplace).not.toHaveBeenCalled();
      expect(debts.markDisputed).not.toHaveBeenCalled();
      expect(debts.markHumanSupport).not.toHaveBeenCalled();
    },
  );
});
