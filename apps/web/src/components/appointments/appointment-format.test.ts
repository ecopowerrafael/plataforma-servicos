import { describe, expect, it } from 'vitest';

import {
  ACTION_LABELS,
  availableActions,
  formatDuration,
  formatMoneyCents,
  formatSource,
  initials,
  PAYMENT_STATE_LABELS,
  PAYMENT_STATE_TONE,
  periodRange,
  type AppointmentAbilities,
} from './appointment-format.js';
import { APPOINTMENT_STATUS_LABELS } from './appointment-status.js';

const abilities = (overrides: Partial<AppointmentAbilities> = {}): AppointmentAbilities => ({
  canManageStatus: true,
  canCheckIn: true,
  canCreate: true,
  canReadCustomers: true,
  canManagePayments: true,
  ...overrides,
});

const row = (
  overrides: Partial<Parameters<typeof availableActions>[0]> = {},
): Parameters<typeof availableActions>[0] => ({
  status: 'PENDING',
  checkedInAt: null,
  customerPhone: '11999999999',
  ...overrides,
});

describe('formatadores', () => {
  it('mostra dinheiro e duração em pt-BR, nunca o valor cru', () => {
    expect(formatMoneyCents('3500').replace(/\s/gu, ' ')).toBe('R$ 35,00');
    expect(formatMoneyCents(9000).replace(/\s/gu, ' ')).toBe('R$ 90,00');
    expect(formatDuration(30)).toBe('30 min');
    expect(formatDuration(90)).toBe('1h30');
    expect(formatDuration(120)).toBe('2h');
  });

  it('traduz status e origem sem inventar valores', () => {
    expect(APPOINTMENT_STATUS_LABELS.PENDING).toBe('Pendente');
    expect(APPOINTMENT_STATUS_LABELS.IN_PROGRESS).toBe('Em atendimento');
    expect(formatSource('PUBLIC_BOOKING')).toBe('Site');
    expect(formatSource('INTERNAL')).toBe('Painel');
    expect(formatSource('WAITLIST')).toBe('Lista de espera');
    // Origem desconhecida é exibida como veio, sem rótulo fictício.
    expect(formatSource('PARCEIRO_X')).toBe('PARCEIRO_X');
  });

  it('deriva iniciais do cliente', () => {
    expect(initials('João Silva')).toBe('JS');
    expect(initials('Ana')).toBe('A');
  });
});

describe('estados de pagamento', () => {
  it('mantém pagamento independente do atendimento, com os tons definidos', () => {
    expect(PAYMENT_STATE_LABELS.ON_SITE).toBe('No local');
    expect(PAYMENT_STATE_TONE.ON_SITE).toBe('warning');
    expect(PAYMENT_STATE_TONE.ONLINE_PENDING).toBe('danger');
    expect(PAYMENT_STATE_TONE.PAID).toBe('success');
    expect(PAYMENT_STATE_TONE.PARTIAL).toBe('warning');
  });
});

describe('período dos filtros', () => {
  it('cobre o dia inteiro do intervalo escolhido', () => {
    const custom = periodRange('custom', { from: '2026-08-17', to: '2026-08-19' });
    expect(new Date(custom.from).getHours()).toBe(0);
    expect(new Date(custom.to).getHours()).toBe(23);
    expect(new Date(custom.from) < new Date(custom.to)).toBe(true);
  });

  it('hoje começa e termina no mesmo dia', () => {
    const range = periodRange('today', { from: '', to: '' });
    expect(new Date(range.from).toDateString()).toBe(new Date(range.to).toDateString());
  });
});

describe('ações por estado e permissão', () => {
  it('oferece confirmar apenas para pendente', () => {
    expect(availableActions(row({ status: 'PENDING' }), abilities())).toContain('confirm');
    expect(availableActions(row({ status: 'CONFIRMED' }), abilities())).not.toContain('confirm');
  });

  it('não oferece transições para atendimentos encerrados', () => {
    for (const status of ['COMPLETED', 'CANCELED', 'NO_SHOW'] as const) {
      const actions = availableActions(row({ status }), abilities());
      expect(actions).not.toContain('complete');
      expect(actions).not.toContain('cancel');
      expect(actions).not.toContain('start');
      expect(actions).not.toContain('checkin');
    }
  });

  it('esconde check-in quando já houve chegada ou o atendimento começou', () => {
    expect(
      availableActions(row({ checkedInAt: '2026-08-17T12:00:00.000Z' }), abilities()),
    ).not.toContain('checkin');
    expect(availableActions(row({ status: 'IN_PROGRESS' }), abilities())).not.toContain('checkin');
  });

  it('respeita o RBAC de status, pagamento e cliente', () => {
    const semStatus = availableActions(row(), abilities({ canManageStatus: false }));
    expect(semStatus).not.toContain('confirm');
    expect(semStatus).not.toContain('cancel');
    expect(semStatus).not.toContain('complete');

    expect(availableActions(row(), abilities({ canManagePayments: false }))).not.toContain(
      'payment',
    );

    const semCliente = availableActions(row(), abilities({ canReadCustomers: false }));
    expect(semCliente).not.toContain('customer');
    expect(semCliente).not.toContain('whatsapp');
  });

  it('só mostra WhatsApp quando existe telefone', () => {
    expect(availableActions(row({ customerPhone: null }), abilities())).not.toContain('whatsapp');
    expect(availableActions(row(), abilities())).toContain('whatsapp');
  });

  it('toda ação disponível tem rótulo em português', () => {
    for (const action of availableActions(row(), abilities()))
      expect(ACTION_LABELS[action].length).toBeGreaterThan(0);
  });
});
