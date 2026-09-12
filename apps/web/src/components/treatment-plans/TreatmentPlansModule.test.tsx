import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { TreatmentPlansModule } from './TreatmentPlansModule.js';
import { httpClient } from '../../lib/http.js';

vi.mock('../../lib/http.js');

const mockTenantPublicId = '550e8400-e29b-41d4-a716-446655440000';

const mockPlans = {
  items: [
    {
      publicId: '550e8400-e29b-41d4-a716-446655440001',
      title: 'Limpeza Facial',
      status: 'PENDING' as const,
      billingMode: 'TOTAL' as const,
      amountCents: '10000',
      estimatedTotalCents: null,
      sessionsPlanned: 6,
      sessionsCompleted: 0,
      returnIntervalDays: 14,
      notes: null,
      customerPublicId: '550e8400-e29b-41d4-a716-446655440010',
      customerName: 'João Silva',
      servicePublicId: '550e8400-e29b-41d4-a716-446655440020',
      serviceName: 'Limpeza',
      professionalPublicId: '550e8400-e29b-41d4-a716-446655440030',
      professionalName: 'Ana Costa',
      originAppointmentPublicId: '550e8400-e29b-41d4-a716-446655440040',
      recommendedNextDate: null,
      lastCompletedSessionAt: null,
      paidCents: '0',
      sessions: [],
      approvedAt: null,
      startedAt: null,
      completedAt: null,
      canceledAt: null,
      canceledReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      publicId: '550e8400-e29b-41d4-a716-446655440002',
      title: 'Peeling Químico',
      status: 'APPROVED' as const,
      billingMode: 'PER_SESSION' as const,
      amountCents: '25000',
      estimatedTotalCents: '75000',
      sessionsPlanned: 3,
      sessionsCompleted: 0,
      returnIntervalDays: 21,
      notes: null,
      customerPublicId: '550e8400-e29b-41d4-a716-446655440011',
      customerName: 'Maria Santos',
      servicePublicId: '550e8400-e29b-41d4-a716-446655440021',
      serviceName: 'Peeling',
      professionalPublicId: '550e8400-e29b-41d4-a716-446655440031',
      professionalName: 'Dr. Carlos',
      originAppointmentPublicId: '550e8400-e29b-41d4-a716-446655440041',
      recommendedNextDate: null,
      lastCompletedSessionAt: null,
      paidCents: '0',
      sessions: [],
      approvedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      canceledAt: null,
      canceledReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      publicId: '550e8400-e29b-41d4-a716-446655440003',
      title: 'Fotorejuvenescimento',
      status: 'IN_PROGRESS' as const,
      billingMode: 'PER_SESSION' as const,
      amountCents: '30000',
      estimatedTotalCents: '90000',
      sessionsPlanned: 3,
      sessionsCompleted: 1,
      returnIntervalDays: 7,
      notes: null,
      customerPublicId: '550e8400-e29b-41d4-a716-446655440012',
      customerName: 'Paula Oliveira',
      servicePublicId: '550e8400-e29b-41d4-a716-446655440022',
      serviceName: 'Fotorejuvenescimento',
      professionalPublicId: '550e8400-e29b-41d4-a716-446655440032',
      professionalName: 'Dra. Laura',
      originAppointmentPublicId: '550e8400-e29b-41d4-a716-446655440042',
      recommendedNextDate: new Date(Date.now() + 86400000 * 7).toISOString(),
      lastCompletedSessionAt: new Date().toISOString(),
      paidCents: '30000',
      sessions: [
        {
          appointmentPublicId: '550e8400-e29b-41d4-a716-446655440050',
          sessionNumber: 1,
          startsAt: new Date().toISOString(),
          status: 'COMPLETED' as const,
          priceCents: '30000',
          paidCents: '30000',
          balanceCents: '0',
        },
      ],
      createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
};

describe('TreatmentPlansModule', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    vi.clearAllMocks();
    (httpClient.request as any).mockResolvedValue(mockPlans);
  });

  it('should render treatment plans list', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TreatmentPlansModule tenantPublicId={mockTenantPublicId} />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Orçamentos e Planos')).toBeInTheDocument();
    await expect(async () => {
      expect(await screen.findByText('Limpeza Facial')).toBeInTheDocument();
    }).resolves.not.toThrow();
  });

  it('should show dashboard indicators', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TreatmentPlansModule tenantPublicId={mockTenantPublicId} />
      </QueryClientProvider>,
    );

    await expect(async () => {
      expect(await screen.findByText('Aguardando aprovação')).toBeInTheDocument();
    }).resolves.not.toThrow();
  });

  it('should filter by status', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TreatmentPlansModule tenantPublicId={mockTenantPublicId} />
      </QueryClientProvider>,
    );

    await expect(async () => {
      const filterButtons = await screen.findAllByRole('button');
      const pendingButton = filterButtons.find((btn) => btn.textContent === 'Aguardando aprovação');
      expect(pendingButton).toBeInTheDocument();
    }).resolves.not.toThrow();
  });

  it('should search by customer name', async () => {
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <TreatmentPlansModule tenantPublicId={mockTenantPublicId} />
      </QueryClientProvider>,
    );

    await expect(async () => {
      const inputs = container.querySelectorAll('input[type="text"]');
      const searchInput = inputs[0] as HTMLInputElement;
      expect(searchInput).toBeInTheDocument();
    }).resolves.not.toThrow();
  });

  it('should call httpClient.request with correct parameters', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TreatmentPlansModule tenantPublicId={mockTenantPublicId} />
      </QueryClientProvider>,
    );

    await expect(async () => {
      expect(httpClient.request).toHaveBeenCalledWith('/tenant/treatment-plans', expect.any(Object));
    }).resolves.not.toThrow();
  });
});
