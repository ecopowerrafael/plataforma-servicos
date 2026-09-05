import { describe, expect, it, vi } from 'vitest';

import { DelinquencyService } from './delinquency.service.js';

import type { PrismaClient } from '../../database-client/client.js';

const appointment = (overrides: Record<string, unknown> = {}) => ({
  id: 1n,
  publicId: '00000000-0000-4000-8000-000000000001',
  protocol: 'AGD-1',
  status: 'COMPLETED' as const,
  startsAt: new Date('2026-08-10T12:00:00.000Z'),
  priceCents: 10_000n,
  customer: { publicId: '00000000-0000-4000-8000-000000000002', name: 'João' },
  professional: { publicId: '00000000-0000-4000-8000-000000000003', name: 'Rafael' },
  service: { name: 'Corte' },
  unit: null,
  payments: [] as { amountCents: bigint }[],
  ...overrides,
});

function delinquency(options: {
  appointments?: ReturnType<typeof appointment>[];
  debts?: { publicId: string; status: string; currentBalanceCents: bigint; originAppointmentId: bigint }[];
}) {
  const findMany = vi.fn().mockResolvedValue(options.appointments ?? [appointment()]);
  const debtFindMany = vi.fn().mockResolvedValue(options.debts ?? []);
  const prisma = {
    appointment: { findMany },
    couponRedemption: { groupBy: vi.fn().mockResolvedValue([]) },
    loyaltyLedgerEntry: { findMany: vi.fn().mockResolvedValue([]) },
    paymentGatewayCharge: { findMany: vi.fn().mockResolvedValue([]) },
    debt: { findMany: debtFindMany },
  } as unknown as PrismaClient;
  return { service: new DelinquencyService(prisma), debtFindMany };
}

describe('DelinquencyService — integração com Bot Cobra (Debt)', () => {
  it('appointment sem Debt ativa: campos de dívida vêm nulos, sem recalcular saldo', async () => {
    const result = await delinquency({}).service.list(10n, {});
    expect(result.items[0]).toMatchObject({
      debtPublicId: null,
      debtStatus: null,
      debtCurrentBalanceCents: null,
      balanceCents: '10000',
    });
  });

  it('appointment com Debt ativa: expõe publicId/status/saldo já persistidos na Debt, sem duplicar cálculo', async () => {
    const debtPublicId = '00000000-0000-4000-8000-000000000099';
    const result = await delinquency({
      debts: [{ publicId: debtPublicId, status: 'PAUSED', currentBalanceCents: 6_000n, originAppointmentId: 1n }],
    }).service.list(10n, {});
    expect(result.items[0]).toMatchObject({
      debtPublicId,
      debtStatus: 'PAUSED',
      debtCurrentBalanceCents: '6000',
      // O saldo da pendência continua vindo do cálculo canônico existente, não da Debt.
      balanceCents: '10000',
    });
  });

  it('consulta dívidas ativas com tenantId correto, em lote (uma única chamada)', async () => {
    const many = Array.from({ length: 3 }, (_, index) =>
      appointment({ id: BigInt(index + 1), publicId: `00000000-0000-4000-8000-00000000001${String(index)}` }),
    );
    const built = delinquency({ appointments: many });
    await built.service.list(10n, {});
    expect(built.debtFindMany).toHaveBeenCalledTimes(1);
    expect(built.debtFindMany.mock.calls[0]?.[0]).toMatchObject({
      where: { tenantId: 10n, originAppointmentId: { in: [1n, 2n, 3n] }, status: { notIn: ['PAID', 'CANCELED'] } },
    });
  });
});
