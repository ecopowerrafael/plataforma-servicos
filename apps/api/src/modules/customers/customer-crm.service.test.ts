import { describe, expect, it, vi } from 'vitest';

import { CustomerService } from './customer.service.js';

import type { CustomerRepository } from './customer.repository.js';

const customer = {
  id: 10n,
  publicId: '00000000-0000-4000-8000-000000000010',
  name: 'Cliente real',
  socialName: null,
  phone: '11999999999',
  whatsapp: null,
  email: 'cliente@exemplo.com',
  birthDate: null,
  document: null,
  notes: 'Observação operacional.',
  source: 'MANUAL',
  acceptsCommunications: true,
  primaryUnit: null,
  customFields: {},
  status: 'ACTIVE' as const,
  createdAt: new Date('2026-01-01T12:00:00.000Z'),
  updatedAt: new Date('2026-08-01T12:00:00.000Z'),
};

function repository(overrides: Record<string, unknown> = {}) {
  return {
    find: vi.fn().mockResolvedValue(customer),
    list: vi.fn().mockResolvedValue({ total: 1, items: [customer] }),
    appointmentSummaries: vi.fn().mockResolvedValue([]),
    appointmentsForCustomer: vi.fn().mockResolvedValue([]),
    loyaltyForCustomer: vi.fn().mockResolvedValue([]),
    couponsForCustomer: vi.fn().mockResolvedValue([]),
    waitlistForCustomer: vi.fn().mockResolvedValue([]),
    paymentsForCustomer: vi.fn().mockResolvedValue([]),
    reviewsForCustomer: vi.fn().mockResolvedValue([]),
    historyForCustomer: vi.fn().mockResolvedValue([]),
    recoveryRules: vi.fn().mockResolvedValue([]),
    whatsappConversation: vi.fn().mockResolvedValue(null),
    highlightsByCustomer: vi.fn().mockResolvedValue([]),
    paidTotalsByCustomer: vi.fn().mockResolvedValue([]),
    recurringCustomerIds: vi.fn().mockResolvedValue([]),
    crmMetrics: vi
      .fn()
      .mockResolvedValue({ active: 1, scheduled: 0, new: 0, noReturn: 0, recurring: 0 }),
    ...overrides,
  } as unknown as CustomerRepository;
}

describe('CustomerService CRM', () => {
  it('agrega a listagem em uma consulta de resumo, sem N+1 por cliente', async () => {
    const summary = vi.fn().mockResolvedValue([
      {
        customerId: 10n,
        appointmentCount: 4n,
        lastCompletedAt: new Date('2026-08-01T12:00:00Z'),
        nextAppointmentAt: null,
      },
    ]);
    const result = await new CustomerService(repository({ appointmentSummaries: summary })).list(
      1n,
      { page: 1, limit: 10, orderBy: 'name', direction: 'asc' },
    );
    expect(result.items[0]).toMatchObject({ appointmentCount: 4, nextAppointmentAt: null });
    expect(summary).toHaveBeenCalledOnce();
  });

  it('deriva próximo atendimento, histórico, recorrência e pagamentos reais', async () => {
    const future = new Date(Date.now() + 86_400_000);
    const result = await new CustomerService(
      repository({
        appointmentsForCustomer: vi.fn().mockResolvedValue([
          {
            publicId: '00000000-0000-4000-8000-000000000020',
            startsAt: future,
            priceCents: 5000n,
            status: 'CONFIRMED',
            professional: {
              publicId: '00000000-0000-4000-8000-000000000030',
              publicName: 'Ana',
            },
            service: {
              publicId: '00000000-0000-4000-8000-000000000040',
              name: 'Corte',
            },
            unit: null,
          },
          {
            publicId: '00000000-0000-4000-8000-000000000021',
            startsAt: new Date('2026-07-01T12:00:00Z'),
            priceCents: 5000n,
            status: 'COMPLETED',
            professional: {
              publicId: '00000000-0000-4000-8000-000000000030',
              publicName: 'Ana',
            },
            service: {
              publicId: '00000000-0000-4000-8000-000000000040',
              name: 'Corte',
            },
            unit: null,
          },
        ]),
        paymentsForCustomer: vi.fn().mockResolvedValue([
          {
            publicId: '00000000-0000-4000-8000-000000000050',
            amountCents: 5000n,
            kind: 'PAYMENT',
            createdAt: new Date('2026-07-01T13:00:00Z'),
            appointment: { publicId: '00000000-0000-4000-8000-000000000021' },
          },
        ]),
      }),
    ).crmProfile(1n, customer.publicId, { includeFinancial: true });
    expect(result.summary.nextAppointment?.serviceName).toBe('Corte');
    expect(result.summary.recurringProfessionals[0]).toMatchObject({ name: 'Ana', count: 1 });
    expect(result.financial).toMatchObject({ paidTotalCents: '5000', paidCount: 1 });
  });

  it('preserva isolamento de tenant retornando 404 quando o cliente não pertence ao contexto', async () => {
    await expect(
      new CustomerService(repository({ find: vi.fn().mockResolvedValue(null) })).crmProfile(
        2n,
        customer.publicId,
      ),
    ).rejects.toMatchObject({ code: 'CUSTOMER_NOT_FOUND', statusCode: 404 });
  });
});
