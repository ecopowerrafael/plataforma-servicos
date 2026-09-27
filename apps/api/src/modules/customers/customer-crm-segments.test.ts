import { describe, expect, it, vi } from 'vitest';

import {
  averageIntervalDays,
  daysSince,
  deriveSegments,
  isRecoveryEligible,
  relationshipWindowsFromRules,
} from './customer-crm.js';
import { CustomerService } from './customer.service.js';

import type { CustomerRepository } from './customer.repository.js';

const now = new Date('2026-08-15T12:00:00.000Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
const windows = { noReturnAfterDays: 30, inactiveAfterDays: 90, newWithinDays: 30 };

const base = {
  createdAt: daysAgo(400),
  completedCount: 0,
  lastCompletedAt: null,
  nextAppointmentAt: null,
};

describe('segmentos derivados de relacionamento', () => {
  it('usa as janelas configuradas no módulo de Recuperação', () => {
    expect(
      relationshipWindowsFromRules([
        { rule: 'POST_SERVICE_NO_RETURN', days: 45, active: true },
        { rule: 'INACTIVE', days: 120, active: false },
      ]),
    ).toMatchObject({ noReturnAfterDays: 45, inactiveAfterDays: 120 });
    // Sem regra cadastrada não há corte inventado.
    expect(relationshipWindowsFromRules([])).toMatchObject({
      noReturnAfterDays: null,
      inactiveAfterDays: null,
    });
  });

  it('marca novo pelo cadastro recente e recorrente com mais de um concluído', () => {
    expect(deriveSegments({ ...base, createdAt: daysAgo(5) }, windows, now)).toContain('NEW');
    expect(deriveSegments({ ...base, createdAt: daysAgo(60) }, windows, now)).not.toContain('NEW');
    expect(deriveSegments({ ...base, completedCount: 1 }, windows, now)).not.toContain('RECURRING');
    expect(deriveSegments({ ...base, completedCount: 2 }, windows, now)).toContain('RECURRING');
  });

  it('quem tem agendamento futuro não conta como sem retorno nem inativo', () => {
    const segments = deriveSegments(
      {
        ...base,
        completedCount: 3,
        lastCompletedAt: daysAgo(200),
        nextAppointmentAt: new Date(now.getTime() + 86_400_000),
      },
      windows,
      now,
    );
    expect(segments).toContain('SCHEDULED');
    expect(segments).not.toContain('NO_RETURN');
    expect(segments).not.toContain('INACTIVE');
  });

  it('classifica sem retorno e inativo pelas janelas reais', () => {
    expect(
      deriveSegments({ ...base, completedCount: 1, lastCompletedAt: daysAgo(40) }, windows, now),
    ).toContain('NO_RETURN');
    expect(
      deriveSegments({ ...base, completedCount: 1, lastCompletedAt: daysAgo(20) }, windows, now),
    ).not.toContain('NO_RETURN');
    expect(
      deriveSegments({ ...base, completedCount: 1, lastCompletedAt: daysAgo(200) }, windows, now),
    ).toContain('INACTIVE');
  });

  it('sem janela configurada não classifica sem retorno', () => {
    const semRegra = { noReturnAfterDays: null, inactiveAfterDays: null, newWithinDays: 30 };
    expect(
      deriveSegments({ ...base, completedCount: 1, lastCompletedAt: daysAgo(400) }, semRegra, now),
    ).toEqual([]);
  });

  it('elegibilidade de recuperação exige a regra ligada', () => {
    expect(
      isRecoveryEligible(['NO_RETURN'], [{ rule: 'POST_SERVICE_NO_RETURN', days: 30, active: true }]),
    ).toBe(true);
    expect(
      isRecoveryEligible(
        ['NO_RETURN'],
        [{ rule: 'POST_SERVICE_NO_RETURN', days: 30, active: false }],
      ),
    ).toBe(false);
    expect(isRecoveryEligible(['RECURRING'], [{ rule: 'INACTIVE', days: 90, active: true }])).toBe(
      false,
    );
  });

  it('calcula dias desde a última visita e intervalo médio', () => {
    expect(daysSince(daysAgo(12), now)).toBe(12);
    expect(daysSince(null, now)).toBeNull();
    expect(averageIntervalDays([daysAgo(60), daysAgo(30), daysAgo(0)])).toBe(30);
    expect(averageIntervalDays([daysAgo(10)])).toBeNull();
  });
});

const customer = {
  id: 10n,
  publicId: '00000000-0000-4000-8000-000000000010',
  name: 'Cliente CRM',
  socialName: null,
  phone: '11999999999',
  whatsapp: null,
  email: null,
  birthDate: null,
  document: null,
  notes: null,
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
      .mockResolvedValue({ active: 4, scheduled: 2, new: 1, noReturn: 1, recurring: 3 }),
    ...overrides,
  } as unknown as CustomerRepository;
}

const listInput = {
  page: 1,
  limit: 20,
  orderBy: 'name' as const,
  direction: 'asc' as const,
};

describe('listagem CRM de clientes', () => {
  it('agrega em consultas únicas, sem uma requisição por cliente', async () => {
    const appointmentSummaries = vi.fn().mockResolvedValue([]);
    const highlightsByCustomer = vi.fn().mockResolvedValue([]);
    const paidTotalsByCustomer = vi.fn().mockResolvedValue([]);
    await new CustomerService(
      repository({ appointmentSummaries, highlightsByCustomer, paidTotalsByCustomer }),
    ).list(1n, listInput, { includeFinancial: true });
    expect(appointmentSummaries).toHaveBeenCalledOnce();
    expect(highlightsByCustomer).toHaveBeenCalledOnce();
    expect(paidTotalsByCustomer).toHaveBeenCalledOnce();
  });

  it('esconde valores financeiros sem permissão de pagamentos', async () => {
    const paidTotalsByCustomer = vi
      .fn()
      .mockResolvedValue([{ customerId: 10n, paidTotalCents: 5000n }]);
    const semPermissao = await new CustomerService(repository({ paidTotalsByCustomer })).list(
      1n,
      listInput,
    );
    expect(semPermissao.items[0]?.paidTotalCents).toBeNull();
    expect(semPermissao.items[0]?.averageTicketCents).toBeNull();
    expect(paidTotalsByCustomer).not.toHaveBeenCalled();
  });

  it('calcula ticket médio a partir dos atendimentos concluídos', async () => {
    const result = await new CustomerService(
      repository({
        appointmentSummaries: vi.fn().mockResolvedValue([
          {
            customerId: 10n,
            appointmentCount: 4n,
            lastCompletedAt: new Date('2026-08-01T12:00:00Z'),
            nextAppointmentAt: null,
          },
        ]),
        paidTotalsByCustomer: vi
          .fn()
          .mockResolvedValue([{ customerId: 10n, paidTotalCents: 40_000n }]),
      }),
    ).list(1n, listInput, { includeFinancial: true });
    expect(result.items[0]).toMatchObject({
      paidTotalCents: '40000',
      averageTicketCents: '10000',
      appointmentCount: 4,
    });
  });

  it('aceita o SUM do MySQL vindo como Decimal ou string, sem misturar com BigInt', async () => {
    // `$queryRaw` devolve Decimal/string para SUM(); a divisão do ticket médio é em BigInt.
    for (const paidTotalCents of ['40000', 40_000, { toString: () => '40000' }]) {
      const result = await new CustomerService(
        repository({
          appointmentSummaries: vi.fn().mockResolvedValue([
            {
              customerId: 10n,
              appointmentCount: 4n,
              lastCompletedAt: new Date('2026-08-01T12:00:00Z'),
              nextAppointmentAt: null,
            },
          ]),
          paidTotalsByCustomer: vi.fn().mockResolvedValue([{ customerId: 10n, paidTotalCents }]),
        }),
      ).list(1n, listInput, { includeFinancial: true });
      expect(result.items[0]).toMatchObject({
        paidTotalCents: '40000',
        averageTicketCents: '10000',
      });
    }
  });

  it('devolve os indicadores da base junto da página', async () => {
    const result = await new CustomerService(repository()).list(1n, listInput);
    expect(result.metrics).toMatchObject({ active: 4, scheduled: 2, noReturn: 1 });
  });

  it('preserva o isolamento de tenant na ficha 360', async () => {
    await expect(
      new CustomerService(repository({ find: vi.fn().mockResolvedValue(null) })).crmProfile(
        2n,
        customer.publicId,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('não consulta pagamentos da ficha sem permissão financeira', async () => {
    const paymentsForCustomer = vi.fn().mockResolvedValue([]);
    const result = await new CustomerService(repository({ paymentsForCustomer })).crmProfile(
      1n,
      customer.publicId,
    );
    expect(result.financial).toBeNull();
    expect(paymentsForCustomer).not.toHaveBeenCalled();
  });
});
