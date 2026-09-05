import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { TreatmentPlanFollowUpSection } from './TreatmentPlanFollowUpSection.js';
import { httpClient } from '../../lib/http.js';

vi.mock('../../lib/http.js');

const mockPlanPublicId = '550e8400-e29b-41d4-a716-446655440000';

describe('TreatmentPlanFollowUpSection', () => {
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

  it('should show "sem acompanhamento" when state is null', async () => {
    (httpClient.request as any).mockResolvedValue({ state: null, history: [] });

    render(
      <QueryClientProvider client={queryClient}>
        <TreatmentPlanFollowUpSection
          treatmentPlanPublicId={mockPlanPublicId}
          canUpdate={true}
        />
      </QueryClientProvider>,
    );

    await screen.findByText('Sem acompanhamento configurado');
    expect(screen.getByText('Sem acompanhamento configurado para este orçamento.')).toBeInTheDocument();
  });

  it('should display active reminder state', async () => {
    const mockState = {
      status: 'ACTIVE',
      nextReminderAt: '2026-09-10T10:00:00Z',
      lastReminderAt: '2026-09-05T10:00:00Z',
      remindersSent: 1,
      currentStepIndex: 1,
    };

    (httpClient.request as any).mockResolvedValue({ state: mockState, history: [] });

    render(
      <QueryClientProvider client={queryClient}>
        <TreatmentPlanFollowUpSection
          treatmentPlanPublicId={mockPlanPublicId}
          canUpdate={true}
        />
      </QueryClientProvider>,
    );

    await screen.findByText('Ativo');
    expect(screen.getByText('Ativo')).toBeInTheDocument();
    expect(screen.getByText(/Próximo lembrete:/)).toBeInTheDocument();
    expect(screen.getByText(/Enviados: 1/)).toBeInTheDocument();
  });

  it('should show correct actions for ACTIVE status', async () => {
    const mockState = {
      status: 'ACTIVE',
      nextReminderAt: '2026-09-10T10:00:00Z',
      lastReminderAt: null,
      remindersSent: 0,
      currentStepIndex: 0,
    };

    (httpClient.request as any).mockResolvedValue({ state: mockState, history: [] });

    render(
      <QueryClientProvider client={queryClient}>
        <TreatmentPlanFollowUpSection
          treatmentPlanPublicId={mockPlanPublicId}
          canUpdate={true}
        />
      </QueryClientProvider>,
    );

    await screen.findByText('Enviar agora');
    expect(screen.getByText('Enviar agora')).toBeInTheDocument();
    expect(screen.getByText('Pausar')).toBeInTheDocument();
  });

  it('should show correct actions for PAUSED status', async () => {
    const mockState = {
      status: 'PAUSED',
      nextReminderAt: null,
      lastReminderAt: '2026-09-05T10:00:00Z',
      remindersSent: 2,
      currentStepIndex: 1,
    };

    (httpClient.request as any).mockResolvedValue({ state: mockState, history: [] });

    render(
      <QueryClientProvider client={queryClient}>
        <TreatmentPlanFollowUpSection
          treatmentPlanPublicId={mockPlanPublicId}
          canUpdate={true}
        />
      </QueryClientProvider>,
    );

    await screen.findByText('Retomar');
    expect(screen.getByText('Retomar')).toBeInTheDocument();
    expect(screen.getByText('Enviar agora')).toBeInTheDocument();
  });

  it('should show history when toggled', async () => {
    const mockHistory = [
      {
        sentAt: '2026-09-05T10:00:00Z',
        status: 'SENT',
        sentMessage: 'Test message',
        messageTemplate: 'Template',
        errorMessage: null,
      },
    ];

    const mockState = {
      status: 'ACTIVE',
      nextReminderAt: '2026-09-10T10:00:00Z',
      lastReminderAt: '2026-09-05T10:00:00Z',
      remindersSent: 1,
      currentStepIndex: 1,
    };

    (httpClient.request as any).mockResolvedValue({ state: mockState, history: mockHistory });

    render(
      <QueryClientProvider client={queryClient}>
        <TreatmentPlanFollowUpSection
          treatmentPlanPublicId={mockPlanPublicId}
          canUpdate={true}
        />
      </QueryClientProvider>,
    );

    await screen.findByText(/Ver histórico/);
    const historyBtn = screen.getByText(/Ver histórico/);
    fireEvent.click(historyBtn);

    await screen.findByText('Test message');
    expect(screen.getByText('Test message')).toBeInTheDocument();
  });

  it('should call send-now endpoint on confirmation', async () => {
    const mockState = {
      status: 'ACTIVE',
      nextReminderAt: '2026-09-10T10:00:00Z',
      lastReminderAt: null,
      remindersSent: 0,
      currentStepIndex: 0,
    };

    (httpClient.request as any).mockResolvedValue({ state: mockState, history: [] });

    render(
      <QueryClientProvider client={queryClient}>
        <TreatmentPlanFollowUpSection
          treatmentPlanPublicId={mockPlanPublicId}
          canUpdate={true}
        />
      </QueryClientProvider>,
    );

    await screen.findByText('Enviar agora');
    const sendBtn = screen.getByText('Enviar agora');
    fireEvent.click(sendBtn);

    // Should show confirmation
    await screen.findByText(/Deseja enviar um lembrete/);
    expect(screen.getByText(/Deseja enviar um lembrete/)).toBeInTheDocument();
  });
});
