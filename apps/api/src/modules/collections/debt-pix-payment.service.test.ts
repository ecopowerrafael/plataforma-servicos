import { describe, expect, it, vi } from 'vitest';

import { DebtPixPaymentService } from './debt-pix-payment.service.js';
import { type DebtService } from './debt.service.js';
import { type PaymentPromiseService } from './payment-promise.service.js';
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
  currentBalanceCents: 10000n,
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
  currentBalanceCents: 10000n,
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

function mockPaymentPromises(overrides: Record<string, unknown> = {}) {
  return { fulfillActive: vi.fn().mockResolvedValue(undefined), ...overrides } as unknown as PaymentPromiseService;
}

function buildService(
  client: PrismaClient,
  debts = mockDebts(),
  notifications = mockNotifications(),
  paymentMethods = mockPaymentMethods(),
  payments = mockPayments(),
  paymentPromises = mockPaymentPromises(),
) {
  return new DebtPixPaymentService(client, debts, notifications, paymentMethods, payments, paymentPromises);
}

describe('DebtPixPaymentService.reconcile — Debt MANUAL', () => {
  it('8/9) pagamento parcial cria Payment originType=DEBT (valor recebido) e Allocation (valor alocado)', async () => {
    const client = mockClient({
      debt: { findUnique: vi.fn().mockResolvedValue(manualDebt({ currentBalanceCents: 10000n })), update: vi.fn().mockResolvedValue({}) },
    });

    await buildService(client).reconcile(900n, now);

    expect(client.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ originType: 'DEBT', debtId: 1n, status: 'PAID', amountCents: 5000n }),
    });
    expect(client.debtPaymentAllocation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ debtId: 1n, paymentId: 500n, amountCents: 5000n, source: 'BOT_PIX' }),
    });
  });

  it('10) pagamento parcial (saldo não zera): Debt permanece OPEN, saldo reduz corretamente', async () => {
    const client = mockClient({
      debt: { findUnique: vi.fn().mockResolvedValue(manualDebt({ currentBalanceCents: 10000n })), update: vi.fn().mockResolvedValue({}) },
    });
    const debts = mockDebts();

    await buildService(client, debts).reconcile(900n, now);

    expect(client.debt.update).toHaveBeenCalledWith({ where: { id: 1n }, data: { currentBalanceCents: 5000n } });
    expect(debts.recordEvent).toHaveBeenCalledWith(
      10n,
      1n,
      'PARTIAL_PAYMENT_RECEIVED',
      { paymentPublicId: 'payment-public-id', amountCents: '5000', previousBalanceCents: '10000', currentBalanceCents: '5000', source: 'BOT_PIX' },
      client,
    );
    expect(debts.recordEvent).not.toHaveBeenCalledWith(10n, 1n, 'DEBT_PAID', expect.anything(), expect.anything());
  });

  it('11) último parcial zera o saldo: Debt vira PAID, evento DEBT_PAID, promessa FULFILLED, cancela SCHEDULED', async () => {
    const client = mockClient({
      debt: { findUnique: vi.fn().mockResolvedValue(manualDebt({ currentBalanceCents: 5000n })), update: vi.fn().mockResolvedValue({}) },
    });
    const debts = mockDebts();
    const paymentPromises = mockPaymentPromises();

    await buildService(client, debts, mockNotifications(), mockPaymentMethods(), mockPayments(), paymentPromises).reconcile(900n, now);

    expect(client.debt.update).toHaveBeenCalledWith({
      where: { id: 1n },
      data: { currentBalanceCents: 0n, status: 'PAID', paidAt: now },
    });
    expect(debts.recordEvent).toHaveBeenCalledWith(10n, 1n, 'DEBT_PAID', { source: 'BOT_PIX', paymentPublicId: 'payment-public-id' }, client);
    expect(paymentPromises.fulfillActive).toHaveBeenCalledWith(10n, 1n, client);
    expect(client.collectionAttempt.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 10n, debtId: 1n, status: 'SCHEDULED' },
      data: { status: 'CANCELED', skippedAt: now, skipReason: 'DEBT_PAID' },
    });
  });

  it('21) Promise ACTIVE permanece (não é tocada) quando o saldo não zera', async () => {
    const client = mockClient({
      debt: { findUnique: vi.fn().mockResolvedValue(manualDebt({ currentBalanceCents: 10000n })), update: vi.fn().mockResolvedValue({}) },
    });
    const paymentPromises = mockPaymentPromises();

    await buildService(client, mockDebts(), mockNotifications(), mockPaymentMethods(), mockPayments(), paymentPromises).reconcile(900n, now);

    expect(paymentPromises.fulfillActive).not.toHaveBeenCalled();
  });

  it('22) Promise vira FULFILLED quando o saldo zera', async () => {
    const client = mockClient({
      debt: { findUnique: vi.fn().mockResolvedValue(manualDebt({ currentBalanceCents: 5000n })), update: vi.fn().mockResolvedValue({}) },
    });
    const paymentPromises = mockPaymentPromises();

    await buildService(client, mockDebts(), mockNotifications(), mockPaymentMethods(), mockPayments(), paymentPromises).reconcile(900n, now);

    expect(paymentPromises.fulfillActive).toHaveBeenCalledWith(10n, 1n, client);
  });

  it('23) pagamento parcial cancela SCHEDULED normais (cycleNumber != 0) com BALANCE_CHANGED, não toca cycleNumber 0 (promessa)', async () => {
    const client = mockClient({
      debt: { findUnique: vi.fn().mockResolvedValue(manualDebt({ currentBalanceCents: 10000n })), update: vi.fn().mockResolvedValue({}) },
    });

    await buildService(client).reconcile(900n, now);

    expect(client.collectionAttempt.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 10n, debtId: 1n, status: 'SCHEDULED', cycleNumber: { not: 0 } },
      data: { status: 'CANCELED', skippedAt: now, skipReason: 'BALANCE_CHANGED' },
    });
  });

  it('16) duas cobranças pagas em sequência acumulam corretamente (100 → 50 pago → 30 pago → saldo 20)', async () => {
    const client = mockClient({
      paymentGatewayCharge: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValueOnce(chargeRow({ id: 900n, amountCents: 5000n })).mockResolvedValueOnce(chargeRow({ id: 901n, amountCents: 3000n })),
        update: vi.fn().mockResolvedValue({}),
      },
      debt: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(manualDebt({ currentBalanceCents: 10000n }))
          .mockResolvedValueOnce(manualDebt({ currentBalanceCents: 5000n })), // saldo já refletindo o primeiro pagamento
        update: vi.fn().mockResolvedValue({}),
      },
      payment: {
        create: vi.fn().mockResolvedValueOnce({ id: 500n, publicId: 'payment-1' }).mockResolvedValueOnce({ id: 501n, publicId: 'payment-2' }),
        findFirst: vi.fn(),
      },
    });
    const service = buildService(client);

    await service.reconcile(900n, now);
    await service.reconcile(901n, now);

    expect((client.debt.update as any).mock.calls[0]?.[0]).toEqual({ where: { id: 1n }, data: { currentBalanceCents: 5000n } });
    // 100 - 50 = 50, depois 50 - 30 = 20 — saldo final R$ 20, continua OPEN.
    expect((client.debt.update as any).mock.calls[1]?.[0]).toEqual({
      where: { id: 1n },
      data: { currentBalanceCents: 2000n },
    });
  });

  it('17/18) overpayment (corrida entre duas cobranças): allocation limitada ao saldo, overflow registrado, Debt fica PAID sem saldo negativo', async () => {
    // saldo 30 restante; chega uma confirmação de R$ 50 (a outra cobrança de R$ 70 já zerou o saldo antes).
    const client = mockClient({
      debt: { findUnique: vi.fn().mockResolvedValue(manualDebt({ currentBalanceCents: 3000n })), update: vi.fn().mockResolvedValue({}) },
      paymentGatewayCharge: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue(chargeRow({ amountCents: 5000n })),
        update: vi.fn().mockResolvedValue({}),
      },
    });
    const debts = mockDebts();

    await buildService(client, debts).reconcile(900n, now);

    expect(client.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amountCents: 5000n }), // Payment registra o valor REAL recebido
    });
    expect(client.debtPaymentAllocation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amountCents: 3000n }), // Allocation limitada ao saldo restante
    });
    expect(client.debt.update).toHaveBeenCalledWith({
      where: { id: 1n },
      data: { currentBalanceCents: 0n, status: 'PAID', paidAt: now }, // nunca negativo
    });
    expect(debts.recordEvent).toHaveBeenCalledWith(
      10n,
      1n,
      'DEBT_PAYMENT_OVERFLOW',
      { paymentAmountCents: '5000', allocatedAmountCents: '3000', overflowCents: '2000' },
      client,
    );
  });

  it('19/20) claim perdido (webhook duplicado / reconcile concorrente): não duplica Payment nem Allocation', async () => {
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
        findUnique: vi.fn().mockResolvedValue(manualDebt({ currentBalanceCents: 10000n })),
        update: vi.fn().mockResolvedValue({}),
      },
    });
    const service = buildService(client);

    await service.reconcile(900n, now);
    await service.reconcile(900n, now);

    expect(client.payment.create).toHaveBeenCalledTimes(1);
    expect(client.debtPaymentAllocation.create).toHaveBeenCalledTimes(1);
  });

  it('claim perdido (outra execução já reconciliou) não processa nada', async () => {
    const client = mockClient({
      paymentGatewayCharge: { updateMany: vi.fn().mockResolvedValue({ count: 0 }), findUnique: vi.fn(), update: vi.fn() },
    });
    const debtFindUnique = vi.fn();
    (client as any).debt = { findUnique: debtFindUnique };

    await buildService(client).reconcile(900n, now);

    expect(debtFindUnique).not.toHaveBeenCalled();
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

    await buildService(client).reconcile(900n, now);

    expect(debtFindUnique).not.toHaveBeenCalled();
  });

  it('envia collection.partial_received (não debt_settled) quando o saldo não zera', async () => {
    const client = mockClient({
      debt: { findUnique: vi.fn().mockResolvedValue(manualDebt({ currentBalanceCents: 10000n })), update: vi.fn().mockResolvedValue({}) },
    });
    const notifications = mockNotifications();

    await buildService(client, mockDebts(), notifications).reconcile(900n, now);

    expect(notifications.enqueue).toHaveBeenCalledWith(
      10n,
      expect.objectContaining({ kind: 'collection.partial_received', recipient: '5511999999999' }),
    );
  });

  it('envia collection.debt_settled quando o saldo zera', async () => {
    const client = mockClient({
      debt: { findUnique: vi.fn().mockResolvedValue(manualDebt({ currentBalanceCents: 5000n })), update: vi.fn().mockResolvedValue({}) },
    });
    const notifications = mockNotifications();

    await buildService(client, mockDebts(), notifications).reconcile(900n, now);

    expect(notifications.enqueue).toHaveBeenCalledWith(10n, expect.objectContaining({ kind: 'collection.debt_settled' }));
  });
});

describe('DebtPixPaymentService.reconcile — Debt APPOINTMENT', () => {
  it('12/13) parcial cria Payment originType=APPOINTMENT via PaymentService.create() (fluxo canônico)', async () => {
    const client = mockClient({
      debt: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(appointmentDebt({ currentBalanceCents: 10000n }))
          .mockResolvedValueOnce({ status: 'OPEN', currentBalanceCents: 5000n }),
      },
    });
    const payments = mockPayments();

    await buildService(client, mockDebts(), mockNotifications(), mockPaymentMethods(), payments).reconcile(900n, now);

    expect(payments.create).toHaveBeenCalledWith(
      10n,
      'appointment-public-id',
      expect.objectContaining({ amountCents: 5000, paymentMethodPublicId: 'method-public-id' }),
      { userId: null, sessionId: null },
    );
    expect(client.debtPaymentAllocation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ debtId: 2n, paymentId: 500n, amountCents: 5000n, source: 'BOT_PIX' }),
    });
  });

  it('14) caixa/comissão/loyalty são preservados — via PaymentService.create() real, sem duplicar', async () => {
    const client = mockClient({
      debt: { findUnique: vi.fn().mockResolvedValueOnce(appointmentDebt()).mockResolvedValueOnce({ status: 'OPEN', currentBalanceCents: 5000n }) },
    });
    const payments = mockPayments();

    await buildService(client, mockDebts(), mockNotifications(), mockPaymentMethods(), payments).reconcile(900n, now);

    // PaymentService.create() já é responsável por caixa/comissão/loyalty internamente — não duplicado aqui.
    expect(payments.create).toHaveBeenCalledOnce();
  });

  it('15) saldo permanece OPEN quando o parcial não quita — sync já refletido pela releitura da Debt', async () => {
    const client = mockClient({
      debt: { findUnique: vi.fn().mockResolvedValueOnce(appointmentDebt()).mockResolvedValueOnce({ status: 'OPEN', currentBalanceCents: 5000n }) },
    });
    const notifications = mockNotifications();

    await buildService(client, mockDebts(), notifications).reconcile(900n, now);

    expect(client.collectionAttempt.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 10n, debtId: 2n, status: 'SCHEDULED', cycleNumber: { not: 0 } },
      data: { status: 'CANCELED', skippedAt: now, skipReason: 'BALANCE_CHANGED' },
    });
    expect(notifications.enqueue).toHaveBeenCalledWith(10n, expect.objectContaining({ kind: 'collection.partial_received' }));
  });

  it('quitação total: Debt PAID, promessa FULFILLED, cancela todos os SCHEDULED', async () => {
    const client = mockClient({
      debt: { findUnique: vi.fn().mockResolvedValueOnce(appointmentDebt()).mockResolvedValueOnce({ status: 'PAID', currentBalanceCents: 0n }) },
    });
    const paymentPromises = mockPaymentPromises();

    await buildService(client, mockDebts(), mockNotifications(), mockPaymentMethods(), mockPayments(), paymentPromises).reconcile(900n, now);

    expect(paymentPromises.fulfillActive).toHaveBeenCalledWith(10n, 2n);
    expect(client.collectionAttempt.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 10n, debtId: 2n, status: 'SCHEDULED' },
      data: { status: 'CANCELED', skippedAt: now, skipReason: 'DEBT_PAID' },
    });
  });

  it('overpayment num Agendamento: se PaymentService.create() rejeitar, a reconciliação propaga o erro (sem workaround silencioso)', async () => {
    const client = mockClient({
      debt: { findUnique: vi.fn().mockResolvedValue(appointmentDebt({ currentBalanceCents: 3000n })) },
    });
    const payments = mockPayments({
      create: vi.fn().mockRejectedValue(Object.assign(new Error('excede o saldo'), { code: 'PAYMENT_EXCEEDS_APPOINTMENT_PRICE' })),
    });

    await expect(
      buildService(client, mockDebts(), mockNotifications(), mockPaymentMethods(), payments).reconcile(900n, now),
    ).rejects.toThrow('excede o saldo');

    // Nada foi criado além da tentativa — sem Allocation, sem cancelar attempts, sem mensagem.
    expect(client.debtPaymentAllocation.create).not.toHaveBeenCalled();
  });
});
