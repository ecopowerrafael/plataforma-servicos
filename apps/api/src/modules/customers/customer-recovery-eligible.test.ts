import { describe, expect, it, vi } from 'vitest';

import { CustomerRecoveryService } from './customer-recovery.service.js';

import type { CustomerRecoveryRepository } from './customer-recovery.repository.js';
import type { CustomerNotificationDispatcher } from '../notifications/customer-notification-dispatcher.js';

const now = new Date('2026-08-15T12:00:00.000Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

const appointment = (overrides: Record<string, unknown> = {}) => ({
  publicId: '00000000-0000-4000-8000-000000000021',
  startsAt: daysAgo(100),
  status: 'COMPLETED' as const,
  service: { name: 'Corte' },
  professional: { publicName: 'Rafael' },
  ...overrides,
});

const customer = (overrides: Record<string, unknown> = {}) => ({
  id: 10n,
  publicId: '00000000-0000-4000-8000-000000000010',
  name: 'Cliente Recuperável',
  phone: '11999999999',
  birthDate: null,
  email: 'cliente@exemplo.com',
  pushSubscriptions: [],
  appointments: [appointment()],
  ...overrides,
});

const rule = (overrides: Record<string, unknown> = {}) => ({
  id: 1n,
  publicId: '00000000-0000-4000-8000-000000000001',
  tenantId: 1n,
  rule: 'INACTIVE' as const,
  active: true,
  days: 90,
  ...overrides,
});

function service(overrides: Record<string, unknown> = {}) {
  const repository = {
    ensureRules: vi.fn().mockResolvedValue(undefined),
    listRules: vi.fn().mockResolvedValue([rule()]),
    listCustomers: vi.fn().mockResolvedValue([customer()]),
    listActiveRules: vi.fn().mockResolvedValue([rule()]),
    listExecutions: vi.fn().mockResolvedValue([]),
    claim: vi.fn().mockResolvedValue({ publicId: '00000000-0000-4000-8000-0000000000e1' }),
    finish: vi.fn().mockResolvedValue(undefined),
    audit: vi.fn().mockResolvedValue(undefined),
    upsertRule: vi.fn(),
    ...overrides,
  } as unknown as CustomerRecoveryRepository;
  const dispatcher = { dispatch: vi.fn().mockResolvedValue(true) } as unknown as
    CustomerNotificationDispatcher;
  return { service: new CustomerRecoveryService(repository, dispatcher), repository, dispatcher };
}

describe('elegíveis de recuperação', () => {
  it('usa as réguas configuradas e devolve o contexto operacional agregado', async () => {
    const result = await service().service.eligible(1n, 'INACTIVE', now);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      customerPublicId: '00000000-0000-4000-8000-000000000010',
      rule: 'INACTIVE',
      phone: '11999999999',
      daysSinceReference: 100,
      lastServiceName: 'Corte',
      lastProfessionalName: 'Rafael',
      nextAppointmentAt: null,
    });
    expect(result.counts).toEqual({ INACTIVE: 1 });
  });

  it('respeita a janela da régua: dentro do prazo ninguém é elegível', async () => {
    const dentroDoPrazo = await service({
      listCustomers: vi
        .fn()
        .mockResolvedValue([customer({ appointments: [appointment({ startsAt: daysAgo(30) })] })]),
    }).service.eligible(1n, 'INACTIVE', now);
    expect(dentroDoPrazo.items).toHaveLength(0);
    expect(dentroDoPrazo.counts).toEqual({});
  });

  it('exclui quem já reagendou depois do atendimento de referência', async () => {
    const result = await service({
      listCustomers: vi.fn().mockResolvedValue([
        customer({
          appointments: [
            appointment({
              publicId: '00000000-0000-4000-8000-000000000022',
              startsAt: daysAgo(-5),
              status: 'CONFIRMED',
            }),
            appointment(),
          ],
        }),
      ]),
    }).service.eligible(1n, 'INACTIVE', now);
    expect(result.items).toHaveLength(0);
  });

  it('sem régua configurada não devolve elegíveis', async () => {
    const result = await service({ listRules: vi.fn().mockResolvedValue([]) }).service.eligible(
      1n,
      'INACTIVE',
      now,
    );
    expect(result.items).toHaveLength(0);
    expect(result.counts).toEqual({});
  });

  it('sem filtro cobre todas as réguas em uma única leitura de clientes', async () => {
    const listCustomers = vi.fn().mockResolvedValue([customer()]);
    const result = await service({
      listRules: vi
        .fn()
        .mockResolvedValue([
          rule(),
          rule({ id: 2n, rule: 'POST_SERVICE_NO_RETURN', days: 30, active: false }),
        ]),
      listCustomers,
    }).service.eligible(1n, undefined, now);
    // A contagem por régua acompanha exatamente a lista devolvida.
    expect(result.counts).toEqual({ INACTIVE: 1, POST_SERVICE_NO_RETURN: 1 });
    expect(result.items).toHaveLength(2);
    expect(listCustomers).toHaveBeenCalledOnce();
  });

  it('a régua inativa continua listando elegíveis, mas a execução ignora', async () => {
    const inativa = service({
      listRules: vi.fn().mockResolvedValue([rule({ active: false })]),
      listActiveRules: vi.fn().mockResolvedValue([]),
    });
    const listagem = await inativa.service.eligible(1n, 'INACTIVE', now);
    expect(listagem.items).toHaveLength(1);
    expect(await inativa.service.run(now, 1n)).toBe(0);
  });

  it('a execução em lote mantém o comportamento atual e respeita o tenant', async () => {
    const alvo = service();
    expect(await alvo.service.run(now, 1n)).toBe(1);
    expect(await alvo.service.run(now, 2n)).toBe(0);
  });

  it('elegíveis são lidos apenas do tenant informado', async () => {
    const listCustomers = vi.fn().mockResolvedValue([]);
    await service({ listCustomers }).service.eligible(7n, 'INACTIVE', now);
    expect(listCustomers).toHaveBeenCalledWith(7n);
  });
});
