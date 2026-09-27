import { describe, expect, it, vi } from 'vitest';

import { FinanceOverviewService } from './finance-overview.service.js';

import type { DelinquencyService } from './delinquency.service.js';
import type { PrismaClient } from '../../database-client/client.js';

/** Agosto inteiro em dias civis; o servico resolve os instantes no fuso do tenant. */
const period = { fromDate: '2026-08-01', toDate: '2026-08-31' };
const timezone = 'America/Sao_Paulo';

const appointment = (overrides: Record<string, unknown> = {}) => ({
  id: 1n,
  startsAt: new Date('2026-08-10T12:00:00.000Z'),
  priceCents: 10_000n,
  professionalId: 5n,
  ...overrides,
});

const payment = (overrides: Record<string, unknown> = {}) => ({
  amountCents: 9000n,
  kind: 'PAYMENT' as const,
  createdAt: new Date('2026-08-10T13:00:00.000Z'),
  paymentMethod: { publicId: '00000000-0000-4000-8000-0000000000a1', name: 'PIX' },
  appointment: {
    publicId: '00000000-0000-4000-8000-0000000000b1',
    professionalId: 5n,
    customer: { name: 'João' },
    service: { name: 'Corte' },
  },
  ...overrides,
});

interface Options {
  completed?: ReturnType<typeof appointment>[];
  paid?: ReturnType<typeof payment>[];
  coupons?: { appointmentId: bigint; _sum: { discountAmountCents: bigint } }[];
  loyalty?: { sourceAppointmentId: bigint; discountCentsApplied: bigint }[];
  delinquency?: {
    items: Record<string, unknown>[];
    totalBalanceCents: string;
    summary?: Record<string, unknown>;
  };
  gatewayCharges?: { status: string; appointment: { publicId: string } }[];
  movements?: {
    direction: string;
    amountCents: bigint;
    type: string;
    createdAt: Date;
    reason: string | null;
  }[];
  timezone?: string;
  unitTimezone?: string;
}

function build(options: Options = {}) {
  const appointmentFindMany = vi.fn().mockResolvedValue(options.completed ?? [appointment()]);
  const commissionAggregate = vi
    .fn()
    .mockResolvedValue({ _sum: { commissionAmountCents: 0n }, _count: 0 });
  const commissionFindMany = vi
    .fn()
    .mockResolvedValue([{ professionalId: 5n, commissionAmountCents: 1500n }]);
  const cashRegisterFindFirst = vi.fn().mockResolvedValue(null);
  const paymentFindMany = vi.fn(
    (args: { where: { status: string } }) =>
      args.where.status === 'PAID'
        ? Promise.resolve(options.paid ?? [payment()])
        : Promise.resolve([]),
  );
  const client = {
    appointment: { findMany: appointmentFindMany },
    payment: { findMany: paymentFindMany },
    couponRedemption: { groupBy: vi.fn().mockResolvedValue(options.coupons ?? []) },
    loyaltyLedgerEntry: { findMany: vi.fn().mockResolvedValue(options.loyalty ?? []) },
    cashMovement: { findMany: vi.fn().mockResolvedValue(options.movements ?? []) },
    cashRegister: { findFirst: cashRegisterFindFirst },
    paymentGatewayCharge: { findMany: vi.fn().mockResolvedValue(options.gatewayCharges ?? []) },
    professionalCommission: {
      aggregate: commissionAggregate,
      findMany: commissionFindMany,
    },
    professional: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { id: 5n, publicId: '00000000-0000-4000-8000-0000000000c1', name: 'Rafael' },
        ]),
      findFirst: vi.fn().mockResolvedValue({ id: 5n }),
    },
    businessUnit: {
      findFirst: vi.fn().mockResolvedValue({ id: 9n, timezone: options.unitTimezone ?? timezone }),
    },
    tenant: { findUnique: vi.fn().mockResolvedValue({ timezone: options.timezone ?? timezone }) },
  } as unknown as PrismaClient;
  const delinquency = {
    list: vi
      .fn()
      .mockResolvedValue(options.delinquency ?? { items: [], totalBalanceCents: '0' }),
  } as unknown as DelinquencyService;
  return {
    service: new FinanceOverviewService(client, delinquency),
    appointmentFindMany,
    paymentFindMany,
    commissionAggregate,
    commissionFindMany,
    cashRegisterFindFirst,
    delinquency,
  };
}

const scope = { includeCommissions: true, includeCash: true };

describe('painel financeiro', () => {
  it('separa faturado de recebido e nunca conta pagamento pendente como recebimento', async () => {
    const result = await build().service.overview(1n, period, scope);
    // Faturado: preço do atendimento concluído. Recebido: apenas o pagamento PAID.
    expect(result.totals.billedCents).toBe('10000');
    expect(result.totals.receivedCents).toBe('9000');
    expect(result.totals.completedAppointments).toBe(1);
    expect(result.totals.ticketAverageCents).toBe('10000');
  });

  it('desconta cupom e fidelidade do faturado, como o PaymentService', async () => {
    const result = await build({
      coupons: [{ appointmentId: 1n, _sum: { discountAmountCents: 1000n } }],
      loyalty: [{ sourceAppointmentId: 1n, discountCentsApplied: 2000n }],
    }).service.overview(1n, period, scope);
    expect(result.totals.billedCents).toBe('7000');
  });

  it('agrega formas de pagamento apenas com pagamentos confirmados', async () => {
    const result = await build({
      paid: [
        payment(),
        payment({
          amountCents: 4000n,
          paymentMethod: { publicId: '00000000-0000-4000-8000-0000000000a2', name: 'Cartão' },
        }),
      ],
    }).service.overview(1n, period, scope);
    expect(result.paymentMethods).toEqual([
      expect.objectContaining({ name: 'PIX', totalCents: '9000', count: 1 }),
      expect.objectContaining({ name: 'Cartão', totalCents: '4000', count: 1 }),
    ]);
    expect(result.totals.receivedCents).toBe('13000');
  });

  it('atribui faturado, recebido e comissão ao profissional correto', async () => {
    const result = await build().service.overview(1n, period, scope);
    expect(result.professionals[0]).toMatchObject({
      name: 'Rafael',
      billedCents: '10000',
      receivedCents: '9000',
      completedAppointments: 1,
      commissionsCents: '1500',
    });
  });

  it('separa a receber entre cobrança online aberta e recebimento no local', async () => {
    const result = await build({
      delinquency: {
        totalBalanceCents: '15000',
        summary: {
          totalBalanceCents: '15000',
          count: 2,
          onlinePendingCents: '5000',
          onlineFailedCents: '0',
          onSiteCents: '10000',
        },
        items: [
          {
            appointmentPublicId: '00000000-0000-4000-8000-0000000000b1',
            protocol: 'AGD-1',
            status: 'COMPLETED',
            startsAt: '2026-08-10T12:00:00.000Z',
            customerPublicId: '00000000-0000-4000-8000-0000000000d1',
            customerName: 'João',
            professionalPublicId: '00000000-0000-4000-8000-0000000000c1',
            professionalName: 'Rafael',
            unitPublicId: null,
            unitName: null,
            priceCents: '10000',
            paidCents: '0',
            balanceCents: '10000',
            state: 'ON_SITE',
          },
          {
            appointmentPublicId: '00000000-0000-4000-8000-0000000000b2',
            protocol: 'AGD-2',
            status: 'CONFIRMED',
            startsAt: '2026-08-12T12:00:00.000Z',
            customerPublicId: '00000000-0000-4000-8000-0000000000d2',
            customerName: 'Maria',
            professionalPublicId: '00000000-0000-4000-8000-0000000000c1',
            professionalName: 'Rafael',
            unitPublicId: null,
            unitName: null,
            priceCents: '5000',
            paidCents: '0',
            balanceCents: '5000',
            state: 'ONLINE_PENDING',
          },
        ],
      },
      gatewayCharges: [
        { status: 'PENDING', appointment: { publicId: '00000000-0000-4000-8000-0000000000b2' } },
      ],
    }).service.overview(1n, period, scope);
    expect(result.receivables).toMatchObject({
      totalCents: '15000',
      count: 2,
      onlinePendingCents: '5000',
      onlineFailedCents: '0',
      onSiteCents: '10000',
    });
    expect(result.receivables.top[0]?.state).toBe('ON_SITE');
  });

  it('cobranca online que falhou ou expirou nao conta como aguardando confirmacao', async () => {
    const result = await build({
      delinquency: {
        totalBalanceCents: '5000',
        summary: {
          totalBalanceCents: '5000',
          count: 1,
          onlinePendingCents: '0',
          onlineFailedCents: '5000',
          onSiteCents: '0',
        },
        items: [
          {
            appointmentPublicId: '00000000-0000-4000-8000-0000000000b2',
            protocol: 'AGD-2',
            status: 'CONFIRMED',
            startsAt: '2026-08-12T12:00:00.000Z',
            customerPublicId: '00000000-0000-4000-8000-0000000000d2',
            customerName: 'Maria',
            professionalPublicId: '00000000-0000-4000-8000-0000000000c1',
            professionalName: 'Rafael',
            unitPublicId: null,
            unitName: null,
            priceCents: '5000',
            paidCents: '0',
            balanceCents: '5000',
            state: 'ONLINE_FAILED',
          },
        ],
      },
    }).service.overview(1n, period, scope);
    expect(result.receivables.onlinePendingCents).toBe('0');
    expect(result.receivables.onlineFailedCents).toBe('5000');
    expect(result.receivables.top[0]?.state).toBe('ONLINE_FAILED');
  });

  it('cobranca criada antes do periodo e paga dentro dele conta no periodo do pagamento', async () => {
    const built = build({
      paid: [
        payment({
          // Payment so existe quando o dinheiro e confirmado: a cobranca podia ser de julho.
          createdAt: new Date('2026-08-20T15:00:00.000Z'),
          amountCents: 12_000n,
        }),
      ],
    });
    const result = await built.service.overview(1n, period, scope);
    expect(result.totals.receivedCents).toBe('12000');
    const paymentCall = built.paymentFindMany.mock.calls[0]?.[0] as
      | { where: { status: string; createdAt: unknown } }
      | undefined;
    expect(paymentCall?.where.status).toBe('PAID');
    expect(paymentCall?.where.createdAt).toBeDefined();
  });

  it('caixa distingue a parte que veio de pagamentos ja contados em recebido', async () => {
    const result = await build({
      movements: [
        {
          direction: 'IN',
          amountCents: 9000n,
          type: 'PAYMENT',
          createdAt: new Date('2026-08-10T13:00:00.000Z'),
          reason: null,
        },
        {
          direction: 'IN',
          amountCents: 5000n,
          type: 'MANUAL',
          createdAt: new Date('2026-08-11T13:00:00.000Z'),
          reason: 'Suprimento',
        },
        {
          direction: 'OUT',
          amountCents: 2000n,
          type: 'MANUAL',
          createdAt: new Date('2026-08-12T13:00:00.000Z'),
          reason: 'Sangria',
        },
      ],
    }).service.overview(1n, period, scope);
    expect(result.cash).toMatchObject({
      inCents: '14000',
      outCents: '2000',
      netCents: '12000',
      manualInCents: '5000',
      manualOutCents: '2000',
      paymentInCents: '9000',
    });
    // Recebido continua vindo dos pagamentos, nunca somado ao caixa.
    expect(result.totals.receivedCents).toBe('9000');
  });

  it('faturado nao muda quando o atendimento foi pago apenas em parte', async () => {
    const result = await build({
      paid: [payment({ amountCents: 3000n })],
    }).service.overview(1n, period, scope);
    expect(result.totals.billedCents).toBe('10000');
    expect(result.totals.receivedCents).toBe('3000');
  });

  it('agrupa o dia pelo fuso do estabelecimento, nao pelo UTC', async () => {
    // 01/09 03:00Z ainda e 31/08 em Sao Paulo (UTC-3).
    const built = build({
      completed: [
        appointment({ startsAt: new Date('2026-09-01T02:00:00.000Z'), priceCents: 8000n }),
      ],
      paid: [payment({ createdAt: new Date('2026-09-01T02:30:00.000Z'), amountCents: 8000n })],
    });
    const result = await built.service.overview(1n, period, scope);
    expect(result.series[0]?.key).toBe('2026-08-31');
    expect(result.timezone).toBe('America/Sao_Paulo');
    const call = built.appointmentFindMany.mock.calls[0]?.[0] as
      | { where: { startsAt: { gte: Date; lt: Date } } }
      | undefined;
    // 01/08 00:00 e 01/09 00:00 locais viram 03:00Z.
    expect(call?.where.startsAt.gte.toISOString()).toBe('2026-08-01T03:00:00.000Z');
    expect(call?.where.startsAt.lt.toISOString()).toBe('2026-09-01T03:00:00.000Z');
  });

  it('omite caixa e comissões sem as permissões correspondentes', async () => {
    const built = build();
    const result = await built.service.overview(1n, period, {
      includeCommissions: false,
      includeCash: false,
    });
    expect(result.commissions).toBeNull();
    expect(result.cash).toBeNull();
    // Sem permissão o servidor sequer consulta as tabelas.
    expect(built.commissionFindMany).not.toHaveBeenCalled();
    expect(built.cashRegisterFindFirst).not.toHaveBeenCalled();
    expect(result.professionals[0]?.commissionsCents).toBeNull();
  });

  it('aplica o período informado e o período anterior de mesmo tamanho', async () => {
    const built = build();
    const result = await built.service.overview(1n, period, scope);
    expect(result.period).toMatchObject({ fromDate: '2026-08-01', toDate: '2026-08-31' });
    // 31 dias no periodo atual: o anterior tem exatamente 31 dias e termina na vespera.
    expect(result.previousPeriod).toMatchObject({
      fromDate: '2026-07-01',
      toDate: '2026-07-31',
    });
    const call = built.appointmentFindMany.mock.calls[0]?.[0] as { where: unknown } | undefined;
    expect(call?.where).toMatchObject({ tenantId: 1n, status: 'COMPLETED' });
  });

  it('restringe as agregações ao tenant e aplica o filtro de unidade', async () => {
    const built = build();
    await built.service.overview(7n, { ...period, unitPublicId: '00000000-0000-4000-8000-00000000ff01' }, scope);
    const call = built.appointmentFindMany.mock.calls[0]?.[0] as { where: unknown } | undefined;
    expect(call?.where).toMatchObject({ tenantId: 7n, unitId: 9n });
    const paymentCall = built.paymentFindMany.mock.calls[0]?.[0] as { where: unknown } | undefined;
    expect(paymentCall?.where).toMatchObject({ tenantId: 7n });
  });

  it('a série do período traz faturado e recebido no mesmo ponto', async () => {
    const result = await build().service.overview(1n, period, scope);
    expect(result.series).toHaveLength(1);
    expect(result.series[0]).toMatchObject({ billedCents: '10000', receivedCents: '9000' });
  });

  it('sem período anterior comparável não inventa variação', async () => {
    const built = build({ completed: [], paid: [] });
    const result = await built.service.overview(1n, period, scope);
    expect(result.previousTotals).toBeNull();
    expect(result.totals).toMatchObject({ billedCents: '0', receivedCents: '0' });
  });
});
