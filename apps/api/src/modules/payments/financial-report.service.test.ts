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
  manualMovements: Array<{
    direction: 'IN' | 'OUT';
    amountCents: bigint;
    professionalPayoutId: bigint | null;
  }>;
  allMovements: Array<{ direction: 'IN' | 'OUT'; amountCents: bigint }>;
  commissionAmountCents: bigint;
  commissionCount: number;
}) {
  const client = {
    payment: {
      findMany: vi
        .fn()
        .mockResolvedValueOnce(data.legacyPayments)
        .mockResolvedValueOnce(data.receivedPayments),
      aggregate: vi.fn().mockResolvedValue({ _sum: { amountCents: 0n }, _count: 0 }),
    },
    cashMovement: {
      findMany: vi
        .fn()
        .mockResolvedValueOnce(data.manualMovements)
        .mockResolvedValueOnce(data.allMovements),
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
  };
  const delinquency = { list: vi.fn().mockResolvedValue({ totalBalanceCents: '0', items: [] }) };
  const service = new FinancialReportService(client as never, delinquency as never);
  Object.assign(service, { __testClient: client });
  return service;
}

async function summary(service: FinancialReportService) {
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
      unitId: null,
      professionalId: null,
      unitPublicId: undefined,
      professionalPublicId: undefined,
    })
    .then((result) => result.summary);
}

describe('FinancialReportService V1 consolidado', () => {
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

  it('mantém precisão BigInt e exporta as novas métricas sem Receita líquida', async () => {
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
    } as never;
    const csv = service.toCsv(report);

    expect(report.summary.debtRevenueCents).toBe(huge.toString());
    expect(csv).toContain('Receita recebida');
    expect(csv).toContain('Resultado operacional');
    expect(csv).toContain('Resultado de caixa');
    expect(csv).not.toContain('Receita líquida');
    expect(csv).toContain('90071992547409.93');
  });
});
