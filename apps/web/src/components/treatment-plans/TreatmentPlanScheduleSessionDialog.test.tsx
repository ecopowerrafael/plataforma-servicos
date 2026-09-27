import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';

import { TreatmentPlanScheduleSessionDialog } from './TreatmentPlanScheduleSessionDialog.js';
import { httpClient } from '../../lib/http.js';
import type { TreatmentPlanPublic } from '@plataforma/shared';

vi.mock('../../lib/http.js');

const mockPlan: TreatmentPlanPublic = {
  publicId: '550e8400-e29b-41d4-a716-446655440000',
  title: 'Pacote Completo',
  status: 'APPROVED',
  customerPublicId: '550e8400-e29b-41d4-a716-446655440001',
  customerName: 'João da Silva',
  servicePublicId: '550e8400-e29b-41d4-a716-446655440002',
  serviceName: 'Massagem Terapêutica',
  professionalPublicId: '550e8400-e29b-41d4-a716-446655440003',
  professionalName: 'Maria Santos',
  amountCents: 15000,
  sessionsPlanned: 10,
  sessionsCompleted: 0,
  estimatedTotalCents: 150000,
  returnIntervalDays: 7,
  notes: 'Pacote especial',
  billingMode: 'PER_SESSION',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  sessions: [],
};

describe('TreatmentPlanScheduleSessionDialog', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  it('should render schedule form', () => {
    render(
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <TreatmentPlanScheduleSessionDialog
            plan={mockPlan}
            onClose={vi.fn()}
            onSuccess={vi.fn()}
          />
        </QueryClientProvider>
      </BrowserRouter>,
    );

    expect(screen.getByText('Agendar sessão #1')).toBeInTheDocument();
    expect(screen.getByLabelText('Data da sessão')).toBeInTheDocument();
    expect(screen.getByLabelText('Horário')).toBeInTheDocument();
  });

  it('should show plan info', () => {
    render(
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <TreatmentPlanScheduleSessionDialog
            plan={mockPlan}
            onClose={vi.fn()}
            onSuccess={vi.fn()}
          />
        </QueryClientProvider>
      </BrowserRouter>,
    );

    expect(screen.getByText(mockPlan.customerName)).toBeInTheDocument();
    expect(screen.getByText(mockPlan.serviceName)).toBeInTheDocument();
    expect(screen.getByText(mockPlan.professionalName)).toBeInTheDocument();
  });

  it('should allow date and time selection', () => {
    render(
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <TreatmentPlanScheduleSessionDialog
            plan={mockPlan}
            onClose={vi.fn()}
            onSuccess={vi.fn()}
          />
        </QueryClientProvider>
      </BrowserRouter>,
    );

    const dateInput = screen.getByLabelText('Data da sessão') as HTMLInputElement;
    const timeInput = screen.getByLabelText('Horário') as HTMLInputElement;

    fireEvent.change(dateInput, { target: { value: '2026-10-15' } });
    fireEvent.change(timeInput, { target: { value: '14:30' } });

    expect(dateInput.value).toBe('2026-10-15');
    expect(timeInput.value).toBe('14:30');
  });

  it('should show confirmation step', async () => {
    render(
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <TreatmentPlanScheduleSessionDialog
            plan={mockPlan}
            onClose={vi.fn()}
            onSuccess={vi.fn()}
          />
        </QueryClientProvider>
      </BrowserRouter>,
    );

    const dateInput = screen.getByLabelText('Data da sessão');
    const timeInput = screen.getByLabelText('Horário');

    fireEvent.change(dateInput, { target: { value: '2026-10-15' } });
    fireEvent.change(timeInput, { target: { value: '14:30' } });

    const agendarBtn = screen.getByText('Agendar sessão');
    fireEvent.click(agendarBtn);

    await screen.findByText('Confirma agendamento para:');
    expect(screen.getByText(/2026-10-15/)).toBeInTheDocument();
  });
});
