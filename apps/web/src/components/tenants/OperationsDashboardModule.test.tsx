import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OperationsDashboardModule } from './OperationsDashboardModule';
import { httpClient } from '../../lib/http';

vi.mock('../../lib/http.js');

const mockDashboardData = {
  date: '2026-09-05',
  today: {
    total: 12,
    upcoming: 3,
    checkedIn: 7,
    fitIn: 2,
    byStatus: {
      PENDING: 2,
      CONFIRMED: 4,
      IN_PROGRESS: 3,
      COMPLETED: 2,
      CANCELED: 1,
      NO_SHOW: 0,
    },
    byProfessional: [
      { professionalPublicId: 'prof-1', professionalName: 'Maria Silva', total: 6 },
      { professionalPublicId: 'prof-2', professionalName: 'João Santos', total: 6 },
    ],
    byUnit: [
      { unitPublicId: 'unit-1', unitName: 'Unidade Centro', total: 8 },
      { unitPublicId: 'unit-2', unitName: 'Unidade Sul', total: 4 },
    ],
  },
};

describe('OperationsDashboardModule', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  it('should render loading state', () => {
    (httpClient.request as any).mockReturnValue(new Promise(() => {}));

    render(
      <QueryClientProvider client={queryClient}>
        <OperationsDashboardModule tenantPublicId="test-tenant" />
      </QueryClientProvider>,
    );

    // Should render page header
    expect(screen.getByText('Seu dia em resumo')).toBeInTheDocument();
  });

  it('should render dashboard data when loaded', async () => {
    (httpClient.request as any).mockResolvedValue(mockDashboardData);

    render(
      <QueryClientProvider client={queryClient}>
        <OperationsDashboardModule tenantPublicId="test-tenant" />
      </QueryClientProvider>,
    );

    // Wait for data to load
    await screen.findByText('Atendimentos de hoje');

    expect(screen.getByText('Atendimentos de hoje')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('should show all metric cards', async () => {
    (httpClient.request as any).mockResolvedValue(mockDashboardData);

    render(
      <QueryClientProvider client={queryClient}>
        <OperationsDashboardModule tenantPublicId="test-tenant" />
      </QueryClientProvider>,
    );

    await screen.findByText('Atendimentos de hoje');

    expect(screen.getByText('Próximos atendimentos')).toBeInTheDocument();
    expect(screen.getByText('Check-ins')).toBeInTheDocument();
    expect(screen.getByText('Encaixes')).toBeInTheDocument();
  });

  it('should display status breakdown', async () => {
    (httpClient.request as any).mockResolvedValue(mockDashboardData);

    render(
      <QueryClientProvider client={queryClient}>
        <OperationsDashboardModule tenantPublicId="test-tenant" />
      </QueryClientProvider>,
    );

    await screen.findByText('Atendimentos por status');

    expect(screen.getByText('Confirmados')).toBeInTheDocument();
    expect(screen.getByText('Em atendimento')).toBeInTheDocument();
    expect(screen.getByText('Pendentes')).toBeInTheDocument();
  });

  it('should display professionals list', async () => {
    (httpClient.request as any).mockResolvedValue(mockDashboardData);

    render(
      <QueryClientProvider client={queryClient}>
        <OperationsDashboardModule tenantPublicId="test-tenant" />
      </QueryClientProvider>,
    );

    await screen.findByText('Atendimentos por profissional');

    expect(screen.getByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByText('João Santos')).toBeInTheDocument();
  });

  it('should display units list', async () => {
    (httpClient.request as any).mockResolvedValue(mockDashboardData);

    render(
      <QueryClientProvider client={queryClient}>
        <OperationsDashboardModule tenantPublicId="test-tenant" />
      </QueryClientProvider>,
    );

    await screen.findByText('Atendimentos por unidade');

    expect(screen.getByText('Unidade Centro')).toBeInTheDocument();
    expect(screen.getByText('Unidade Sul')).toBeInTheDocument();
  });

  it('should display error when query fails', async () => {
    const error = new Error('API Error');
    (httpClient.request as any).mockRejectedValue(error);

    render(
      <QueryClientProvider client={queryClient}>
        <OperationsDashboardModule tenantPublicId="test-tenant" />
      </QueryClientProvider>,
    );

    await screen.findByText('Não foi possível carregar o dashboard');

    expect(screen.getByText('Não foi possível carregar o dashboard. Tente novamente.')).toBeInTheDocument();
  });

  it('should pass correct tenant ID to API', async () => {
    (httpClient.request as any).mockResolvedValue(mockDashboardData);

    render(
      <QueryClientProvider client={queryClient}>
        <OperationsDashboardModule tenantPublicId="my-tenant-123" />
      </QueryClientProvider>,
    );

    await screen.findByText('Atendimentos de hoje');

    expect(httpClient.request).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        tenantPublicId: 'my-tenant-123',
      }),
    );
  });
});
