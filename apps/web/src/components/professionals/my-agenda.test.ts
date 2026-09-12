import { describe, expect, it } from 'vitest';

import {
  addDays,
  buildTimeline,
  dayKey,
  freeBlocks,
  isOverdue,
  nextAppointment,
  primaryAction,
  type Appointment,
} from './my-agenda.js';

const appointment = (overrides: Partial<Appointment> = {}): Appointment => ({
  publicId: overrides.publicId ?? '00000000-0000-4000-8000-000000000001',
  protocol: 'AGD-1',
  customerPublicId: '00000000-0000-4000-8000-0000000000c1',
  customerName: 'João Silva',
  customerPhone: '11999999999',
  kind: 'STANDARD',
  treatmentPlanPublicId: null,
  sessionNumber: null,
  professionalPublicId: '00000000-0000-4000-8000-0000000000p1',
  professionalName: 'Rafael',
  servicePublicId: '00000000-0000-4000-8000-0000000000s1',
  serviceName: 'Corte',
  unitPublicId: null,
  unitName: null,
  startsAt: '2026-08-17T12:00:00.000Z',
  endsAt: '2026-08-17T12:30:00.000Z',
  durationMinutes: 30,
  postServiceBreakMinutes: 0,
  priceCents: '9000',
  status: 'CONFIRMED',
  notes: null,
  source: 'INTERNAL',
  canceledReason: null,
  rescheduleReason: null,
  isFitIn: false,
  fitInReason: null,
  checkedInAt: null,
  depositType: null,
  depositPercentage: null,
  depositAmountCents: null,
  createdAt: '2026-08-01T12:00:00.000Z',
  updatedAt: '2026-08-01T12:00:00.000Z',
  ...overrides,
});

const slot = (startsAt: string, endsAt: string, state: 'AVAILABLE' | 'BLOCKED' = 'AVAILABLE') => ({
  startsAt,
  endsAt,
  state,
  reason: null,
});

const now = new Date('2026-08-17T11:00:00.000Z');

describe('próximo atendimento', () => {
  it('escolhe o primeiro compromisso aberto que ainda não terminou', () => {
    const result = nextAppointment(
      [
        appointment({
          publicId: '00000000-0000-4000-8000-00000000000a',
          status: 'COMPLETED',
          startsAt: '2026-08-17T09:00:00.000Z',
          endsAt: '2026-08-17T09:30:00.000Z',
        }),
        appointment({
          publicId: '00000000-0000-4000-8000-00000000000b',
          startsAt: '2026-08-17T12:00:00.000Z',
        }),
        appointment({
          publicId: '00000000-0000-4000-8000-00000000000c',
          startsAt: '2026-08-17T14:00:00.000Z',
          endsAt: '2026-08-17T14:30:00.000Z',
        }),
      ],
      now,
    );
    expect(result?.publicId).toBe('00000000-0000-4000-8000-00000000000b');
  });

  it('ignora cancelados, concluídos e faltas, e mantém o atendimento em andamento', () => {
    const running = appointment({
      publicId: '00000000-0000-4000-8000-00000000000d',
      status: 'IN_PROGRESS',
      startsAt: '2026-08-17T10:45:00.000Z',
      endsAt: '2026-08-17T11:15:00.000Z',
    });
    const result = nextAppointment(
      [
        appointment({ publicId: '00000000-0000-4000-8000-00000000000e', status: 'CANCELED' }),
        appointment({ publicId: '00000000-0000-4000-8000-00000000000f', status: 'COMPLETED' }),
        appointment({ publicId: '00000000-0000-4000-8000-000000000010', status: 'NO_SHOW' }),
        running,
      ],
      now,
    );
    expect(result?.publicId).toBe(running.publicId);
  });

  it('mantém em destaque o confirmado que passou do horário e não foi resolvido', () => {
    const late = appointment({
      publicId: '00000000-0000-4000-8000-000000000011',
      startsAt: '2026-08-17T08:00:00.000Z',
      endsAt: '2026-08-17T08:30:00.000Z',
    });
    const result = nextAppointment(
      [
        appointment({
          publicId: '00000000-0000-4000-8000-000000000012',
          startsAt: '2026-08-17T15:00:00.000Z',
          endsAt: '2026-08-17T15:30:00.000Z',
        }),
        late,
      ],
      now,
    );
    expect(result?.publicId).toBe(late.publicId);
    expect(isOverdue(late, now)).toBe(true);
  });

  it('um atendimento em andamento tem prioridade sobre o atrasado', () => {
    const running = appointment({
      publicId: '00000000-0000-4000-8000-000000000013',
      status: 'IN_PROGRESS',
      startsAt: '2026-08-17T10:30:00.000Z',
      endsAt: '2026-08-17T11:00:00.000Z',
    });
    const result = nextAppointment(
      [
        appointment({
          publicId: '00000000-0000-4000-8000-000000000014',
          status: 'PENDING',
          startsAt: '2026-08-17T08:00:00.000Z',
          endsAt: '2026-08-17T08:30:00.000Z',
        }),
        running,
      ],
      now,
    );
    expect(result?.publicId).toBe(running.publicId);
  });

  it('sai do card apenas quando o atendimento é resolvido', () => {
    const past = {
      startsAt: '2026-08-17T08:00:00.000Z',
      endsAt: '2026-08-17T08:30:00.000Z',
    };
    expect(nextAppointment([appointment({ ...past, status: 'COMPLETED' })], now)).toBeNull();
    expect(nextAppointment([appointment({ ...past, status: 'CANCELED' })], now)).toBeNull();
    expect(nextAppointment([appointment({ ...past, status: 'NO_SHOW' })], now)).toBeNull();
    expect(isOverdue(appointment({ ...past, status: 'COMPLETED' }), now)).toBe(false);
  });
});

describe('horários livres', () => {
  it('une slots contíguos e nunca sobrepõe um atendimento aberto', () => {
    const blocks = freeBlocks(
      [
        slot('2026-08-17T11:00:00.000Z', '2026-08-17T11:30:00.000Z'),
        slot('2026-08-17T11:30:00.000Z', '2026-08-17T12:00:00.000Z'),
        slot('2026-08-17T12:00:00.000Z', '2026-08-17T12:30:00.000Z'),
        slot('2026-08-17T13:00:00.000Z', '2026-08-17T13:30:00.000Z'),
      ],
      [appointment()],
      now,
    );
    expect(blocks).toEqual([
      {
        startsAt: '2026-08-17T11:00:00.000Z',
        endsAt: '2026-08-17T12:00:00.000Z',
        minutes: 60,
      },
      {
        startsAt: '2026-08-17T13:00:00.000Z',
        endsAt: '2026-08-17T13:30:00.000Z',
        minutes: 30,
      },
    ]);
  });

  it('descarta o que já passou e o que não está disponível', () => {
    const blocks = freeBlocks(
      [
        slot('2026-08-17T09:00:00.000Z', '2026-08-17T09:30:00.000Z'),
        slot('2026-08-17T13:00:00.000Z', '2026-08-17T13:30:00.000Z', 'BLOCKED'),
        slot('2026-08-17T14:00:00.000Z', '2026-08-17T14:30:00.000Z'),
      ],
      [],
      now,
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.startsAt).toBe('2026-08-17T14:00:00.000Z');
  });

  it('libera o horário de um atendimento cancelado', () => {
    const blocks = freeBlocks(
      [slot('2026-08-17T12:00:00.000Z', '2026-08-17T12:30:00.000Z')],
      [appointment({ status: 'CANCELED' })],
      now,
    );
    expect(blocks).toHaveLength(1);
  });
});

describe('timeline e navegação de dias', () => {
  it('intercala atendimentos e janelas livres pelo horário', () => {
    const entries = buildTimeline(
      [appointment({ startsAt: '2026-08-17T12:00:00.000Z' })],
      [{ startsAt: '2026-08-17T11:00:00.000Z', endsAt: '2026-08-17T11:30:00.000Z', minutes: 30 }],
    );
    expect(entries.map((entry) => entry.kind)).toEqual(['free', 'appointment']);
  });

  it('troca de dia mantém a chave local do agendamento', () => {
    expect(addDays('2026-08-17', 1)).toBe('2026-08-18');
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(dayKey(new Date('2026-08-17T12:00:00.000Z').toISOString())).toBe(
      new Date('2026-08-17T12:00:00.000Z').toLocaleDateString('sv-SE'),
    );
  });
});

describe('ação principal por estado', () => {
  it('respeita o estado e a permissão de confirmar', () => {
    expect(primaryAction('PENDING', true)?.action).toBe('confirm');
    expect(primaryAction('PENDING', false)?.action).toBe('start');
    expect(primaryAction('CONFIRMED', false)?.action).toBe('start');
    expect(primaryAction('IN_PROGRESS', false)?.action).toBe('complete');
    expect(primaryAction('COMPLETED', true)).toBeNull();
    expect(primaryAction('CANCELED', true)).toBeNull();
    expect(primaryAction('NO_SHOW', true)).toBeNull();
  });
});
