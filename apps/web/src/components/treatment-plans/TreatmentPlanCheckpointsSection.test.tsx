import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { TreatmentPlanCheckpointsSection } from './TreatmentPlanCheckpointsSection.js';
import type { TreatmentPlanPublic } from '@plataforma/shared';

const mockPlan: TreatmentPlanPublic = {
  publicId: '550e8400-e29b-41d4-a716-446655440000',
  title: 'Pacote Completo',
  status: 'IN_PROGRESS',
  customerPublicId: '550e8400-e29b-41d4-a716-446655440001',
  customerName: 'João da Silva',
  servicePublicId: '550e8400-e29b-41d4-a716-446655440002',
  serviceName: 'Massagem Terapêutica',
  professionalPublicId: '550e8400-e29b-41d4-a716-446655440003',
  professionalName: 'Maria Santos',
  amountCents: 15000,
  sessionsPlanned: 10,
  sessionsCompleted: 2,
  estimatedTotalCents: 150000,
  returnIntervalDays: 7,
  notes: 'Pacote especial',
  billingMode: 'PER_SESSION',
  createdAt: '2026-09-01T10:00:00Z',
  updatedAt: '2026-09-05T10:00:00Z',
  recommendedNextDate: '2026-09-12T10:00:00Z',
  sessions: [
    {
      appointmentPublicId: '550e8400-e29b-41d4-a716-446655440004',
      sessionNumber: 1,
      startsAt: '2026-09-02T10:00:00Z',
      status: 'COMPLETED',
      priceCents: 15000,
    },
    {
      appointmentPublicId: '550e8400-e29b-41d4-a716-446655440005',
      sessionNumber: 2,
      startsAt: '2026-09-09T10:00:00Z',
      status: 'COMPLETED',
      priceCents: 15000,
    },
  ],
  paidCents: 30000,
};

describe('TreatmentPlanCheckpointsSection', () => {
  it('should render checkpoints', () => {
    render(<TreatmentPlanCheckpointsSection plan={mockPlan} />);

    expect(screen.getByText('Progresso do plano')).toBeInTheDocument();
    expect(screen.getByText('Orçamento criado')).toBeInTheDocument();
    expect(screen.getByText('Orçamento aprovado')).toBeInTheDocument();
  });

  it('should show session checkpoints', () => {
    render(<TreatmentPlanCheckpointsSection plan={mockPlan} />);

    expect(screen.getByText('Sessão 1 agendada')).toBeInTheDocument();
    expect(screen.getByText('Sessão 1 realizada')).toBeInTheDocument();
    expect(screen.getByText('Sessão 2 agendada')).toBeInTheDocument();
    expect(screen.getByText('Sessão 2 realizada')).toBeInTheDocument();
  });

  it('should show recommended next date', () => {
    render(<TreatmentPlanCheckpointsSection plan={mockPlan} />);

    expect(screen.getByText('Próxima sessão recomendada')).toBeInTheDocument();
  });

  it('should show see all sessions button when multiple sessions', () => {
    const planWith10Sessions = { ...mockPlan, sessionsPlanned: 10 };
    render(<TreatmentPlanCheckpointsSection plan={planWith10Sessions} />);

    const toggleBtn = screen.getByText(/Ver todas as sessões/);
    expect(toggleBtn).toBeInTheDocument();
  });

  it('should expand all sessions when toggle clicked', () => {
    const planWith10Sessions = {
      ...mockPlan,
      sessionsPlanned: 10,
      sessions: Array.from({ length: 10 }, (_, i) => ({
        appointmentPublicId: `id-${i}`,
        sessionNumber: i + 1,
        startsAt: new Date(new Date().getTime() + i * 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: i < 2 ? ('COMPLETED' as const) : ('SCHEDULED' as const),
        priceCents: 15000,
      })),
    };

    render(<TreatmentPlanCheckpointsSection plan={planWith10Sessions} />);

    const toggleBtn = screen.getByText(/Ver todas as sessões/);
    fireEvent.click(toggleBtn);

    expect(screen.getByText('Sessão 4 agendada')).toBeInTheDocument();
    expect(screen.getByText('Sessão 10 agendada')).toBeInTheDocument();
  });

  it('should show completed plan checkpoint', () => {
    const completedPlan = { ...mockPlan, status: 'COMPLETED' as const };
    render(<TreatmentPlanCheckpointsSection plan={completedPlan} />);

    expect(screen.getByText('Plano concluído')).toBeInTheDocument();
  });
});
