import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MyCommissionCyclesModule } from './MyCommissionCyclesModule.js';

const tenantPublicId = '00000000-0000-4000-8000-000000000001';
const cycle = (overrides: Record<string, unknown> = {}) => ({
  publicId: '00000000-0000-4000-8000-000000000010',
  periodStart: '2026-10-01T03:00:00.000Z',
  periodEnd: '2026-11-01T02:59:59.000Z',
  status: 'OPEN',
  readyToClose: false,
  myPoints: 3,
  totalPoints: 10,
  myShareBps: 3000,
  poolCents: '123456',
  myEstimatedAmountCents: '37037',
  myFinalAmountCents: null,
  closedAt: null,
  ...overrides,
});

function response(body: unknown, status = 200) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
}

function renderModule(current: unknown, history = { items: [current] }, options: { pending?: boolean; status?: number; code?: string } = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (options.pending) return new Promise(() => undefined);
    if (url.endsWith('/tenant/context')) return response({ tenant: { timezone: 'America/Sao_Paulo' } });
    if (url.endsWith('/commission-cycles/current')) return options.status === undefined || options.status === 200 ? response(current, 200) : response({ error: { code: options.code ?? 'HTTP_ERROR', message: 'erro', requestId: 'req-test' } }, options.status);
    return response(history);
  });
  vi.stubGlobal('fetch', fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><MyCommissionCyclesModule tenantPublicId={tenantPublicId} /></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('MyCommissionCyclesModule', () => {
  it('renderiza OPEN com estimativa, pontos, participação e apenas dados próprios', async () => {
    renderModule(cycle());
    expect(await screen.findByText('Em andamento')).toBeTruthy();
    expect(screen.getByText('Meus pontos')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('30,00%')).toBeTruthy();
    expect(screen.getByText('R$ 370,37')).toBeTruthy();
    expect(screen.getByText(/Valor estimado/)).toBeTruthy();
    expect(screen.queryByText(/Profissional A2|Profissional B1|allocation/i)).toBeNull();
  });

  it('renderiza READY_TO_CLOSE sem ação de fechamento e mantém estimativa', async () => {
    renderModule(cycle({ readyToClose: true }));
    expect((await screen.findAllByText('Aguardando fechamento')).length).toBeGreaterThan(0);
    expect(screen.getByText(/Valor estimado/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /fechar/i })).toBeNull();
  });

  it('renderiza CLOSED usando valor final e data de fechamento', async () => {
    renderModule(cycle({ status: 'CLOSED', myEstimatedAmountCents: '999999', myFinalAmountCents: '4200', closedAt: '2026-11-02T03:00:00.000Z' }));
    expect(await screen.findByText('Fechado')).toBeTruthy();
    expect(screen.getAllByText('R$ 42,00').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Valor final/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2 de nov\. de 2026/).length).toBeGreaterThan(0);
  });

  it('trata zero pontos e zero pool como estados de negócio', async () => {
    renderModule(cycle({ myPoints: 0, myEstimatedAmountCents: '0', poolCents: '1000' }));
    expect(await screen.findByText(/Você ainda não possui atendimentos elegíveis/)).toBeTruthy();
    expect(screen.getByText('R$ 0,00')).toBeTruthy();
    cleanup();
    renderModule(cycle({ myPoints: 2, poolCents: '0', myEstimatedAmountCents: '0' }));
    expect(await screen.findByText(/ainda não há valor disponível para rateio/i)).toBeTruthy();
  });

  it('ordena e renderiza histórico somente com os ciclos fechados do profissional', async () => {
    const latest = cycle({ publicId: '00000000-0000-4000-8000-000000000011', status: 'CLOSED', periodStart: '2026-10-01T03:00:00.000Z', myFinalAmountCents: '2500', closedAt: '2026-11-02T03:00:00.000Z' });
    const older = cycle({ publicId: '00000000-0000-4000-8000-000000000012', status: 'CLOSED', periodStart: '2026-09-01T03:00:00.000Z', myFinalAmountCents: '1500', closedAt: '2026-10-02T03:00:00.000Z' });
    renderModule(latest, { items: [latest, older] });
    expect((await screen.findAllByText('R$ 25,00')).length).toBeGreaterThan(0);
    expect(screen.getByText('R$ 15,00')).toBeTruthy();
    const periods = screen.getAllByText(/2026|01 de/);
    expect(periods.length).toBeGreaterThan(1);
  });

  it('formata cents acima de Number.MAX_SAFE_INTEGER sem perda de precisão', async () => {
    renderModule(cycle({ poolCents: '900719925474099300', myEstimatedAmountCents: '900719925474099301' }));
    expect(await screen.findByText(/R\$ 9\.007\.199\.254\.740\.993,01/)).toBeTruthy();
  });

  it('exibe loading sem piscar valor ou empty state', () => {
    renderModule(undefined, { items: [] }, { pending: true });
    expect(screen.getByLabelText('Carregando conteúdo')).toBeTruthy();
    expect(screen.queryByText(/R\$/)).toBeNull();
    expect(screen.queryByText(/Nenhum ciclo fechado/)).toBeNull();
  });

  it('exibe empty state para rateio não configurado e ciclo ainda não iniciado', async () => {
    renderModule(undefined, { items: [] }, { status: 409, code: 'COMMISSION_CYCLE_NOT_CONFIGURED' });
    expect(await screen.findByText(/Rateio de assinaturas ainda não está disponível/)).toBeTruthy();
    cleanup();
    renderModule(undefined, { items: [] }, { status: 409, code: 'COMMISSION_CYCLE_NOT_STARTED' });
    expect(await screen.findByText(/Ainda não há um ciclo de rateio disponível/)).toBeTruthy();
  });

  it.each([403, 404, 500])('trata erro HTTP %s sem vazar dados', async (status) => {
    renderModule(undefined, { items: [] }, { status });
    expect(await screen.findByText(/Não foi possível carregar seu rateio/)).toBeTruthy();
    expect(screen.queryByText(/professional|allocation|internal/i)).toBeNull();
  });
});
