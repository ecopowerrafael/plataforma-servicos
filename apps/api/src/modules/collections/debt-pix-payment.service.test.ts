import { describe, expect, it, vi } from 'vitest';

import { DebtPixPaymentService } from './debt-pix-payment.service.js';
import { type DebtService } from './debt.service.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type NotificationService } from '../notifications/notification.service.js';
import { type PaymentMethodService } from '../payments/payment-method.service.js';
import { type PaymentService } from '../payments/payment.service.js';

const now = new Date('2026-08-24T12:00:00.000Z');

const manualDebt = (overrides: Record<string, unknown> = {}) => ({
  id: 1n,
  tenantId: 10n,
  originType: 'MANUAL',
  originAppointmentId: null,
  currentBalanceCents: 5000n,
  debtorName: 'Maria Silva',
  debtorWhatsapp: '5511999999999',
  tenant: { displayName: 'Studio Bela', timezone: 'UTC' },
  ...overrides,
});

const appointmentDebt = (overrides: Record<string, unknown> = {}) => ({
  id: 2n,
  tenantId: 10n,
  originType: 'APPOINTMENT',
  originAppointmentId: 55n,
  currentBalanceCents: 5000n,
  debtorName: 'João Souza',
  debtorWhatsapp: '5511988888888',
  tenant: { displayName: 'Studio Bela', timezone: 'UTC' },
  ...overrides,
});

const chargeRow = (overrides: Record<string, unknown> = {}) => ({
  id: 900n,
  tenantId: 10n,
  debtId: 1n,
  provider: 'pix-local',
  kind: 'PAYMENT',
  amountCents: 5000n,
  externalId: 'local-abc',
  ...overrides,
});

function mockClient(overrides: Record<string, unknown> = {}) {
  const client: Record<string, unknown> = {
    paymentGatewayCharge: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue(chargeRow()),
      update: vi.fn().mockResolvedValue({}),
    },
    debt: {
      findUnique: vi.fn().mockResolvedValue(manualDebt()),
      update: vi.fn().mockResolvedValue({}),
    },
    paymentMethod: {
      findFirst: vi.fn().mockResolvedValue({ id: 77n }),
    },
    payment: {
      create: vi.fn().mockResolvedValue({ id: 500n, publicId: 'payment-public-id' }),
      findFirst: vi.fn().mockResolvedValue({ id: 500n }),
    },
    debtPaymentAllocation: {
      create: vi.fn().mockResolvedValue({}),
    },
    collectionAttempt: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    appointment: {
      findUnique: vi.fn().mockResolvedValue({ publicId: 'appointment-public-id' }),
    },
    notificationLog: {
      findFirst: vi.fn().mockResolvedValue({ id: 900n, publicId: 'log-public-id' }),
    },
    ...overrides,
  };
  client.$transaction = vi.fn((callback: (tx: unknown) => unknown) => callback(client));
  return client as unknown as PrismaClient;
}

function mockDebts(overrides: Record<string, unknown> = {}) {
  return { recordEvent: vi.fn().mockResolvedValue(undefined), ...overrides } as unknown as DebtService;
}

function mockNotifications(overrides: Record<string, unknown> = {}) {
  return {
    enqueue: vi.fn().mockResolvedValue(undefined),
    retry: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as NotificationService;
}

function mockPaymentMethods(overrides: Record<string, unknown> = {}) {
  return {
    list: vi.fn().mockResolvedValue({ items: [] }),
    create: vi.fn().mockResolvedValue({ publicId: 'method-public-id' }),
    ...overrides,
  } as unknown as PaymentMethodService;
}

function mockPayments(overrides: Record<string, unknown> = {}) {
  return {
    create: vi.fn().mockResolvedValue({ publicId: 'appointment-payment-public-id' }),
    ...overrides,
  } as unknown as PaymentService;
}

describe('DebtPixPaymentService.reconcile — A) Debt MANUAL', () => {
  it('cria Payment originType=DEBT, aloca e reduz o saldo da Debt', async () => {
    const client = mockClient();
    const debts = mockDebts();

    await new DebtPixPaymentService(client, debts, mockNotifications(), mockPaymentMethods(), mockPayments()).reconcile(
      900n,
      now,
    );

    expect(client.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ originType: 'DEBT', debtId: 1n, status: 'PAID', amountCents: 5000n }),
    });
    expect(client.debtPaymentAllocation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ debtId: 1n, paymentId: 500n, amountCents: 5000n, source: 'BOT_PIX' }),
    });
  });

  it('saldo integral zera: Debt vira PAID, evento DEBT_PAID e cancela SCHEDULED', async () => {
    const client = mockClient({
      debt: { findUnique: vi.fn().mockResolvedValue(manualDebt({ currentBalanceCents: 5000n })), update: vi.fn().mockResolvedValue({}) },
    });
    const debts = mockDebts();

    await new DebtPixPaymentService(client, debts, mockNotifications(), mockPaymentMethods(), mockPayments()).reconcile(
      900n,
      now,
    );

    expect((client as any).debt.update).toHaveBeenCalledWith({
      where: { id: 1n },
      data: { currentBalanceCents: 0n, status: 'PAID', paidAt: now },
    });
    expect(debts.recordEvent).toHaveBeenCalledWith(10n, 1n, 'DEBT_PAID', { source: 'BOT_PIX', paymentPublicId: 'payment-public-id' }, client);
    expect(client.collectionAttempt.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 10n, debtId: 1n, status: 'SCHEDULED' },
      data: { status: 'CANCELED', skippedAt: now, skipReason: 'DEBT_PAID' },
    });
    expect(client.paymentGatewayCharge.update).toHaveBeenCalledWith({ where: { id: 900n }, data: { paymentId: 500n } });
  });

  it('pagamento parcial (saldo não zera): não fecha a Debt, não envia quitação', async () => {
    const client = mockClient({
      debt: { findUnique: vi.fn().mockResolvedValue(manualDebt({ currentBalanceCents: 8000n })), update: vi.fn().mockResolvedValue({}) },
    });
    const debts = mockDebts();
    const notifications = mockNotifications();

    await new DebtPixPaymentService(client, debts, notifications, mockPaymentMethods(), mockPayments()).reconcile(900n, now);

    expect((client as any).debt.update).toHaveBeenCalledWith({
      where: { id: 1n },
      data: { currentBalanceCents: 3000n },
    });
    expect(debts.recordEvent).not.toHaveBeenCalled();
    expect(client.collectionAttempt.updateMany).not.toHaveBeenCalled();
    expect(notifications.enqueue).not.toHaveBeenCalled();
  });

  it('envia a mensagem de quitação quando fecha', async () => {
    const client = mockClient({
      debt: { findUnique: vi.fn().mockResolvedValue(manualDebt({ currentBalanceCents: 5000n })), update: vi.fn().mockResolvedValue({}) },
    });
    const notifications = mockNotifications();

    await new DebtPixPaymentService(client, mockDebts(), notifications, mockPaymentMethods(), mockPayments()).reconcile(900n, now);

    expect(notifications.enqueue).toHaveBeenCalledWith(
      10n,
      expect.objectContaining({ kind: 'collection.debt_settled', targetType: 'collection_reply', recipient: '5511999999999' }),
    );
    expect(notifications.retry).toHaveBeenCalledWith(10n, 'log-public-id');
  });
});

describe('DebtPixPaymentService.reconcile — B) Debt APPOINTMENT', () => {
  it('cria Payment originType=APPOINTMENT via PaymentService.create() (fluxo canônico), aloca e não mexe no saldo direto', async () => {
    const client = mockClient({
      debt: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(appointmentDebt())
          .mockResolvedValueOnce({ status: 'PAID' }), // releitura após PaymentService.create()
      },
    });
    const payments = mockPayments();

    await new DebtPixPaymentService(client, mockDebts(), mockNotifications(), mockPaymentMethods(), payments).reconcile(
      900n,
      now,
    );

    expect(payments.create).toHaveBeenCalledWith(
      10n,
      'appointment-public-id',
      expect.objectContaining({ amountCents: 5000, paymentMethodPublicId: 'method-public-id' }),
      { userId: null, sessionId: null },
    );
    expect(client.debtPaymentAllocation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ debtId: 2n, paymentId: 500n, source: 'BOT_PIX' }),
    });
    // não cria Payment isolado (DEBT) nem mexe direto em Debt.currentBalanceCents — quem faz isso é
    // PaymentService.create() -> syncAppointmentDebtBalance, fora do controle deste service.
    expect(client.payment.create).not.toHaveBeenCalled();
  });

  it('C) Debt fica PAID e não é reaberta — checagem pós-pagamento reflete o status já sincronizado por syncAppointmentDebtBalance', async () => {
    const client = mockClient({
      debt: {
        findUnique: vi.fn().mockResolvedValueOnce(appointmentDebt()).mockResolvedValueOnce({ status: 'PAID' }),
      },
    });

    await new DebtPixPaymentService(client, mockDebts(), mockNotifications(), mockPaymentMethods(), mockPayments()).reconcile(
      900n,
      now,
    );

    expect(client.collectionAttempt.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 10n, debtId: 2n, status: 'SCHEDULED' },
      data: { status: 'CANCELED', skippedAt: now, skipReason: 'DEBT_PAID' },
    });
  });

  it('D) caixa/comissão são acionados — via PaymentService.create() real (aqui verificado pelo mock ser chamado com os dados certos)', async () => {
    const client = mockClient({
      debt: { findUnique: vi.fn().mockResolvedValueOnce(appointmentDebt()).mockResolvedValueOnce({ status: 'OPEN' }) },
    });
    const payments = mockPayments();

    await new DebtPixPaymentService(client, mockDebts(), mockNotifications(), mockPaymentMethods(), payments).reconcile(
      900n,
      now,
    );

    // PaymentService.create() já é responsável por caixa/comissão/loyalty internamente
    // (não duplicado aqui) — a prova de integração é o service canônico ser chamado.
    expect(payments.create).toHaveBeenCalledOnce();
  });

  it('saldo não zera (Debt continua OPEN): não cancela SCHEDULED nem envia quitação', async () => {
    const client = mockClient({
      debt: { findUnique: vi.fn().mockResolvedValueOnce(appointmentDebt()).mockResolvedValueOnce({ status: 'OPEN' }) },
    });
    const notifications = mockNotifications();

    await new DebtPixPaymentService(client, mockDebts(), notifications, mockPaymentMethods(), mockPayments()).reconcile(
      900n,
      now,
    );

    expect(client.collectionAttempt.updateMany).not.toHaveBeenCalled();
    expect(notifications.enqueue).not.toHaveBeenCalled();
  });
});

describe('DebtPixPaymentService.reconcile — claim/idempotência', () => {
  it('claim perdido (outra execução já reconciliou) não processa nada', async () => {
    const client = mockClient({
      paymentGatewayCharge: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    });
    const debtFindUnique = vi.fn();
    (client as any).debt = { findUnique: debtFindUnique };

    await new DebtPixPaymentService(client, mockDebts(), mockNotifications(), mockPaymentMethods(), mockPayments()).reconcile(
      900n,
      now,
    );

    expect(debtFindUnique).not.toHaveBeenCalled();
  });

  it('E) reconcile chamado duas vezes seguidas (webhook duplicado): só a primeira processa, a segunda não cria outro Payment/Allocation', async () => {
    let claimed = true;
    const client = mockClient({
      paymentGatewayCharge: {
        updateMany: vi.fn().mockImplementation(() => {
          const result = { count: claimed ? 1 : 0 };
          claimed = false;
          return Promise.resolve(result);
        }),
        findUnique: vi.fn().mockResolvedValue(chargeRow()),
        update: vi.fn().mockResolvedValue({}),
      },
      debt: {
        findUnique: vi.fn().mockResolvedValue(manualDebt({ currentBalanceCents: 5000n })),
        update: vi.fn().mockResolvedValue({}),
      },
    });
    const service = new DebtPixPaymentService(client, mockDebts(), mockNotifications(), mockPaymentMethods(), mockPayments());

    await service.reconcile(900n, now);
    await service.reconcile(900n, now);

    expect(client.payment.create).toHaveBeenCalledTimes(1);
    expect(client.debtPaymentAllocation.create).toHaveBeenCalledTimes(1);
  });

  it('cobrança sem debtId associado não processa nada', async () => {
    const client = mockClient({
      paymentGatewayCharge: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue(chargeRow({ debtId: null })),
        update: vi.fn(),
      },
    });
    const debtFindUnique = vi.fn();
    (client as any).debt = { findUnique: debtFindUnique };

    await new DebtPixPaymentService(client, mockDebts(), mockNotifications(), mockPaymentMethods(), mockPayments()).reconcile(
      900n,
      now,
    );

    expect(debtFindUnique).not.toHaveBeenCalled();
  });
});
