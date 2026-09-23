import { describe, expect, it, vi } from 'vitest';

import { CollectionRuleService } from './collection-rule.service.js';
import { DebtService } from './debt.service.js';

import type { PrismaClient } from '../../database-client/client.js';

const actor = { userId: 1n, sessionId: 1n };

function fakeDebtRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1n,
    publicId: '00000000-0000-4000-8000-000000000001',
    tenantId: 10n,
    originType: 'MANUAL',
    originAppointment: null,
    customer: null,
    unit: null,
    debtorName: 'Maria Silva',
    debtorWhatsapp: '5511999999999',
    debtorEmail: null,
    debtorDocument: null,
    description: 'Conta em aberto',
    originalAmountCents: 5000n,
    currentBalanceCents: 5000n,
    dueDate: new Date('2026-09-01T00:00:00.000Z'),
    status: 'OPEN',
    collectionRule: { publicId: '00000000-0000-4000-8000-000000000002' },
    collectionPausedAt: null,
    collectionPausedReason: null,
    canceledAt: null,
    canceledReason: null,
    paidAt: null,
    notes: null,
    createdAt: new Date('2026-08-20T00:00:00.000Z'),
    updatedAt: new Date('2026-08-20T00:00:00.000Z'),
    ...overrides,
  };
}

function mockClient(overrides: Record<string, unknown> = {}) {
  return {
    debt: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
    },
    debtEvent: { create: vi.fn().mockResolvedValue(undefined) },
    auditLog: { create: vi.fn().mockResolvedValue(undefined) },
    collectionRule: { findFirst: vi.fn().mockResolvedValue({ id: 2n, active: true }) },
    customer: { findFirst: vi.fn() },
    businessUnit: { findFirst: vi.fn() },
    appointment: { findFirst: vi.fn() },
    couponRedemption: { groupBy: vi.fn().mockResolvedValue([]) },
    loyaltyLedgerEntry: { findMany: vi.fn().mockResolvedValue([]) },
    payment: { groupBy: vi.fn().mockResolvedValue([]) },
    ...overrides,
  } as unknown as PrismaClient;
}

function buildService(client: PrismaClient) {
  return new DebtService(client, new CollectionRuleService(client));
}

const manualInput = (overrides: Record<string, unknown> = {}) => ({
  debtorName: 'Maria Silva',
  debtorWhatsapp: '5511999999999',
  description: 'Conta em aberto',
  amountCents: 5000,
  dueDate: '2026-09-01',
  collectionRulePublicId: '00000000-0000-4000-8000-000000000002',
  ...overrides,
});

describe('DebtService.createManual', () => {
  it('1) cria dívida manual sem Customer', async () => {
    const client = mockClient({
      debt: { findFirst: vi.fn(), create: vi.fn().mockResolvedValue(fakeDebtRow()), update: vi.fn() },
    });
    const result = await buildService(client).createManual(10n, manualInput(), actor);

    expect(result.customerPublicId).toBeNull();
    const createArgs = (client.debt.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(createArgs.data.customerId).toBeNull();
    expect(createArgs.data.originType).toBe('MANUAL');
    expect((client.customer.findFirst as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('2) cria dívida manual com Customer do mesmo tenant', async () => {
    const customerPublicId = '00000000-0000-4000-8000-000000000099';
    const client = mockClient({
      customer: { findFirst: vi.fn().mockResolvedValue({ id: 77n }) },
      debt: {
        findFirst: vi.fn(),
        create: vi.fn().mockResolvedValue(fakeDebtRow({ customer: { publicId: customerPublicId } })),
        update: vi.fn(),
      },
    });
    const result = await buildService(client).createManual(
      10n,
      manualInput({ customerPublicId }),
      actor,
    );

    expect(result.customerPublicId).toBe(customerPublicId);
    expect((client.customer.findFirst as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
      where: { tenantId: 10n, publicId: customerPublicId },
    });
    const createArgs = (client.debt.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(createArgs.data.customerId).toBe(77n);
  });

  it('3) rejeita Customer de outro tenant (findFirst filtra tenantId e não encontra)', async () => {
    const client = mockClient({ customer: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(
      buildService(client).createManual(10n, manualInput({ customerPublicId: 'cust-de-outro-tenant' }), actor),
    ).rejects.toMatchObject({ code: 'CUSTOMER_NOT_FOUND', statusCode: 404 });
  });

  it('11) rejeita CollectionRule de outro tenant', async () => {
    const client = mockClient({ collectionRule: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(buildService(client).createManual(10n, manualInput(), actor)).rejects.toMatchObject({
      code: 'COLLECTION_RULE_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('19/20) grava DebtEvent DEBT_CREATED', async () => {
    const client = mockClient({
      debt: { findFirst: vi.fn(), create: vi.fn().mockResolvedValue(fakeDebtRow()), update: vi.fn() },
    });
    await buildService(client).createManual(10n, manualInput(), actor);
    expect((client.debtEvent.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
      data: { eventType: 'DEBT_CREATED' },
    });
  });

  it('21) currentBalance inicial = originalAmount para dívida manual', async () => {
    const client = mockClient({
      debt: { findFirst: vi.fn(), create: vi.fn().mockResolvedValue(fakeDebtRow()), update: vi.fn() },
    });
    await buildService(client).createManual(10n, manualInput({ amountCents: 12_345 }), actor);
    const createArgs = (client.debt.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(createArgs.data.originalAmountCents).toBe(12_345n);
    expect(createArgs.data.currentBalanceCents).toBe(12_345n);
  });
});

const appointmentRow = (overrides: Record<string, unknown> = {}) => ({
  id: 5n,
  publicId: 'appt-uuid',
  protocol: 'AGD-1',
  priceCents: 10_000n,
  unitId: null,
  service: { name: 'Corte' },
  customer: {
    id: 77n,
    name: 'João Souza',
    whatsapp: '5511988887777',
    phone: null,
    email: 'joao@example.com',
    document: null,
  },
  ...overrides,
});

const fromAppointmentInput = (overrides: Record<string, unknown> = {}) => ({
  appointmentPublicId: 'appt-uuid',
  dueDate: '2026-09-01',
  collectionRulePublicId: '00000000-0000-4000-8000-000000000002',
  ...overrides,
});

describe('DebtService.createFromAppointment', () => {
  it('4) cria dívida a partir de Appointment', async () => {
    const client = mockClient({
      appointment: { findFirst: vi.fn().mockResolvedValue(appointmentRow()) },
      payment: { groupBy: vi.fn().mockResolvedValue([{ appointmentId: 5n, _sum: { amountCents: 4000n } }]) },
      debt: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(fakeDebtRow({ originType: 'APPOINTMENT' })),
        update: vi.fn(),
      },
    });
    const result = await buildService(client).createFromAppointment(10n, fromAppointmentInput(), actor);
    expect(result.originType).toBe('APPOINTMENT');
  });

  it('5) rejeita Appointment de outro tenant (findFirst filtra tenantId e não encontra)', async () => {
    const client = mockClient({ appointment: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(
      buildService(client).createFromAppointment(10n, fromAppointmentInput(), actor),
    ).rejects.toMatchObject({ code: 'APPOINTMENT_NOT_FOUND', statusCode: 404 });
  });

  it('6/22) usa o saldo canônico do Appointment (preço - desconto - pago), não priceCents bruto', async () => {
    const client = mockClient({
      appointment: {
        findFirst: vi.fn().mockResolvedValue(appointmentRow({ priceCents: 10_000n })),
      },
      couponRedemption: {
        groupBy: vi.fn().mockResolvedValue([{ appointmentId: 5n, _sum: { discountAmountCents: 1000n } }]),
      },
      payment: {
        groupBy: vi.fn().mockResolvedValue([{ appointmentId: 5n, _sum: { amountCents: 4000n } }]),
      },
      debt: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(fakeDebtRow()),
        update: vi.fn(),
      },
    });
    await buildService(client).createFromAppointment(10n, fromAppointmentInput(), actor);
    const createArgs = (client.debt.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    // saldo = (10000 - 1000 desconto) - 4000 pago = 5000, nunca 10000 (priceCents bruto)
    expect(createArgs.data.originalAmountCents).toBe(5000n);
    expect(createArgs.data.currentBalanceCents).toBe(5000n);
  });

  it('7) rejeita quando o Appointment não tem saldo em aberto', async () => {
    const client = mockClient({
      appointment: { findFirst: vi.fn().mockResolvedValue(appointmentRow({ priceCents: 4000n })) },
      payment: { groupBy: vi.fn().mockResolvedValue([{ appointmentId: 5n, _sum: { amountCents: 4000n } }]) },
    });
    await expect(
      buildService(client).createFromAppointment(10n, fromAppointmentInput(), actor),
    ).rejects.toMatchObject({ code: 'APPOINTMENT_NO_OPEN_BALANCE', statusCode: 409 });
  });

  it('8) rejeita quando já existe dívida ATIVA para o mesmo Appointment', async () => {
    const client = mockClient({
      appointment: { findFirst: vi.fn().mockResolvedValue(appointmentRow()) },
      debt: { findFirst: vi.fn().mockResolvedValue({ id: 99n }) },
    });
    await expect(
      buildService(client).createFromAppointment(10n, fromAppointmentInput(), actor),
    ).rejects.toMatchObject({ code: 'ACTIVE_DEBT_ALREADY_EXISTS', statusCode: 409 });
    const activeCheckArgs = (client.debt.findFirst as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      where: { status: { notIn: string[] } };
    };
    expect(activeCheckArgs.where.status.notIn).toEqual(['PAID', 'CANCELED']);
  });

  it('9) dívida anterior CANCELED permite nova dívida (query exclui PAID/CANCELED, findFirst não encontra ativa)', async () => {
    const client = mockClient({
      appointment: { findFirst: vi.fn().mockResolvedValue(appointmentRow()) },
      payment: { groupBy: vi.fn().mockResolvedValue([{ appointmentId: 5n, _sum: { amountCents: 0n } }]) },
      debt: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(fakeDebtRow()),
        update: vi.fn(),
      },
    });
    await expect(
      buildService(client).createFromAppointment(10n, fromAppointmentInput(), actor),
    ).resolves.toBeDefined();
  });

  it('10) dívida anterior PAID permite nova dívida (mesma query de exclusão)', async () => {
    const client = mockClient({
      appointment: { findFirst: vi.fn().mockResolvedValue(appointmentRow()) },
      payment: { groupBy: vi.fn().mockResolvedValue([{ appointmentId: 5n, _sum: { amountCents: 0n } }]) },
      debt: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(fakeDebtRow()),
        update: vi.fn(),
      },
    });
    await expect(
      buildService(client).createFromAppointment(10n, fromAppointmentInput(), actor),
    ).resolves.toBeDefined();
  });

  it('rejeita quando o cliente do agendamento não tem WhatsApp nem telefone', async () => {
    const client = mockClient({
      appointment: {
        findFirst: vi
          .fn()
          .mockResolvedValue(appointmentRow({ customer: { id: 77n, name: 'João', whatsapp: null, phone: null, email: null, document: null } })),
      },
      payment: { groupBy: vi.fn().mockResolvedValue([]) },
    });
    await expect(
      buildService(client).createFromAppointment(10n, fromAppointmentInput(), actor),
    ).rejects.toMatchObject({ code: 'CUSTOMER_WHATSAPP_MISSING', statusCode: 409 });
  });

  it('1) ação de um clique: sem collectionRulePublicId/dueDate, resolve régua padrão e usa hoje', async () => {
    const client = mockClient({
      appointment: { findFirst: vi.fn().mockResolvedValue(appointmentRow()) },
      payment: { groupBy: vi.fn().mockResolvedValue([{ appointmentId: 5n, _sum: { amountCents: 4000n } }]) },
      collectionRule: { findFirst: vi.fn().mockResolvedValue({ id: 9n, active: true }) },
      debt: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(fakeDebtRow()),
        update: vi.fn(),
      },
    });
    const result = await buildService(client).createFromAppointment(
      10n,
      { appointmentPublicId: 'appt-uuid' },
      actor,
    );
    expect(result).toBeDefined();
    const createArgs = (client.debt.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(createArgs.data.collectionRuleId).toBe(9n);
    const today = new Date().toISOString().slice(0, 10);
    expect((createArgs.data.dueDate as Date).toISOString().slice(0, 10)).toBe(today);
  });

  it('1b) ação de um clique cria a régua "Padrão" quando o tenant não tem nenhuma', async () => {
    const collectionRuleCreate = vi.fn().mockResolvedValue({ id: 42n });
    const client = mockClient({
      appointment: { findFirst: vi.fn().mockResolvedValue(appointmentRow()) },
      payment: { groupBy: vi.fn().mockResolvedValue([{ appointmentId: 5n, _sum: { amountCents: 4000n } }]) },
      collectionRule: { findFirst: vi.fn().mockResolvedValue(null), create: collectionRuleCreate },
      debt: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(fakeDebtRow()),
        update: vi.fn(),
      },
    });
    await buildService(client).createFromAppointment(10n, { appointmentPublicId: 'appt-uuid' }, actor);
    expect(collectionRuleCreate).toHaveBeenCalledTimes(1);
    const createArgs = (client.debt.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(createArgs.data.collectionRuleId).toBe(42n);
  });
});

describe('DebtService — list/detail tenant scoped', () => {
  it('12) list filtra por tenantId', async () => {
    const client = mockClient();
    await buildService(client).list(10n);
    expect((client.debt.findMany as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
      where: { tenantId: 10n },
    });
  });

  it('13) detail filtra por tenantId + publicId e rejeita se não encontrado', async () => {
    const client = mockClient({ debt: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(buildService(client).detail(10n, 'debt-de-outro-tenant')).rejects.toMatchObject({
      code: 'DEBT_NOT_FOUND',
      statusCode: 404,
    });
    expect((client.debt.findFirst as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
      where: { tenantId: 10n, publicId: 'debt-de-outro-tenant' },
    });
  });
});

describe('DebtService.update', () => {
  it('14) PATCH aplica apenas os campos administrativos informados', async () => {
    const client = mockClient({
      debt: {
        findFirst: vi.fn().mockResolvedValue(fakeDebtRow()),
        update: vi.fn().mockResolvedValue(fakeDebtRow({ description: 'Nova descrição' })),
      },
    });
    await buildService(client).update(10n, 'debt-uuid', { description: 'Nova descrição' }, actor);
    const updateArgs = (client.debt.update as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(updateArgs.data).toStrictEqual({ description: 'Nova descrição' });
  });

  it('15) PATCH nunca inclui amount/status/origin mesmo com múltiplos campos', async () => {
    const client = mockClient({
      debt: {
        findFirst: vi.fn().mockResolvedValue(fakeDebtRow()),
        update: vi.fn().mockResolvedValue(fakeDebtRow()),
      },
    });
    await buildService(client).update(
      10n,
      'debt-uuid',
      { description: 'X', dueDate: '2026-10-01', notes: 'obs' },
      actor,
    );
    const updateArgs = (client.debt.update as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    for (const forbidden of ['status', 'originType', 'originAppointmentId', 'originalAmountCents', 'currentBalanceCents', 'tenantId', 'customerId']) {
      expect(updateArgs.data).not.toHaveProperty(forbidden);
    }
  });

  it('20) PATCH grava DebtEvent DEBT_UPDATED', async () => {
    const client = mockClient({
      debt: {
        findFirst: vi.fn().mockResolvedValue(fakeDebtRow()),
        update: vi.fn().mockResolvedValue(fakeDebtRow()),
      },
    });
    await buildService(client).update(10n, 'debt-uuid', { notes: 'obs' }, actor);
    expect((client.debtEvent.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
      data: { eventType: 'DEBT_UPDATED' },
    });
  });
});

describe('DebtService — status actions', () => {
  it('16) pause: OPEN -> PAUSED', async () => {
    const client = mockClient({
      debt: {
        findFirst: vi.fn().mockResolvedValue(fakeDebtRow({ status: 'OPEN' })),
        update: vi.fn().mockResolvedValue(fakeDebtRow({ status: 'PAUSED' })),
      },
    });
    const result = await buildService(client).pause(10n, 'debt-uuid', {}, actor);
    expect(result.status).toBe('PAUSED');
    expect((client.debtEvent.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
      data: { eventType: 'DEBT_PAUSED' },
    });
  });

  it('pause rejeita quando não está OPEN', async () => {
    const client = mockClient({
      debt: { findFirst: vi.fn().mockResolvedValue(fakeDebtRow({ status: 'PAUSED' })) },
    });
    await expect(buildService(client).pause(10n, 'debt-uuid', {}, actor)).rejects.toMatchObject({
      code: 'DEBT_INVALID_STATUS_TRANSITION',
      statusCode: 409,
    });
  });

  it('17) resume: PAUSED -> OPEN', async () => {
    const client = mockClient({
      debt: {
        findFirst: vi.fn().mockResolvedValue(fakeDebtRow({ status: 'PAUSED' })),
        update: vi.fn().mockResolvedValue(fakeDebtRow({ status: 'OPEN' })),
      },
    });
    const result = await buildService(client).resume(10n, 'debt-uuid', actor);
    expect(result.status).toBe('OPEN');
    expect((client.debtEvent.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
      data: { eventType: 'DEBT_RESUMED' },
    });
  });

  it('resume rejeita quando não está PAUSED', async () => {
    const client = mockClient({
      debt: { findFirst: vi.fn().mockResolvedValue(fakeDebtRow({ status: 'OPEN' })) },
    });
    await expect(buildService(client).resume(10n, 'debt-uuid', actor)).rejects.toMatchObject({
      code: 'DEBT_INVALID_STATUS_TRANSITION',
      statusCode: 409,
    });
  });

  it('18) cancel: OPEN -> CANCELED', async () => {
    const client = mockClient({
      debt: {
        findFirst: vi.fn().mockResolvedValue(fakeDebtRow({ status: 'OPEN' })),
        update: vi.fn().mockResolvedValue(fakeDebtRow({ status: 'CANCELED' })),
      },
    });
    const result = await buildService(client).cancel(10n, 'debt-uuid', { reason: 'Cliente quitou fora do sistema' }, actor);
    expect(result.status).toBe('CANCELED');
    expect((client.debtEvent.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
      data: { eventType: 'DEBT_CANCELED' },
    });
  });

  it('18b) cancel: PAUSED -> CANCELED também é permitido', async () => {
    const client = mockClient({
      debt: {
        findFirst: vi.fn().mockResolvedValue(fakeDebtRow({ status: 'PAUSED' })),
        update: vi.fn().mockResolvedValue(fakeDebtRow({ status: 'CANCELED' })),
      },
    });
    await expect(
      buildService(client).cancel(10n, 'debt-uuid', { reason: 'Negociado fora do sistema' }, actor),
    ).resolves.toMatchObject({ status: 'CANCELED' });
  });

  it('cancel rejeita quando já está CANCELED', async () => {
    const client = mockClient({
      debt: { findFirst: vi.fn().mockResolvedValue(fakeDebtRow({ status: 'CANCELED' })) },
    });
    await expect(
      buildService(client).cancel(10n, 'debt-uuid', { reason: 'x' }, actor),
    ).rejects.toMatchObject({ code: 'DEBT_INVALID_STATUS_TRANSITION', statusCode: 409 });
  });
});

describe('DebtService.markHumanSupport (Fase 4 — transição automática via webhook)', () => {
  it('OPEN -> HUMAN_SUPPORT, registra o evento e não usa audit()', async () => {
    const client = mockClient({
      debt: {
        findFirst: vi.fn().mockResolvedValue(fakeDebtRow({ id: 1n, status: 'OPEN' })),
        update: vi.fn().mockResolvedValue(fakeDebtRow({ status: 'HUMAN_SUPPORT' })),
      },
    });
    await buildService(client).markHumanSupport(10n, 1n);

    expect(client.debt.update).toHaveBeenCalledWith({
      where: { id: 1n },
      data: { status: 'HUMAN_SUPPORT', humanSupportAt: expect.any(Date) },
    });
    expect((client.debtEvent.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
      data: { eventType: 'HUMAN_SUPPORT_REQUESTED' },
    });
    expect(client.auditLog.create).not.toHaveBeenCalled();
  });

  it.each(['HUMAN_SUPPORT', 'PAID', 'CANCELED'])('no-op silencioso quando já está %s', async (status) => {
    const client = mockClient({
      debt: { findFirst: vi.fn().mockResolvedValue(fakeDebtRow({ id: 1n, status })), update: vi.fn() },
    });
    await buildService(client).markHumanSupport(10n, 1n);
    expect(client.debt.update).not.toHaveBeenCalled();
    expect(client.debtEvent.create).not.toHaveBeenCalled();
  });

  it('no-op silencioso quando a Debt não existe', async () => {
    const client = mockClient({ debt: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() } });
    await expect(buildService(client).markHumanSupport(10n, 999n)).resolves.toBeUndefined();
    expect(client.debt.update).not.toHaveBeenCalled();
  });
});

describe('DebtService.markPromiseScheduled (Fase 5 — transição automática via webhook)', () => {
  it.each(['OPEN', 'PROMISE_SCHEDULED'])('%s -> PROMISE_SCHEDULED, registra o evento e não usa audit()', async (status) => {
    const client = mockClient({
      debt: {
        findFirst: vi.fn().mockResolvedValue(fakeDebtRow({ id: 1n, status })),
        update: vi.fn().mockResolvedValue(fakeDebtRow({ status: 'PROMISE_SCHEDULED' })),
      },
    });
    await buildService(client).markPromiseScheduled(10n, 1n);

    expect(client.debt.update).toHaveBeenCalledWith({
      where: { id: 1n },
      data: { status: 'PROMISE_SCHEDULED' },
    });
    expect((client.debtEvent.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
      data: { eventType: 'PAYMENT_PROMISE_CREATED' },
    });
    expect(client.auditLog.create).not.toHaveBeenCalled();
  });

  it.each(['HUMAN_SUPPORT', 'PAUSED', 'PAID', 'CANCELED'])('no-op quando não está OPEN nem PROMISE_SCHEDULED (%s)', async (status) => {
    const client = mockClient({
      debt: { findFirst: vi.fn().mockResolvedValue(fakeDebtRow({ id: 1n, status })), update: vi.fn() },
    });
    await buildService(client).markPromiseScheduled(10n, 1n);
    expect(client.debt.update).not.toHaveBeenCalled();
  });
});

describe('DebtService.resumeAfterPromiseOverdue (Fase 5 — varredura de promessa vencida)', () => {
  it('PROMISE_SCHEDULED -> OPEN, registra o evento e não usa audit()', async () => {
    const client = mockClient({
      debt: {
        findFirst: vi.fn().mockResolvedValue(fakeDebtRow({ id: 1n, status: 'PROMISE_SCHEDULED' })),
        update: vi.fn().mockResolvedValue(fakeDebtRow({ status: 'OPEN' })),
      },
    });
    await buildService(client).resumeAfterPromiseOverdue(10n, 1n);

    expect(client.debt.update).toHaveBeenCalledWith({ where: { id: 1n }, data: { status: 'OPEN' } });
    expect((client.debtEvent.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
      data: { eventType: 'PAYMENT_PROMISE_OVERDUE' },
    });
    expect(client.auditLog.create).not.toHaveBeenCalled();
  });

  it('no-op quando não está PROMISE_SCHEDULED', async () => {
    const client = mockClient({
      debt: { findFirst: vi.fn().mockResolvedValue(fakeDebtRow({ id: 1n, status: 'OPEN' })), update: vi.fn() },
    });
    await buildService(client).resumeAfterPromiseOverdue(10n, 1n);
    expect(client.debt.update).not.toHaveBeenCalled();
  });
});

describe('DebtService.markDisputed (Fase 5 — resposta "não reconheço esta cobrança")', () => {
  it('OPEN -> DISPUTED, registra o evento e não usa audit()', async () => {
    const client = mockClient({
      debt: {
        findFirst: vi.fn().mockResolvedValue(fakeDebtRow({ id: 1n, status: 'OPEN' })),
        update: vi.fn().mockResolvedValue(fakeDebtRow({ status: 'DISPUTED' })),
      },
    });
    await buildService(client).markDisputed(10n, 1n);

    expect(client.debt.update).toHaveBeenCalledWith({
      where: { id: 1n },
      data: { status: 'DISPUTED', disputedAt: expect.any(Date) },
    });
    expect((client.debtEvent.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
      data: { eventType: 'DEBT_DISPUTED' },
    });
    expect(client.auditLog.create).not.toHaveBeenCalled();
  });

  it.each(['DISPUTED', 'PAID', 'CANCELED'])('no-op silencioso quando já está %s', async (status) => {
    const client = mockClient({
      debt: { findFirst: vi.fn().mockResolvedValue(fakeDebtRow({ id: 1n, status })), update: vi.fn() },
    });
    await buildService(client).markDisputed(10n, 1n);
    expect(client.debt.update).not.toHaveBeenCalled();
  });
});
