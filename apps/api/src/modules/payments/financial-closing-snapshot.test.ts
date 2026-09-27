import { describe, expect, it, vi } from 'vitest';

import { FinancialClosingService } from './financial-closing.service.js';

import type { PrismaClient } from '../../database-client/client.js';

const period = {
  periodFrom: '2026-07-17T00:00:00.000Z',
  periodTo: '2026-08-16T00:00:00.000Z',
};

const stored = (overrides: Record<string, unknown> = {}) => ({
  publicId: '00000000-0000-4000-8000-000000000001',
  unitId: null,
  periodFrom: new Date(period.periodFrom),
  periodTo: new Date(period.periodTo),
  totalReceivedCents: 11_000n,
  totalCanceledCents: 0n,
  depositTotalCents: 0n,
  manualInCents: 0n,
  manualOutCents: 0n,
  cashMovementsNetCents: 11_000n,
  commissionsTotalCents: 0n,
  balanceCents: 11_000n,
  paymentMethodBreakdown: [
    {
      paymentMethodPublicId: '00000000-0000-4000-8000-0000000000a1',
      paymentMethodName: 'PIX',
      totalCents: '11000',
      count: 2,
    },
  ],
  status: 'ACTIVE' as const,
  closedAt: new Date('2026-08-15T16:40:00.000Z'),
  canceledAt: null,
  canceledReason: null,
  unit: null,
  closedByUser: { email: 'rafael@exemplo.com' },
  ...overrides,
});

function build(overrides: Record<string, unknown> = {}) {
  const create = vi.fn().mockResolvedValue(stored());
  const findMany = vi.fn().mockResolvedValue([stored()]);
  const update = vi.fn().mockResolvedValue(
    stored({
      status: 'CANCELED',
      canceledAt: new Date('2026-08-16T10:00:00.000Z'),
      canceledReason: 'Período reaberto',
    }),
  );
  // `findFirst` também é usado para detectar sobreposição: sem fechamento ativo no período.
  const findFirst = vi.fn().mockResolvedValue(null);
  const client = {
    financialClosing: { create, findMany, update, findFirst },
    payment: {
      findMany: vi.fn().mockResolvedValue([
        {
          amountCents: 11_000n,
          paymentMethodId: 1n,
          paymentMethod: {
            publicId: '00000000-0000-4000-8000-0000000000a1',
            name: 'PIX',
          },
        },
      ]),
      aggregate: vi.fn().mockResolvedValue({ _sum: { amountCents: 0n } }),
    },
    cashMovement: { findMany: vi.fn().mockResolvedValue([]) },
    professionalCommission: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { commissionAmountCents: 0n } }),
    },
    businessUnit: { findFirst: vi.fn().mockResolvedValue({ id: 9n }) },
    auditLog: { create: vi.fn().mockResolvedValue(undefined) },
    ...overrides,
  } as unknown as PrismaClient;
  return { service: new FinancialClosingService(client), create, findMany, update, findFirst };
}

const actor = { userId: 7n, sessionId: 8n };

describe('fechamento financeiro', () => {
  it('grava o resultado apurado do período como um retrato persistido', async () => {
    const built = build();
    const result = await built.service.create(1n, period, actor);
    const data = built.create.mock.calls[0]?.[0] as { data: Record<string, unknown> } | undefined;
    // O snapshot é escrito no banco: recebido, formas de pagamento e resultado.
    expect(data?.data).toMatchObject({
      tenantId: 1n,
      totalReceivedCents: 11_000n,
      balanceCents: 11_000n,
    });
    expect(result.paymentMethodBreakdown[0]).toMatchObject({
      paymentMethodName: 'PIX',
      totalCents: '11000',
    });
    expect(result.status).toBe('ACTIVE');
  });

  it('a listagem devolve o snapshot salvo, sem recalcular o período', async () => {
    const built = build();
    const list = await built.service.list(1n, {});
    expect(list.items[0]).toMatchObject({
      totalReceivedCents: '11000',
      balanceCents: '11000',
      closedByEmail: 'rafael@exemplo.com',
    });
    // Nenhuma reapuração: os pagamentos não são lidos de novo para listar.
    expect(built.findMany).toHaveBeenCalledOnce();
  });

  it('cancelar preserva o registro, marca o status e guarda o motivo', async () => {
    const built = build();
    built.findFirst.mockResolvedValue(stored());
    const result = await built.service.cancel(
      1n,
      '00000000-0000-4000-8000-000000000001',
      'Período reaberto',
      actor,
    );
    expect(result.status).toBe('CANCELED');
    expect(result.canceledReason).toBe('Período reaberto');
    const call = built.update.mock.calls[0]?.[0] as { data: Record<string, unknown> } | undefined;
    expect(call?.data).toMatchObject({ status: 'CANCELED', canceledReason: 'Período reaberto' });
  });

  it('mantém o escopo do tenant na consulta e no cancelamento', async () => {
    const built = build();
    await built.service.list(9n, {});
    expect(built.findMany.mock.calls[0]?.[0]).toMatchObject({ where: { tenantId: 9n } });
    built.findFirst.mockResolvedValue(stored());
    await built.service.cancel(9n, '00000000-0000-4000-8000-000000000001', 'Motivo', actor);
    expect(built.findFirst.mock.calls[0]?.[0]).toMatchObject({ where: { tenantId: 9n } });
  });
});
