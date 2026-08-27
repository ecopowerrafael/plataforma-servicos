import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { ProspectingFlowsView } from './ProspectingFlowsView';
import * as httpModule from '../../lib/http';

const mockFlows = [
  {
    publicId: '550e8400-e29b-41d4-a716-446655440000',
    code: 'DIRECTORY_PUBLICATION',
    name: 'Divulgação de Estabelecimento',
    description: 'Flow padrão',
    isActive: true,
    stepsCount: 5,
    createdAt: '2026-08-27T00:00:00Z',
    updatedAt: '2026-08-27T00:00:00Z',
  },
  {
    publicId: '550e8400-e29b-41d4-a716-446655440001',
    code: null,
    name: 'Meu Flow',
    description: 'Custom flow',
    isActive: false,
    stepsCount: 3,
    createdAt: '2026-08-27T00:00:00Z',
    updatedAt: '2026-08-27T00:00:00Z',
  },
];

describe('ProspectingFlowsView', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.spyOn(httpModule.httpClient, 'request').mockResolvedValue({ items: mockFlows });
  });

  it('1. lists flows from API', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <ProspectingFlowsView />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Divulgação de Estabelecimento')).toBeInTheDocument();
    });
  });

  it('2. shows default flow badge', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <ProspectingFlowsView />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Fluxo padrão')).toBeInTheDocument();
    });
  });

  it('3. shows flow status badges', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <ProspectingFlowsView />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Ativo')).toBeInTheDocument();
      expect(screen.getByText('Inativo')).toBeInTheDocument();
    });
  });

  it('4. shows step count', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <ProspectingFlowsView />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/5 etapa/)).toBeInTheDocument();
    });
  });

  it('5. does not show delete for default flow', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <ProspectingFlowsView />
      </QueryClientProvider>
    );

    await waitFor(() => {
      const buttons = screen.getAllByText('Excluir');
      expect(buttons.length).toBe(1);
    });
  });

  it('6. shows edit button for all flows', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <ProspectingFlowsView />
      </QueryClientProvider>
    );

    await waitFor(() => {
      const editButtons = screen.getAllByText('Editar');
      expect(editButtons.length).toBeGreaterThan(0);
    });
  });

  it('7. shows activate/deactivate button', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <ProspectingFlowsView />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Desativar')).toBeInTheDocument();
    });
  });

  it('8. shows new flow button', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <ProspectingFlowsView />
      </QueryClientProvider>
    );

    expect(screen.getByText('+ Novo Fluxo')).toBeInTheDocument();
  });
});
