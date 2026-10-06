import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CommissionCycleModule } from './CommissionCycleModule.js';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../lib/http.js', () => ({ httpClient: { request } }));

const settings = {
  allowMultipleUnits: false,
  defaultAppointmentIntervalMinutes: 30,
  minimumAdvanceMinutes: 0,
  maximumAdvanceDays: 365,
  weekStartsOn: 'MONDAY',
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '24H',
  membershipSalesEnabled: true,
  allowSingleServiceSales: true,
  commissionTeamPercentBps: 4000,
  commissionClosingDay: 10,
  commissionEffectiveFrom: '2026-01-01T00:00:00.000Z',
};

const cycle = (overrides: Record<string, unknown> = {}) => ({
  publicId: '00000000-0000-4000-8000-000000000001',
  periodStart: '2026-01-01T03:00:00.000Z',
  periodEnd: '2026-02-01T03:00:00.000Z',
  status: 'OPEN',
  readyToClose: false,
  closingDay: 10,
  teamPercentBps: 4000,
  effectiveFrom: '2026-01-01T00:00:00.000Z',
  eligibleRevenueCents: '100000',
  poolCents: '40000',
  totalPoints: 10,
  distributedCents: '40000',
  allocations: [{ professionalPublicId: '00000000-0000-4000-8000-000000000002', professionalName: 'Maria Silva', points: 10, amountCents: '40000' }],
  closedAt: null,
  ...overrides,
});

function renderModule(canManage = true, canUpdate = true) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><CommissionCycleModule tenantPublicId="00000000-0000-4000-8000-000000000010" timezone="America/Sao_Paulo" canManage={canManage} canUpdate={canUpdate} /></QueryClientProvider>);
}

beforeEach(() => {
  request.mockReset();
  request.mockImplementation((path: string, options: { method?: string }) => {
    if (path === '/tenant/settings' && options.method === 'PATCH') return Promise.resolve({ settings });
    if (path === '/tenant/settings') return Promise.resolve({ settings });
    if (path.endsWith('/current')) return Promise.resolve(cycle());
    if (path === '/tenant/commission-cycles') return Promise.resolve({ items: [cycle()] });
    if (path.endsWith('/close')) return Promise.resolve(cycle({ status: 'CLOSED', readyToClose: false, closedAt: '2026-02-01T03:00:00.000Z' }));
    throw new Error(`Unexpected request: ${path}`);
  });
});
afterEach(() => cleanup());

describe('CommissionCycleModule interactions', () => {
  it('shows an in-progress OPEN cycle and hides close before period end', async () => {
    renderModule();
    expect(await screen.findByText('Em andamento')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Fechar ciclo' })).toBeNull();
    expect(screen.getByText('Maria Silva')).toBeTruthy();
  });

  it('allows closing only when ready and invalidates through the close endpoint', async () => {
    request.mockImplementation((path: string, options: { method?: string }) => {
      if (path === '/tenant/settings') return Promise.resolve({ settings });
      if (path.endsWith('/current')) return Promise.resolve(cycle({ readyToClose: true }));
      if (path === '/tenant/commission-cycles') return Promise.resolve({ items: [cycle({ readyToClose: true })] });
      if (path.endsWith('/close')) return Promise.resolve(cycle({ status: 'CLOSED' }));
      if (options.method === 'PATCH') return Promise.resolve({ settings });
      throw new Error(`Unexpected request: ${path}`);
    });
    renderModule();
    fireEvent.click(await screen.findByRole('button', { name: 'Fechar ciclo' }));
    expect(screen.getByText('Fechar ciclo?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar fechamento' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.stringContaining('/close'), expect.objectContaining({ method: 'POST' })));
  });

  it('keeps closing unavailable for read-only users and saves percentage as bps', async () => {
    request.mockImplementation((path: string, options: { method?: string }) => {
      if (path === '/tenant/settings') return Promise.resolve({ settings });
      if (path.endsWith('/current')) return Promise.resolve(cycle({ readyToClose: true }));
      if (path === '/tenant/commission-cycles') return Promise.resolve({ items: [cycle({ readyToClose: true })] });
      if (options.method === 'PATCH') return Promise.resolve({ settings });
      throw new Error(`Unexpected request: ${path}`);
    });
    renderModule(false, true);
    await screen.findByText('Pronto para fechar');
    expect(screen.queryByRole('button', { name: 'Fechar ciclo' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Percentual destinado à equipe'), { target: { value: '37.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar configuração' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/tenant/settings', expect.objectContaining({ method: 'PATCH', body: expect.objectContaining({ commissionTeamPercentBps: 3750 }) })));
  });

  it('shows explicit messages for zero points and zero revenue', async () => {
    request.mockImplementation((path: string) => {
      if (path === '/tenant/settings') return Promise.resolve({ settings });
      if (path.endsWith('/current')) return Promise.resolve(cycle({ totalPoints: 0, allocations: [] }));
      if (path === '/tenant/commission-cycles') return Promise.resolve({ items: [] });
      throw new Error(`Unexpected request: ${path}`);
    });
    renderModule();
    expect(await screen.findByText('Há receita no ciclo, mas nenhum atendimento elegível foi concluído.')).toBeTruthy();
  });

  it('renders CLOSED cycles with final values and no close action', async () => {
    request.mockImplementation((path: string) => {
      if (path === '/tenant/settings') return Promise.resolve({ settings });
      if (path.endsWith('/current')) return Promise.resolve(cycle({ status: 'CLOSED', distributedCents: '39999', closedAt: '2026-02-01T03:00:00.000Z' }));
      if (path === '/tenant/commission-cycles') return Promise.resolve({ items: [] });
      throw new Error(`Unexpected request: ${path}`);
    });
    renderModule();
    expect(await screen.findByText('Fechado')).toBeTruthy();
    expect(screen.getByText('Valor final')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Fechar ciclo' })).toBeNull();
  });

  it('shows zero-revenue guidance while keeping scored professionals visible', async () => {
    request.mockImplementation((path: string) => {
      if (path === '/tenant/settings') return Promise.resolve({ settings });
      if (path.endsWith('/current')) return Promise.resolve(cycle({ eligibleRevenueCents: '0', poolCents: '0', distributedCents: '0' }));
      if (path === '/tenant/commission-cycles') return Promise.resolve({ items: [] });
      throw new Error(`Unexpected request: ${path}`);
    });
    renderModule();
    expect(await screen.findByText('Há atendimentos pontuados, mas ainda não há receita elegível de assinaturas neste ciclo.')).toBeTruthy();
    expect(screen.getByText('Maria Silva')).toBeTruthy();
  });
});
