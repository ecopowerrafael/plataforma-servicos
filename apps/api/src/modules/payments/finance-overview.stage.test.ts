import { describe, expect, it, vi } from 'vitest';

import { FinanceOverviewService } from './finance-overview.service.js';
import { AppError } from '../../errors/AppError.js';

import type { DelinquencyService } from './delinquency.service.js';
import type { PrismaClient } from '../../database-client/client.js';

const period = { fromDate: '2026-08-01', toDate: '2026-08-31' };
const scope = { includeCommissions: true, includeCash: true };
const SEGREDO = 'connect ECONNREFUSED 10.0.0.7:3306 — senha do banco no log';

function build(overrides: Record<string, unknown> = {}, delinquencyList = vi.fn()) {
  const client = {
    appointment: { findMany: vi.fn().mockResolvedValue([]) },
    payment: { findMany: vi.fn().mockResolvedValue([]) },
    couponRedemption: { groupBy: vi.fn().mockResolvedValue([]) },
    loyaltyLedgerEntry: { findMany: vi.fn().mockResolvedValue([]) },
    cashMovement: { findMany: vi.fn().mockResolvedValue([]) },
    cashRegister: { findFirst: vi.fn().mockResolvedValue(null) },
    paymentGatewayCharge: { findMany: vi.fn().mockResolvedValue([]) },
    professionalCommission: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { commissionAmountCents: 0n } }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    professional: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
    businessUnit: { findFirst: vi.fn() },
    tenant: { findUnique: vi.fn().mockResolvedValue({ timezone: 'America/Sao_Paulo' }) },
    ...overrides,
  } as unknown as PrismaClient;
  const delinquency = {
    list: delinquencyList.getMockImplementation() === undefined
      ? delinquencyList.mockResolvedValue({ items: [], totalBalanceCents: '0' })
      : delinquencyList,
  } as unknown as DelinquencyService;
  return new FinanceOverviewService(client, delinquency);
}

const stageOf = (error: unknown) =>
  error instanceof AppError ? error.details?.[0]?.message : undefined;

describe('diagnóstico por etapa do painel financeiro', () => {
  it('identifica a etapa que falhou sem vazar a mensagem original', async () => {
    const service = build({}, vi.fn().mockRejectedValue(new Error(SEGREDO)));
    const error = await service.overview(1n, period, scope).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppError);
    const appError = error as AppError;
    expect(appError.code).toBe('FINANCE_OVERVIEW_STAGE_FAILED');
    expect(appError.statusCode).toBe(500);
    expect(appError.message).toBe('Não foi possível processar uma etapa do financeiro.');
    expect(appError.details).toEqual([{ path: 'stage', message: 'receivables' }]);
    // A causa fica disponível internamente, mas nada dela aparece na resposta.
    expect((appError.cause as Error).message).toBe(SEGREDO);
    expect(JSON.stringify({ code: appError.code, message: appError.message, details: appError.details })).not.toContain(
      '3306',
    );
  });

  it('aponta a etapa correta para cada bloco do painel', async () => {
    const cases: { stage: string; overrides: Record<string, unknown> }[] = [
      { stage: 'context', overrides: { tenant: { findUnique: vi.fn().mockRejectedValue(new Error(SEGREDO)) } } },
      {
        stage: 'billedAppointments',
        overrides: { appointment: { findMany: vi.fn().mockRejectedValue(new Error(SEGREDO)) } },
      },
      {
        stage: 'cash',
        overrides: { cashRegister: { findFirst: vi.fn().mockRejectedValue(new Error(SEGREDO)) } },
      },
      {
        stage: 'commissions',
        overrides: {
          professionalCommission: {
            aggregate: vi.fn().mockRejectedValue(new Error(SEGREDO)),
            findMany: vi.fn().mockResolvedValue([]),
          },
        },
      },
      {
        stage: 'professionals',
        overrides: {
          appointment: {
            findMany: vi
              .fn()
              .mockResolvedValue([
                { id: 1n, startsAt: new Date('2026-08-10T12:00:00.000Z'), priceCents: 1000n, professionalId: 5n },
              ]),
          },
          professional: { findMany: vi.fn().mockRejectedValue(new Error(SEGREDO)) },
        },
      },
    ];
    for (const item of cases) {
      const error = await build(item.overrides)
        .overview(1n, period, scope)
        .catch((caught: unknown) => caught);
      expect(stageOf(error), item.stage).toBe(item.stage);
    }
  });

  it('não converte erro conhecido do domínio em falha de etapa', async () => {
    const conhecido = new AppError({
      code: 'DELINQUENCY_FILTER_INVALID',
      message: 'Filtro inválido.',
      statusCode: 400,
    });
    const error = await build({}, vi.fn().mockRejectedValue(conhecido))
      .overview(1n, period, scope)
      .catch((caught: unknown) => caught);
    expect(error).toBe(conhecido);
  });
});
