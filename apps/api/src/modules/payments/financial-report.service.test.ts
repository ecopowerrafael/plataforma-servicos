import { describe, expect, it, vi } from 'vitest';

import { FinancialReportService } from './financial-report.service.js';

const from = new Date('2026-01-01T00:00:00.000Z');
const to = new Date('2026-02-01T00:00:00.000Z');

function payment(amountCents: bigint, originType: string, paidAt: Date | null, createdAt: Date) {
  return {
    amountCents,
    kind: 'PAYMENT',
    paymentMethodId: 1n,
    paymentMethod: { publicId: 'cash', name: 'Dinheiro' },
    originType,
    paidAt,
    createdAt,
    appointment: null,
  };
}

function createService(data: {
  legacyPayments: ReturnType<typeof payment>[];
  receivedPayments: Array<{ amountCents: bigint; originType: string }>;
  unitReceivedPayments?: Array<{ amountCents: bigint; originType: string }>;
  manualMovements: Array<{
    direction: 'IN' | 'OUT';
    amountCents: bigint;
    professionalPayoutId: bigint | null;
  }>;
  unitManualMovements?: Array<{
    direction: 'IN' | 'OUT';
    amountCents: bigint;
    professionalPayoutId: bigint | null;
  }>;
  allMovements: Array<{ direction: 'IN' | 'OUT'; amountCents: bigint }>;
  commissionAmountCents: bigint;
  commissionCount: number;
  membershipReversals?: Array<{ type: 'REFUND' | 'CHARGEBACK'; amountCents: bigint }>;
}) {
  let paymentFindManyCall = 0;
  const client = {
    payment: {
      findMany: vi.fn(
        (args: { where: { paidAt?: unknown; originType?: string; appointment?: unknown } }) => {
          paymentFindManyCall += 1;
          if (paymentFindManyCall === 1) return Promise.resolve(data.legacyPayments);
          if (args.where.originType === 'MEMBERSHIP_CHARGE')
            return Promise.resolve(
              data.receivedPayments.filter((item) => item.originType === 'MEMBERSHIP_CHARGE'),
            );
          if (args.where.paidAt !== undefined)
            return Promise.resolve(data.unitReceivedPayments ?? data.receivedPayments);
          return Promise.resolve(data.legacyPayments);
        },
      ),
      aggregate: vi.fn().mockResolvedValue({ _sum: { amountCents: 0n }, _count: 0 }),
    },
    cashMovement: {
      findMany: vi.fn(
        (args: { where: { type?: string; cashRegister?: { unitId?: bigint | null } } }) => {
          if (args.where.type === 'MANUAL' && args.where.cashRegister?.unitId === null)
            return Promise.resolve(data.manualMovements);
          if (args.where.type === 'MANUAL')
            return Promise.resolve(data.unitManualMovements ?? data.manualMovements);
          return Promise.resolve(data.allMovements);
        },
      ),
    },
    professionalCommission: {
      aggregate: vi.fn().mockResolvedValue({
        _sum: { commissionAmountCents: data.commissionAmountCents },
        _count: data.commissionCount,
      }),
    },
    appointment: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { priceCents: 0n }, _count: 0 }),
    },
    customerMembershipFinancialReversal: {
      findMany: vi.fn().mockResolvedValue(data.membershipReversals ?? []),
    },
  };
  const delinquency = { list: vi.fn().mockResolvedValue({ totalBalanceCents: '0', items: [] }) };
  const service = new FinancialReportService(client as never, delinquency as never);
  Object.assign(service, { __testClient: client });
  return service;
}

async function summary(
  service: FinancialReportService,
  unitId: bigint | null = null,
  isUnitPartialView = false,
) {
  const builder = (
    service as unknown as {
      buildSummaryAndBreakdowns: (
        tenantId: bigint,
        filters: unknown,
      ) => Promise<{ summary: Record<string, string | number> }>;
    }
  ).buildSummaryAndBreakdowns;
  return builder
    .call(service, 1n, {
      from,
      to,
      unitId,
      professionalId: null,
      unitPublicId: undefined,
      professionalPublicId: undefined,
      isUnitPartialView,
    })
    .then((result) => result.summary);
}

describe('FinancialReportService V1 consolidado', () => {
  it('marca a visão unitária como parcial e separa valores globais sem incluí-los no resultado', async () => {
    const service = createService({
      legacyPayments: [],
      receivedPayments: [
        { amountCents: 100_000n, originType: 'APPOINTMENT' },
        { amountCents: 200_000n, originType: 'MEMBERSHIP_CHARGE' },
      ],
      unitReceivedPayments: [{ amountCents: 100_000n, originType: 'APPOINTMENT' }],
      manualMovements: [{ direction: 'OUT', amountCents: 60_000n, professionalPayoutId: 10n }],
      unitManualMovements: [],
      allMovements: [],
      commissionAmountCents: 10_000n,
      commissionCount: 1,
    });
    const result = await summary(service, 2n, true);

    expect(result.isUnitPartialView).toBe(true);
    expect(result.appointmentRevenueCents).toBe('100000');
    expect(result.membershipRevenueCents).toBe('0');
    expect(result.globalUnallocatedMembershipRevenueCents).toBe('200000');
    expect(result.globalUnallocatedProfessionalPayoutsCents).toBe('60000');
    expect(result.globalUnallocatedManualOutCents).toBe('0');
    expect(result.professionalPayoutsCents).toBe('0');
    expect(result.operatingResultCents).toBe('90000');
  });

  it('mantém a visão consolidada não parcial e zera indicadores globais informativos', async () => {
    const service = createService({
      legacyPayments: [],
      receivedPayments: [{ amountCents: 100_000n, originType: 'APPOINTMENT' }],
      manualMovements: [],
      allMovements: [],
      commissionAmountCents: 0n,
      commissionCount: 0,
    });
    const result = await summary(service);

    expect(result.isUnitPartialView).toBe(false);
    expect(result.globalUnallocatedMembershipRevenueCents).toBe('0');
    expect(result.globalUnallocatedProfessionalPayoutsCents).toBe('0');
    expect(result.globalUnallocatedManualOutCents).toBe('0');
  });

  it('separa origens e usa paidAt, sem fallback para createdAt ou CANCELED', async () => {
    const service = createService({
      legacyPayments: [payment(999n, 'APPOINTMENT', from, from)],
      receivedPayments: [
        { amountCents: 1_000_000n, originType: 'APPOINTMENT' },
        { amountCents: 200_000n, originType: 'MEMBERSHIP_CHARGE' },
        { amountCents: 300_000n, originType: 'DEBT' },
      ],
      manualMovements: [],
      allMovements: [],
      commissionAmountCents: 100_000n,
      commissionCount: 1,
    });
    const result = await summary(service);

    expect(result.appointmentRevenueCents).toBe('1000000');
    expect(result.membershipRevenueCents).toBe('200000');
    expect(result.debtRevenueCents).toBe('300000');
    expect(result.receivedRevenueCents).toBe('1500000');
    expect(result.traditionalCommissionsCents).toBe('100000');
    expect(result.netRevenueCents).toBe('-99001');
    const client = (
      service as unknown as {
        __testClient: {
          payment: { findMany: ReturnType<typeof vi.fn>; aggregate: ReturnType<typeof vi.fn> };
        };
      }
    ).__testClient;
    expect(client.payment.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PAID', paidAt: { gte: from, lt: to } }),
      }),
    );
    expect(client.payment.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'CANCELED' }),
      }),
    );
  });

  it('separa payout, reversão, outras saídas e entradas manuais', async () => {
    const service = createService({
      legacyPayments: [],
      receivedPayments: [{ amountCents: 1_000_000n, originType: 'APPOINTMENT' }],
      manualMovements: [
        { direction: 'OUT', amountCents: 60_000n, professionalPayoutId: 10n },
        { direction: 'IN', amountCents: 60_000n, professionalPayoutId: 10n },
        { direction: 'OUT', amountCents: 50_000n, professionalPayoutId: null },
        { direction: 'IN', amountCents: 25_000n, professionalPayoutId: null },
      ],
      allMovements: [
        { direction: 'IN', amountCents: 1_000_000n },
        { direction: 'OUT', amountCents: 60_000n },
        { direction: 'IN', amountCents: 60_000n },
        { direction: 'OUT', amountCents: 50_000n },
        { direction: 'IN', amountCents: 25_000n },
      ],
      commissionAmountCents: 100_000n,
      commissionCount: 1,
    });
    const result = await summary(service);

    expect(result.professionalPayoutsCents).toBe('0');
    expect(result.professionalPayoutReversalInCents).toBe('60000');
    expect(result.otherManualOutCents).toBe('50000');
    expect(result.otherManualInCents).toBe('25000');
    expect(result.operatingResultCents).toBe('850000');
    expect(result.cashResultCents).toBe('975000');
    expect(result.operatingResultCents).not.toBe(result.cashResultCents);
  });

  it('representa reversão isolada como repasse líquido negativo e aumenta o resultado operacional', async () => {
    const service = createService({
      legacyPayments: [],
      receivedPayments: [{ amountCents: 1_000_000n, originType: 'APPOINTMENT' }],
      manualMovements: [{ direction: 'IN', amountCents: 50_000n, professionalPayoutId: 10n }],
      allMovements: [
        { direction: 'IN', amountCents: 1_000_000n },
        { direction: 'IN', amountCents: 50_000n },
      ],
      commissionAmountCents: 100_000n,
      commissionCount: 1,
    });
    const result = await summary(service);
    const report = {
      summary: result,
      byPaymentMethod: [],
      byService: [],
      byProfessional: [],
      byUnit: [],
      comparison: null,
    } as unknown as Awaited<ReturnType<FinancialReportService['get']>>;
    const csv = service.toCsv(report);

    expect(result.professionalPayoutsCents).toBe('-50000');
    expect(result.operatingResultCents).toBe('950000');
    expect(csv).toContain('Repasses líquidos,-500.00');
  });

  it('mantém precisão BigInt e exporta as novas métricas', async () => {
    const huge = 9007199254740993n;
    const service = createService({
      legacyPayments: [],
      receivedPayments: [{ amountCents: huge, originType: 'DEBT' }],
      manualMovements: [],
      allMovements: [{ direction: 'IN', amountCents: huge }],
      commissionAmountCents: 0n,
      commissionCount: 0,
    });
    const report = {
      summary: await summary(service),
      byPaymentMethod: [],
      byService: [],
      byProfessional: [],
      byUnit: [],
      comparison: null,
    } as unknown as Awaited<ReturnType<FinancialReportService['get']>>;
    const csv = service.toCsv(report);

    expect(report.summary.debtRevenueCents).toBe(huge.toString());
    expect(csv).toContain('Receita recebida');
    expect(csv).toContain('Receita líquida');
    expect(csv).toContain('Resultado operacional');
    expect(csv).toContain('Resultado de caixa');
    expect(csv).toContain('90071992547409.93');
  });

  it('calcula refund e chargeback pela data efetiva sem alterar a receita bruta', async () => {
    const service = createService({
      legacyPayments: [payment(100n, 'MEMBERSHIP_CHARGE', from, from)],
      receivedPayments: [{ amountCents: 100n, originType: 'MEMBERSHIP_CHARGE' }],
      manualMovements: [],
      allMovements: [],
      commissionAmountCents: 0n,
      commissionCount: 0,
      membershipReversals: [
        { type: 'REFUND', amountCents: 60n },
        { type: 'CHARGEBACK', amountCents: 40n },
      ],
    });

    const result = await summary(service);

    expect(result.grossRevenueCents).toBe('100');
    expect(result.membershipRevenueCents).toBe('100');
    expect(result.membershipRefundsCents).toBe('60');
    expect(result.membershipChargebacksCents).toBe('40');
    expect(result.netMembershipRevenueCents).toBe('0');
    expect(result.netRevenueCents).toBe('0');
  });
});
