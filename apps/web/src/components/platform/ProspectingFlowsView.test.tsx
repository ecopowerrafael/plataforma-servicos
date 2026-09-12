import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProspectingFlowsView } from './ProspectingFlowsView.js';

vi.mock('../../lib/http.js', () => ({
  httpClient: {
    request: vi.fn(),
  },
}));

import { httpClient } from '../../lib/http.js';

const mockHttpClient = httpClient as any;

const mockFlowListItem = {
  publicId: 'flow-001',
  code: null,
  name: 'Test Flow',
  description: 'Test description',
  isActive: true,
  stepsCount: 2,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockFlowDetail = {
  publicId: 'flow-001',
  code: null,
  name: 'Test Flow',
  description: 'Test description',
  isActive: true,
  steps: [
    {
      publicId: 'step-001',
      name: 'Step 1',
      message: 'Message 1',
      stepType: 'MESSAGE_ONLY',
      position: 0,
      isStart: true,
      nextStepPublicId: 'step-002', // ← UUID, not string 'null'
      options: []
    },
    {
      publicId: 'step-002',
      name: 'Step 2',
      message: 'Message 2',
      stepType: 'MESSAGE_ONLY',
      position: 1,
      isStart: false,
      nextStepPublicId: null, // ← null, not string 'null'
      options: []
    }
  ]
};

describe('ProspectingFlowsView - FlowEditor', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });

    mockHttpClient.request.mockImplementation((url: string) => {
      if (url === '/platform/prospecting/flows') {
        return Promise.resolve({ items: [mockFlowListItem] });
      }
      if (url.includes('/flows/flow-001') && !url.includes('/materialize')) {
        return Promise.resolve(mockFlowDetail);
      }
      return Promise.reject(new Error('Unknown URL'));
    });
  });

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ProspectingFlowsView />
      </QueryClientProvider>
    );
  };

  it('shows loading state when fetching flow', async () => {
    mockHttpClient.request.mockImplementation((url: string) => {
      if (url === '/platform/prospecting/flows') {
        return Promise.resolve({ items: [mockFlowListItem] });
      }
      // Delay for flow detail to show loading
      return new Promise(resolve => setTimeout(() => resolve(mockFlowDetail), 100));
    });

    renderComponent();

    const editButton = await screen.findByRole('button', { name: /editar/i });
    fireEvent.click(editButton);

    // Should show loading message
    await waitFor(() => {
      expect(screen.getByText(/carregando fluxo/i)).toBeInTheDocument();
    });
  });

  it('shows error when flow fetch fails', async () => {
    mockHttpClient.request.mockImplementation((url: string) => {
      if (url === '/platform/prospecting/flows') {
        return Promise.resolve({ items: [mockFlowListItem] });
      }
      // Simulate failure for flow detail
      return Promise.reject(new Error('Failed to load'));
    });

    renderComponent();

    const editButton = await screen.findByRole('button', { name: /editar/i });
    fireEvent.click(editButton);

    // Should show error message
    await waitFor(() => {
      expect(screen.getByText(/não foi possível carregar o fluxo/i)).toBeInTheDocument();
    });

    // Should show retry button
    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
  });

  it('retry button calls refetch, not window.location.reload', async () => {
    let callCount = 0;

    mockHttpClient.request.mockImplementation((url: string) => {
      if (url === '/platform/prospecting/flows') {
        return Promise.resolve({ items: [mockFlowListItem] });
      }
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error('First fail'));
      }
      return Promise.resolve(mockFlowDetail);
    });

    const reloadSpy = vi.spyOn(window.location, 'reload');

    renderComponent();

    const editButton = await screen.findByRole('button', { name: /editar/i });
    fireEvent.click(editButton);

    // Wait for error
    await waitFor(() => {
      expect(screen.getByText(/não foi possível carregar o fluxo/i)).toBeInTheDocument();
    });

    // Click retry
    const retryButton = screen.getByRole('button', { name: /tentar novamente/i });
    fireEvent.click(retryButton);

    // Should refetch successfully
    await waitFor(() => {
      expect(screen.getByText(/dados do fluxo/i)).toBeInTheDocument();
    });

    // Should NOT call window.location.reload
    expect(reloadSpy).not.toHaveBeenCalled();

    reloadSpy.mockRestore();
  });

  it('opens editor with flow data when fetch succeeds', async () => {
    renderComponent();

    const editButton = await screen.findByRole('button', { name: /editar/i });
    fireEvent.click(editButton);

    // Should show flow name in editor
    await waitFor(() => {
      const input = screen.getByDisplayValue('Test Flow');
      expect(input).toBeInTheDocument();
    });

    // Should show steps section
    expect(screen.getByText(/etapas/i)).toBeInTheDocument();
  });

  it('nextStepPublicId is UUID, not string literal null', async () => {
    renderComponent();

    const editButton = await screen.findByRole('button', { name: /editar/i });
    fireEvent.click(editButton);

    // Wait for editor to load
    await waitFor(() => {
      expect(screen.getByText(/dados do fluxo/i)).toBeInTheDocument();
    });

    // Verify flow detail was parsed correctly
    // Step 1 should have nextStepPublicId as UUID
    expect(mockFlowDetail.steps[0].nextStepPublicId).toBe('step-002');
    expect(typeof mockFlowDetail.steps[0].nextStepPublicId).toBe('string');
    expect(mockFlowDetail.steps[0].nextStepPublicId).not.toBe('null');

    // Step 2 should have nextStepPublicId as null
    expect(mockFlowDetail.steps[1].nextStepPublicId).toBeNull();
  });
});
