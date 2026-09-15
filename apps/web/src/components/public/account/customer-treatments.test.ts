import { type TreatmentPlanPublic } from '@plataforma/shared';
import { describe, expect, it } from 'vitest';

import { planPath, primaryAction, stateLabel, upcomingSession } from './customer-treatments.js';

const session = (
  status: TreatmentPlanPublic['sessions'][number]['status'],
  sessionNumber = 1,
) => ({
  appointmentPublicId: '00000000-0000-4000-8000-0000000000b1',
  sessionNumber,
  startsAt: '2026-09-05T17:00:00.000Z',
  status,
  priceCents: '30000',
  paidCents: '0',
  balanceCents: '30000',
});

const plan = (overrides: Partial<TreatmentPlanPublic> = {}): TreatmentPlanPublic => ({
    publicId: '00000000-0000-4000-8000-0000000000a1',
    title: 'Protocolo Facial Premium',
    status: 'APPROVED',
    billingMode: 'PER_SESSION',
    amountCents: '30000',
    estimatedTotalCents: '120000',
    sessionsPlanned: 4,
    sessionsCompleted: 0,
    returnIntervalDays: 30,
    notes: null,
    customerPublicId: '00000000-0000-4000-8000-0000000000c1',
    customerName: 'Maria Oliveira',
    servicePublicId: '00000000-0000-4000-8000-0000000000d1',
    serviceName: 'Avaliação Facial',
    professionalPublicId: '00000000-0000-4000-8000-0000000000e1',
    professionalName: 'Rafael Silva',
    originAppointmentPublicId: '00000000-0000-4000-8000-0000000000f1',
    recommendedNextDate: null,
    lastCompletedSessionAt: null,
    paidCents: '0',
    sessions: [],
    approvedAt: null,
    startedAt: null,
    completedAt: null,
    canceledAt: null,
    canceledReason: null,
    createdAt: '2026-08-17T12:00:00.000Z',
    updatedAt: '2026-08-17T12:00:00.000Z',
  ...overrides,
});

describe('ações do card de tratamento', () => {
  it('PENDING oferece aprovar o orçamento', () => {
    expect(primaryAction(plan({ status: 'PENDING' })).label).toBe('Aprovar orçamento');
  });

  it('aprovado sem sessão oferece agendar a primeira', () => {
    expect(primaryAction(plan()).kind).toBe('first-session');
  });

  it('em tratamento sem sessão futura oferece agendar a próxima', () => {
    const current = plan({
      status: 'IN_PROGRESS',
      sessionsCompleted: 1,
      sessions: [session('COMPLETED')],
    });
    expect(primaryAction(current).kind).toBe('next-session');
  });

  it('com sessão futura o CTA passa a ser ver a próxima sessão', () => {
    const current = plan({
      status: 'IN_PROGRESS',
      sessionsCompleted: 1,
      sessions: [session('COMPLETED'), session('CONFIRMED', 2)],
    });
    expect(primaryAction(current).kind).toBe('view-session');
    expect(upcomingSession(current)?.sessionNumber).toBe(2);
  });

  it('concluído mostra histórico e cancelado só detalhes', () => {
    expect(primaryAction(plan({ status: 'COMPLETED' })).kind).toBe('history');
    expect(primaryAction(plan({ status: 'CANCELED' })).kind).toBe('details');
  });

  it('não expõe o enum ao cliente', () => {
    expect(stateLabel(plan({ status: 'PENDING' }))).toBe('Aguardando aprovação');
    expect(stateLabel(plan())).toBe('Pronto para iniciar');
  });

  it('aponta para a página de detalhe do tratamento', () => {
    expect(planPath('studio', plan().publicId)).toBe(
      '/public/studio/conta/tratamentos/00000000-0000-4000-8000-0000000000a1',
    );
  });
});
