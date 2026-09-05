import { describe, expect, it, vi } from 'vitest';

import { AppointmentOperationsService } from './appointment-operations.service.js';

import type { PrismaClient } from '../../database-client/client.js';

const appointment = (overrides: Record<string, unknown> = {}) => ({
  id: 1n,
  publicId: '00000000-0000-4000-8000-000000000001',
  status: 'CONFIRMED' as const,
  startsAt: new Date('2026-08-17T12:00:00.000Z'),
  priceCents: 9000n,
  professionalId: 5n,
  ...overrides,
});

function client(overrides: Record<string, unknown> = {}) {
  return {
    appointment: { findMany: vi.fn().mockResolvedValue([appointment()]) },
    professional: {
      findMany: vi.fn().mockResolvedValue([
        { id: 5n, publicId: '00000000-0000-4000-8000-000000000005', name: 'Rafael' },
      ]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    service: { findFirst: vi.fn().mockResolvedValue(null) },
    businessUnit: { findFirst: vi.fn().mockResolvedValue(null) },
    payment: { groupBy: vi.fn().mockResolvedValue([]) },
    couponRedemption: { groupBy: vi.fn().mockResolvedValue([]) },
    loyaltyLedgerEntry: { findMany: vi.fn().mockResolvedValue([]) },
    paymentGatewayCharge: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides,
  } as unknown as PrismaClient;
}

const query = {
  from: '2026-08-17T00:00:00.000-03:00',
  to: '2026-08-17T23:59:59.999-03:00',
  offsetMinutes: 180,
};

describe('AppointmentOperationsService.agendaOverview', () => {
  it('separa faturamento previsto de recebido e ignora cancelados na previsão', async () => {
    const service = new AppointmentOperationsService(
      client({
        appointment: {
          findMany: vi.fn().mockResolvedValue([
            appointment(),
            appointment({ id: 2n, publicId: '00000000-0000-4000-8000-000000000002' }),
            appointment({
              id: 3n,
              publicId: '00000000-0000-4000-8000-000000000003',
              status: 'CANCELED',
            }),
          ]),
        },
        payment: {
          groupBy: vi.fn().mockResolvedValue([{ appointmentId: 1n, _sum: { amountCents: 9000n } }]),
        },
      }),
    );
    const result = await service.agendaOverview(1n, query, { includeFinancial: true });
    expect(result.financial).toEqual({
      expectedCents: '18000',
      receivedCents: '9000',
      openCents: '9000',
    });
    expect(result.totals).toMatchObject({ appointments: 3, confirmed: 2, canceled: 1 });
    expect(result.payments[0]).toMatchObject({ state: 'PAID', receivedCents: '9000' });
    expect(result.payments[1]).toMatchObject({ state: 'ON_SITE', receivedCents: '0' });
  });

  it('desconta cupom e fidelidade do valor previsto, como o PaymentService', async () => {
    const service = new AppointmentOperationsService(
      client({
        couponRedemption: {
          groupBy: vi
            .fn()
            .mockResolvedValue([{ appointmentId: 1n, _sum: { discountAmountCents: 1000n } }]),
        },
        loyaltyLedgerEntry: {
          findMany: vi
            .fn()
            .mockResolvedValue([{ sourceAppointmentId: 1n, discountCentsApplied: 2000n }]),
        },
        payment: {
          groupBy: vi.fn().mockResolvedValue([{ appointmentId: 1n, _sum: { amountCents: 6000n } }]),
        },
      }),
    );
    const result = await service.agendaOverview(1n, query, { includeFinancial: true });
    expect(result.financial?.expectedCents).toBe('6000');
    expect(result.payments[0]?.state).toBe('PAID');
  });

  it('marca cobrança online sem confirmação como pendente, e não como recebimento', async () => {
    const service = new AppointmentOperationsService(
      client({
        paymentGatewayCharge: { findMany: vi.fn().mockResolvedValue([{ appointmentId: 1n }]) },
      }),
    );
    const result = await service.agendaOverview(1n, query, { includeFinancial: true });
    expect(result.payments[0]?.state).toBe('ONLINE_PENDING');
    expect(result.financial?.receivedCents).toBe('0');
  });

  it('não devolve dados financeiros sem permissão de leitura de pagamentos', async () => {
    const payment = { groupBy: vi.fn() };
    const service = new AppointmentOperationsService(client({ payment }));
    const result = await service.agendaOverview(1n, query, { includeFinancial: false });
    expect(result.financial).toBeNull();
    expect(result.payments).toEqual([]);
    expect(payment.groupBy).not.toHaveBeenCalled();
    expect(result.totals.appointments).toBe(1);
  });

  it('agrupa por hora local e por profissional', async () => {
    const service = new AppointmentOperationsService(client());
    const result = await service.agendaOverview(1n, query, { includeFinancial: false });
    // 12:00 UTC com offset de 180 minutos equivale a 09h local.
    expect(result.byHour).toEqual([{ hour: 9, total: 1 }]);
    expect(result.byProfessional).toEqual([
      {
        professionalPublicId: '00000000-0000-4000-8000-000000000005',
        professionalName: 'Rafael',
        total: 1,
      },
    ]);
  });

  it('rejeita filtro de profissional inexistente no estabelecimento', async () => {
    const service = new AppointmentOperationsService(client());
    await expect(
      service.agendaOverview(
        1n,
        { ...query, professionalPublicId: '00000000-0000-4000-8000-000000000404' },
        { includeFinancial: true },
      ),
    ).rejects.toThrow('Profissional não encontrado para este estabelecimento.');
  });
});
