import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { TreatmentPlanEditDialog } from './TreatmentPlanEditDialog.js';
import { httpClient } from '../../lib/http.js';
import type { TreatmentPlanPublic } from '@plataforma/shared';

vi.mock('../../lib/http.js');

const mockPlan: TreatmentPlanPublic = {
  publicId: '550e8400-e29b-41d4-a716-446655440000',
  title: 'Pacote Completo',
  status: 'PENDING',
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

describe('TreatmentPlanEditDialog', () => {
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

  it('should render edit form with current values', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TreatmentPlanEditDialog plan={mockPlan} onClose={vi.fn()} onSuccess={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(screen.getByDisplayValue(mockPlan.title)).toBeInTheDocument();
    expect(screen.getByDisplayValue('150')).toBeInTheDocument();
    expect(screen.getByDisplayValue(mockPlan.sessionsPlanned.toString())).toBeInTheDocument();
  });

  it('should allow editing fields', async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    (httpClient.request as any).mockResolvedValue(mockPlan);

    render(
      <QueryClientProvider client={queryClient}>
        <TreatmentPlanEditDialog plan={mockPlan} onClose={onClose} onSuccess={onSuccess} />
      </QueryClientProvider>,
    );

    const titleInput = screen.getByDisplayValue(mockPlan.title);
    fireEvent.change(titleInput, { target: { value: 'Novo Título' } });

    expect((titleInput as HTMLInputElement).value).toBe('Novo Título');
  });

  it('should call onSuccess when save succeeds', async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    (httpClient.request as any).mockResolvedValue(mockPlan);

    render(
      <QueryClientProvider client={queryClient}>
        <TreatmentPlanEditDialog plan={mockPlan} onClose={onClose} onSuccess={onSuccess} />
      </QueryClientProvider>,
    );

    const saveBtn = screen.getByText('Salvar alterações');
    fireEvent.click(saveBtn);

    await screen.findByText('Salvar alterações');
    expect(onSuccess).toHaveBeenCalled();
  });
});
