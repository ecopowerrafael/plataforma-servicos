import { describe, expect, it, vi } from 'vitest';

import {
  balanceCents,
  discountsByAppointment,
  netPriceCents,
  paidByAppointment,
} from './appointment-balance.js';
import { DelinquencyService } from './delinquency.service.js';

import type { PrismaClient } from '../../database-client/client.js';

describe('saldo devido do agendamento', () => {
  it('A) preço 100, cupom 20, fidelidade 10, pago 0 → saldo 70', () => {
    expect(netPriceCents(10_000n, 3000n)).toBe(7000n);
    expect(balanceCents(10_000n, 3000n, 0n)).toBe(7000n);
  });

  it('B) preço 100, desconto 30, pago 40 → saldo 30', () => {
    expect(balanceCents(10_000n, 3000n, 4000n)).toBe(3000n);
  });

  it('C) desconto cobre o preço inteiro → saldo 0, nunca negativo', () => {
    expect(netPriceCents(10_000n, 10_000n)).toBe(0n);
    expect(balanceCents(10_000n, 12_000n, 0n)).toBe(0n);
  });

  it('D) líquido 70 com 70 pagos → quitado', () => {
    expect(balanceCents(10_000n, 3000n, 7000n)).toBe(0n);
    // Pagamento acima do líquido também não vira saldo negativo.
    expect(balanceCents(10_000n, 3000n, 9000n)).toBe(0n);
  });
});

const client = (overrides: Record<string, unknown> = {}) =>
  ({
    couponRedemption: { groupBy: vi.fn().mockResolvedValue([]) },
    loyaltyLedgerEntry: { findMany: vi.fn().mockResolvedValue([]) },
    payment: { groupBy: vi.fn().mockResolvedValue([]) },
    ...overrides,
  }) as unknown as PrismaClient;

describe('leitura agregada de descontos e pagamentos', () => {
  it('soma cupom e fidelidade por agendamento em duas consultas', async () => {
    const result = await discountsByAppointment(
      client({
        couponRedemption: {
          groupBy: vi
            .fn()
            .mockResolvedValue([{ appointmentId: 1n, _sum: { discountAmountCents: 2000n } }]),
        },
        loyaltyLedgerEntry: {
          findMany: vi
            .fn()
            .mockResolvedValue([{ sourceAppointmentId: 1n, discountCentsApplied: 1000n }]),
        },
      }),
      1n,
      [1n],
    );
    expect(result.get(1n)).toBe(3000n);
  });

  it('E/F/G) só pagamento PAID reduz saldo — pendente, cancelado e estorno não', async () => {
    const groupBy = vi.fn().mockResolvedValue([{ appointmentId: 1n, _sum: { amountCents: 4000n } }]);
    const result = await paidByAppointment(client({ payment: { groupBy } }), 1n, [1n]);
    expect(result.get(1n)).toBe(4000n);
    // O filtro é explícito: qualquer outro status fica de fora da soma.
    expect(groupBy.mock.calls[0]?.[0]).toMatchObject({
      where: { tenantId: 1n, status: 'PAID' },
    });
  });

  it('não consulta nada quando não há agendamentos', async () => {
    const couponGroupBy = vi.fn();
    const paymentGroupBy = vi.fn();
    await discountsByAppointment(
      client({ couponRedemption: { groupBy: couponGroupBy } }),
      1n,
      [],
    );
    await paidByAppointment(client({ payment: { groupBy: paymentGroupBy } }), 1n, []);
    expect(couponGroupBy).not.toHaveBeenCalled();
    expect(paymentGroupBy).not.toHaveBeenCalled();
  });
});

const appointment = (overrides: Record<string, unknown> = {}) => ({
  id: 1n,
  publicId: '00000000-0000-4000-8000-000000000001',
  protocol: 'AGD-1',
  status: 'COMPLETED' as const,
  startsAt: new Date('2026-08-10T12:00:00.000Z'),
  priceCents: 10_000n,
  customer: { publicId: '00000000-0000-4000-8000-000000000002', name: 'João' },
  professional: { publicId: '00000000-0000-4000-8000-000000000003', name: 'Rafael' },
  unit: null,
  payments: [] as { amountCents: bigint }[],
  ...overrides,
});

function delinquency(options: {
  appointments?: ReturnType<typeof appointment>[];
  coupons?: { appointmentId: bigint; _sum: { discountAmountCents: bigint } }[];
  loyalty?: { sourceAppointmentId: bigint; discountCentsApplied: bigint }[];
}) {
  const findMany = vi.fn().mockResolvedValue(options.appointments ?? [appointment()]);
  const prisma = {
    appointment: { findMany },
    couponRedemption: { groupBy: vi.fn().mockResolvedValue(options.coupons ?? []) },
    loyaltyLedgerEntry: { findMany: vi.fn().mockResolvedValue(options.loyalty ?? []) },
  } as unknown as PrismaClient;
  return { service: new DelinquencyService(prisma), findMany };
}

describe('DelinquencyService usa o valor líquido', () => {
  it('desconta cupom e fidelidade do saldo devido', async () => {
    const result = await delinquency({
      coupons: [{ appointmentId: 1n, _sum: { discountAmountCents: 2000n } }],
      loyalty: [{ sourceAppointmentId: 1n, discountCentsApplied: 1000n }],
    }).service.list(1n, {});
    expect(result.totalBalanceCents).toBe('7000');
    expect(result.items[0]?.balanceCents).toBe('7000');
  });

  it('some da lista quando o desconto e o pagamento quitam o atendimento', async () => {
    const result = await delinquency({
      appointments: [appointment({ payments: [{ amountCents: 7000n }] })],
      coupons: [{ appointmentId: 1n, _sum: { discountAmountCents: 3000n } }],
    }).service.list(1n, {});
    expect(result.items).toHaveLength(0);
    expect(result.totalBalanceCents).toBe('0');
  });

  it('mantém os critérios de elegibilidade existentes: só o valor mudou', async () => {
    const built = delinquency({});
    await built.service.list(1n, { status: 'COMPLETED' });
    const where = built.findMany.mock.calls[0]?.[0] as { where: unknown } | undefined;
    // Continua excluindo cancelados e respeitando o filtro de status recebido.
    expect(where?.where).toMatchObject({
      tenantId: 1n,
      status: { not: 'CANCELED', equals: 'COMPLETED' },
    });
  });

  it('pagamento parcial deixa apenas o restante do líquido em aberto', async () => {
    const result = await delinquency({
      appointments: [appointment({ payments: [{ amountCents: 4000n }] })],
      coupons: [{ appointmentId: 1n, _sum: { discountAmountCents: 3000n } }],
    }).service.list(1n, {});
    expect(result.items[0]).toMatchObject({ paidCents: '4000', balanceCents: '3000' });
  });
});
