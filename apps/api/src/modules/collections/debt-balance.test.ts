import { describe, expect, it, vi } from 'vitest';

import {
  activeDebtsByAppointment,
  calculateDebtBalance,
  processPendingDebtBalanceSync,
  syncAppointmentDebtBalance,
} from './debt-balance.js';

import type { PrismaClient } from '../../database-client/client.js';

function mockClient(overrides: Record<string, unknown> = {}) {
  return {
    debt: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
    debtEvent: { create: vi.fn().mockResolvedValue(undefined) },
    appointment: { findFirst: vi.fn() },
    couponRedemption: { groupBy: vi.fn().mockResolvedValue([]) },
    loyaltyLedgerEntry: { findMany: vi.fn().mockResolvedValue([]) },
    payment: { groupBy: vi.fn().mockResolvedValue([]) },
    ...overrides,
  } as unknown as PrismaClient;
}

const debtRow = (overrides: Record<string, unknown> = {}) => ({
  id: 1n,
  publicId: 'debt-uuid',
  tenantId: 10n,
  status: 'OPEN',
  currentBalanceCents: 10_000n,
  balanceSyncPending: false,
  originAppointmentId: 5n,
  ...overrides,
});

describe('calculateDebtBalance', () => {
  it('MANUAL devolve o valor informado direto', async () => {
    const client = mockClient();
    await expect(
      calculateDebtBalance(client, 10n, { originType: 'MANUAL', amountCents: 4_500n }),
    ).resolves.toBe(4_500n);
  });
});

describe('syncAppointmentDebtBalance', () => {
  it('1) no-op quando não há Debt para o Appointment (exceto CANCELED)', async () => {
    const client = mockClient({ debt: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() } });
    await syncAppointmentDebtBalance(client, 10n, 5n, 'PAYMENT_CREATED');
    expect((client as any).appointment.findFirst).not.toHaveBeenCalled();
    expect((client as any).debt.update).not.toHaveBeenCalled();
    expect((client as any).debt.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: { notIn: ['CANCELED'] } }) }),
    );
  });

  it('4) pagamento parcial reduz currentBalanceCents e grava só BALANCE_UPDATED', async () => {
    const client = mockClient({
      debt: { findFirst: vi.fn().mockResolvedValue(debtRow({ currentBalanceCents: 10_000n })), update: vi.fn() },
      appointment: { findFirst: vi.fn().mockResolvedValue({ priceCents: 10_000n }) },
      payment: { groupBy: vi.fn().mockResolvedValue([{ appointmentId: 5n, _sum: { amountCents: 4_000n } }]) },
    });

    await syncAppointmentDebtBalance(client, 10n, 5n, 'PAYMENT_CREATED');

    expect((client as any).debt.update).toHaveBeenCalledWith({
      where: { id: 1n },
      data: { currentBalanceCents: 6_000n, balanceSyncPending: false },
    });
    expect((client as any).debtEvent.create).toHaveBeenCalledTimes(1);
    expect((client as any).debtEvent.create).toHaveBeenCalledWith({
      data: {
        publicId: expect.any(String),
        tenantId: 10n,
        debtId: 1n,
        eventType: 'BALANCE_UPDATED',
        metadata: { previousBalanceCents: '10000', currentBalanceCents: '6000', source: 'PAYMENT_CREATED' },
      },
    });
  });

  it('5) pagamento total zera o saldo e marca Debt PAID com dois eventos', async () => {
    const client = mockClient({
      debt: { findFirst: vi.fn().mockResolvedValue(debtRow({ currentBalanceCents: 4_000n })), update: vi.fn() },
      appointment: { findFirst: vi.fn().mockResolvedValue({ priceCents: 10_000n }) },
      payment: { groupBy: vi.fn().mockResolvedValue([{ appointmentId: 5n, _sum: { amountCents: 10_000n } }]) },
    });

    await syncAppointmentDebtBalance(client, 10n, 5n, 'PAYMENT_CREATED');

    expect((client as any).debt.update).toHaveBeenCalledWith({
      where: { id: 1n },
      data: { currentBalanceCents: 0n, balanceSyncPending: false, status: 'PAID', paidAt: expect.any(Date) },
    });
    const events = (client as any).debtEvent.create.mock.calls.map((call: any[]) => call[0].data.eventType);
    expect(events).toEqual(['BALANCE_UPDATED', 'DEBT_PAID']);
  });

  it('6) cancelamento/estorno de Payment aumenta o saldo de volta', async () => {
    // Saldo já reduzido para 6000 por um pagamento de 4000; o pagamento é cancelado.
    const client = mockClient({
      debt: { findFirst: vi.fn().mockResolvedValue(debtRow({ currentBalanceCents: 6_000n })), update: vi.fn() },
      appointment: { findFirst: vi.fn().mockResolvedValue({ priceCents: 10_000n }) },
      payment: { groupBy: vi.fn().mockResolvedValue([]) }, // pagamento cancelado não soma mais
    });

    await syncAppointmentDebtBalance(client, 10n, 5n, 'PAYMENT_CANCELED');

    expect((client as any).debt.update).toHaveBeenCalledWith({
      where: { id: 1n },
      data: { currentBalanceCents: 10_000n, balanceSyncPending: false },
    });
    expect((client as any).debtEvent.create).toHaveBeenCalledWith({
      data: {
        publicId: expect.any(String),
        tenantId: 10n,
        debtId: 1n,
        eventType: 'BALANCE_UPDATED',
        metadata: { previousBalanceCents: '6000', currentBalanceCents: '10000', source: 'PAYMENT_CANCELED' },
      },
    });
  });

  it('não faz nada quando o saldo canônico não mudou e já não está pendente', async () => {
    const client = mockClient({
      debt: { findFirst: vi.fn().mockResolvedValue(debtRow({ currentBalanceCents: 6_000n })), update: vi.fn() },
      appointment: { findFirst: vi.fn().mockResolvedValue({ priceCents: 10_000n }) },
      payment: { groupBy: vi.fn().mockResolvedValue([{ appointmentId: 5n, _sum: { amountCents: 4_000n } }]) },
    });

    await syncAppointmentDebtBalance(client, 10n, 5n, 'PAYMENT_CREATED');

    expect((client as any).debt.update).not.toHaveBeenCalled();
    expect((client as any).debtEvent.create).not.toHaveBeenCalled();
  });

  it('3) saldo não mudou mas estava pendente: limpa a flag mesmo sem alterar o saldo', async () => {
    const client = mockClient({
      debt: {
        findFirst: vi
          .fn()
          .mockResolvedValue(debtRow({ currentBalanceCents: 6_000n, balanceSyncPending: true })),
        update: vi.fn(),
      },
      appointment: { findFirst: vi.fn().mockResolvedValue({ priceCents: 10_000n }) },
      payment: { groupBy: vi.fn().mockResolvedValue([{ appointmentId: 5n, _sum: { amountCents: 4_000n } }]) },
    });

    await syncAppointmentDebtBalance(client, 10n, 5n, 'RECOVERY_BATCH');

    expect((client as any).debt.update).toHaveBeenCalledWith({
      where: { id: 1n },
      data: { balanceSyncPending: false },
    });
    expect((client as any).debtEvent.create).not.toHaveBeenCalled();
  });

  it('7) tenant isolation: busca Debt e Appointment sempre filtrando tenantId', async () => {
    const client = mockClient({
      debt: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
    });
    await syncAppointmentDebtBalance(client, 10n, 5n, 'PAYMENT_CREATED');
    expect((client as any).debt.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 10n, originAppointmentId: 5n }) }),
    );

    const client2 = mockClient({
      debt: { findFirst: vi.fn().mockResolvedValue(debtRow({ currentBalanceCents: 6_000n })), update: vi.fn() },
      appointment: { findFirst: vi.fn().mockResolvedValue({ priceCents: 10_000n }) },
    });
    await syncAppointmentDebtBalance(client2, 10n, 5n, 'PAYMENT_CREATED');
    expect((client2 as any).appointment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 5n, tenantId: 10n } }),
    );
  });

  it('8) nunca cria um Payment novo (só lê e atualiza Debt/DebtEvent)', async () => {
    const paymentCreate = vi.fn();
    const client = mockClient({
      debt: { findFirst: vi.fn().mockResolvedValue(debtRow({ currentBalanceCents: 10_000n })), update: vi.fn() },
      appointment: { findFirst: vi.fn().mockResolvedValue({ priceCents: 10_000n }) },
      payment: { groupBy: vi.fn().mockResolvedValue([{ appointmentId: 5n, _sum: { amountCents: 10_000n } }]), create: paymentCreate },
    });

    await syncAppointmentDebtBalance(client, 10n, 5n, 'PAYMENT_CREATED');

    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it('9/10) BALANCE_UPDATED sempre grava metadata com source; DEBT_PAID só quando quita', async () => {
    const client = mockClient({
      debt: { findFirst: vi.fn().mockResolvedValue(debtRow({ currentBalanceCents: 10_000n })), update: vi.fn() },
      appointment: { findFirst: vi.fn().mockResolvedValue({ priceCents: 10_000n }) },
      payment: { groupBy: vi.fn().mockResolvedValue([{ appointmentId: 5n, _sum: { amountCents: 10_000n } }]) },
    });

    await syncAppointmentDebtBalance(client, 10n, 5n, 'PAYMENT_CREATED');

    const calls = (client as any).debtEvent.create.mock.calls as any[];
    expect(calls[0][0].data).toMatchObject({ eventType: 'BALANCE_UPDATED' });
    expect(calls[1][0].data).toMatchObject({ eventType: 'DEBT_PAID', metadata: { source: 'PAYMENT_CREATED' } });
  });

  describe('recuperação de falha', () => {
    it('1/2) sync falha (erro interno) → nunca lança, e marca balanceSyncPending = true', async () => {
      const client = mockClient({
        debt: { findFirst: vi.fn().mockResolvedValue(debtRow({ currentBalanceCents: 10_000n })), update: vi.fn() },
        appointment: { findFirst: vi.fn().mockRejectedValue(new Error('conexão perdida com o banco')) },
      });

      // 1) nunca propaga o erro — quem chama (ex.: PaymentService) não pode ser derrubado.
      await expect(syncAppointmentDebtBalance(client, 10n, 5n, 'PAYMENT_CREATED')).resolves.toBeUndefined();

      // 2) marca a Debt ativa para retry.
      expect((client as any).debt.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: { balanceSyncPending: true },
      });
      // Nenhum DebtEvent é criado quando a sincronização falhou de verdade.
      expect((client as any).debtEvent.create).not.toHaveBeenCalled();
    });

    it('mesmo se marcar balanceSyncPending também falhar, a função não lança', async () => {
      const client = mockClient({
        debt: {
          findFirst: vi.fn().mockResolvedValue(debtRow()),
          update: vi.fn().mockRejectedValue(new Error('também falhou')),
        },
        appointment: { findFirst: vi.fn().mockRejectedValue(new Error('conexão perdida')) },
      });
      await expect(syncAppointmentDebtBalance(client, 10n, 5n, 'PAYMENT_CREATED')).resolves.toBeUndefined();
    });
  });

  describe('reabertura após estorno de Debt já PAID', () => {
    it('4/5/6/7) Debt PAID + saldo volta a > 0 → reabre para OPEN, paidAt=null, evento DEBT_REOPENED', async () => {
      const client = mockClient({
        debt: {
          findFirst: vi
            .fn()
            .mockResolvedValue(debtRow({ status: 'PAID', currentBalanceCents: 0n })),
          update: vi.fn(),
        },
        appointment: { findFirst: vi.fn().mockResolvedValue({ priceCents: 10_000n }) },
        // pagamento que quitava foi cancelado → saldo pago cai, dívida reabre
        payment: { groupBy: vi.fn().mockResolvedValue([]) },
      });

      await syncAppointmentDebtBalance(client, 10n, 5n, 'PAYMENT_CANCELED');

      expect((client as any).debt.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: { currentBalanceCents: 10_000n, balanceSyncPending: false, status: 'OPEN', paidAt: null },
      });
      const events = (client as any).debtEvent.create.mock.calls.map((call: any[]) => call[0].data.eventType);
      expect(events).toEqual(['BALANCE_UPDATED', 'DEBT_REOPENED']);
    });
  });
});

describe('processPendingDebtBalanceSync', () => {
  it('3) sincroniza cada Debt pendente sequencialmente e limpa a flag', async () => {
    const debtFindFirst = vi
      .fn()
      .mockResolvedValue(debtRow({ id: 7n, currentBalanceCents: 6_000n, balanceSyncPending: true }));
    const debtFindMany = vi.fn().mockResolvedValue([{ tenantId: 10n, originAppointmentId: 5n }]);
    const debtUpdate = vi.fn();
    const client = mockClient({
      debt: { findFirst: debtFindFirst, findMany: debtFindMany, update: debtUpdate },
      appointment: { findFirst: vi.fn().mockResolvedValue({ priceCents: 10_000n }) },
      payment: { groupBy: vi.fn().mockResolvedValue([{ appointmentId: 5n, _sum: { amountCents: 4_000n } }]) },
    });

    const processed = await processPendingDebtBalanceSync(client, 50);

    expect(processed).toBe(1);
    expect(debtFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { originType: 'APPOINTMENT', balanceSyncPending: true, status: { notIn: ['PAID', 'CANCELED'] } },
        orderBy: { id: 'asc' },
        take: 50,
      }),
    );
    // A Debt pendente sincronizou de verdade (saldo mudou 6000 -> 6000? não, usa dados normais do teste 4).
    expect(debtUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7n }, data: expect.objectContaining({ balanceSyncPending: false }) }),
    );
  });

  it('8) o recovery batch nunca cria Payment', async () => {
    const paymentCreate = vi.fn();
    const client = mockClient({
      debt: {
        findFirst: vi.fn().mockResolvedValue(debtRow({ currentBalanceCents: 6_000n, balanceSyncPending: true })),
        findMany: vi.fn().mockResolvedValue([{ tenantId: 10n, originAppointmentId: 5n }]),
        update: vi.fn(),
      },
      appointment: { findFirst: vi.fn().mockResolvedValue({ priceCents: 10_000n }) },
      payment: {
        groupBy: vi.fn().mockResolvedValue([{ appointmentId: 5n, _sum: { amountCents: 4_000n } }]),
        create: paymentCreate,
      },
    });

    await processPendingDebtBalanceSync(client, 50);

    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it('processa no máximo `limit` por chamada, sem Promise.all de centenas', async () => {
    const debtFindMany = vi.fn().mockResolvedValue([]);
    const client = mockClient({ debt: { findMany: debtFindMany, findFirst: vi.fn(), update: vi.fn() } });
    await processPendingDebtBalanceSync(client, 5);
    expect(debtFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
  });
});

describe('activeDebtsByAppointment', () => {
  it('devolve um Map indexado por appointmentId, só com dívidas ativas', async () => {
    const client = mockClient({
      debt: {
        findMany: vi.fn().mockResolvedValue([
          { publicId: 'a', status: 'OPEN', currentBalanceCents: 5_000n, originAppointmentId: 1n },
          { publicId: 'b', status: 'PAUSED', currentBalanceCents: 2_000n, originAppointmentId: 2n },
        ]),
      },
    });
    const result = await activeDebtsByAppointment(client, 10n, [1n, 2n, 3n]);
    expect(result.get(1n)).toEqual({ publicId: 'a', status: 'OPEN', currentBalanceCents: 5_000n });
    expect(result.get(2n)).toEqual({ publicId: 'b', status: 'PAUSED', currentBalanceCents: 2_000n });
    expect(result.get(3n)).toBeUndefined();
  });

  it('não consulta nada quando a lista de appointmentIds está vazia', async () => {
    const findMany = vi.fn();
    const client = mockClient({ debt: { findMany } });
    const result = await activeDebtsByAppointment(client, 10n, []);
    expect(findMany).not.toHaveBeenCalled();
    expect(result.size).toBe(0);
  });
});
