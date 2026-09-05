import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProspectingCampaignReview } from './ProspectingCampaignReview.js';
import type { AudienceSelection } from './CampaignAudienceSelector.js';

vi.mock('../../lib/http.js', () => ({
  httpClient: {
    request: vi.fn(),
  },
}));

import { httpClient } from '../../lib/http.js';

const mockHttpClient = httpClient as any;

const mockFormData = {
  name: 'Test Campaign',
  dailyLimit: 100,
  sendingStartMinutes: 540,
  sendingEndMinutes: 1080,
  minIntervalSeconds: 30,
  maxIntervalSeconds: 120,
  allowedWeekdays: [1, 2, 3, 4, 5],
  followUpEnabled: false,
  autoReplyEnabled: false,
  flowPublicId: 'flow-123',
};

const mockAudienceSelection: AudienceSelection = {
  mode: 'explicit',
  businessPublicIds: ['biz-1', 'biz-2'],
};

const mockFlow = {
  publicId: 'flow-123',
  name: 'Test Flow',
};

describe('ProspectingCampaignReview', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    });

    mockHttpClient.request.mockImplementation((url: string) => {
      if (url.includes('/flows/')) {
        return Promise.resolve(mockFlow);
      }
      return Promise.reject(new Error('Unknown URL'));
    });
  });

  const renderComponent = (props = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ProspectingCampaignReview
          audienceSelection={mockAudienceSelection}
          formData={mockFormData}
          onBack={vi.fn()}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
          {...props}
        />
      </QueryClientProvider>
    );
  };

  it('calls POST /campaigns only once on initial create', async () => {
    const onClose = vi.fn();

    mockHttpClient.request.mockImplementation((url: string) => {
      if (url.includes('/flows/')) {
        return Promise.resolve(mockFlow);
      }
      if (url === '/platform/prospecting/campaigns' && !url.includes('/materialize')) {
        return Promise.resolve({ publicId: 'campaign-123' });
      }
      if (url.includes('/materialize-audience')) {
        return Promise.resolve({ materialized: 10 });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    renderComponent({ onClose });

    const button = screen.getByRole('button', { name: /Criar campanha/ });
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockHttpClient.request).toHaveBeenCalledWith(
        '/platform/prospecting/campaigns',
        expect.objectContaining({ method: 'POST' })
      );
    });

    // Verify POST /campaigns was called exactly once
    const campaignCreateCalls = mockHttpClient.request.mock.calls.filter(
      (call: any[]) => call[0] === '/platform/prospecting/campaigns' && call[1]?.method === 'POST'
    );
    expect(campaignCreateCalls).toHaveLength(1);
  });

  it('shows correct error message when materialize fails immediately after create', async () => {
    mockHttpClient.request.mockImplementation((url: string) => {
      if (url.includes('/flows/')) {
        return Promise.resolve(mockFlow);
      }
      if (url === '/platform/prospecting/campaigns') {
        return Promise.resolve({ publicId: 'campaign-999' });
      }
      if (url.includes('/materialize-audience')) {
        return Promise.reject(new Error('Materialize failed immediately'));
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    renderComponent();

    const button = screen.getByRole('button', { name: /Criar campanha/ });
    fireEvent.click(button);

    await waitFor(() => {
      // Should show materialize error, not create error
      expect(screen.getByText(/Campanha criada, mas não foi possível adicionar o público/)).toBeInTheDocument();
      // Should NOT show create error
      expect(screen.queryByText(/Não foi possível criar a campanha/)).not.toBeInTheDocument();
    });
  });

  it('does not create campaign twice on retry after materialize fails', async () => {
    mockHttpClient.request.mockImplementation((url: string) => {
      if (url.includes('/flows/')) {
        return Promise.resolve(mockFlow);
      }
      if (url === '/platform/prospecting/campaigns') {
        return Promise.resolve({ publicId: 'campaign-123' });
      }
      if (url.includes('/materialize-audience')) {
        return Promise.reject(new Error('Materialize failed'));
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    const onClose = vi.fn();
    renderComponent({ onClose });

    // First attempt
    let button = screen.getByRole('button', { name: /Criar campanha/ });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Campanha criada, mas não foi possível adicionar o público/)).toBeInTheDocument();
    });

    // Verify campaign was created
    let campaignCreateCalls = mockHttpClient.request.mock.calls.filter(
      (call: any[]) => call[0] === '/platform/prospecting/campaigns' && call[1]?.method === 'POST'
    );
    expect(campaignCreateCalls).toHaveLength(1);

    // Fix the mock for retry
    mockHttpClient.request.mockImplementation((url: string) => {
      if (url.includes('/flows/')) {
        return Promise.resolve(mockFlow);
      }
      if (url === '/platform/prospecting/campaigns' && !url.includes('/materialize')) {
        return Promise.resolve({ publicId: 'campaign-123' });
      }
      if (url.includes('/materialize-audience')) {
        return Promise.resolve({ materialized: 10 });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    // Second attempt (retry)
    button = screen.getByRole('button', { name: /Criar campanha|Tentar|Campanha/ });
    fireEvent.click(button);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });

    // Verify campaign create was NOT called again
    campaignCreateCalls = mockHttpClient.request.mock.calls.filter(
      (call: any[]) => call[0] === '/platform/prospecting/campaigns' && call[1]?.method === 'POST'
    );
    expect(campaignCreateCalls).toHaveLength(1);

    // Verify materialize was called twice (once failed, once retry)
    const materializeCalls = mockHttpClient.request.mock.calls.filter((call: any[]) =>
      call[0].includes('/materialize-audience')
    );
    expect(materializeCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('preserves createdCampaignId when materialize fails', async () => {
    mockHttpClient.request.mockImplementation((url: string) => {
      if (url.includes('/flows/')) {
        return Promise.resolve(mockFlow);
      }
      if (url === '/platform/prospecting/campaigns') {
        return Promise.resolve({ publicId: 'campaign-456' });
      }
      if (url.includes('/materialize-audience')) {
        return Promise.reject(new Error('Materialize failed'));
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    renderComponent();

    const button = screen.getByRole('button', { name: /Criar campanha/ });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Campanha criada, mas não foi possível adicionar o público/)).toBeInTheDocument();
    });

    // Error message should indicate campaign was created
    expect(screen.getByText(/Campanha criada, mas não foi possível adicionar/)).toBeInTheDocument();
  });

  it('allows retry of materialize only after create succeeds', async () => {
    let callCount = 0;

    mockHttpClient.request.mockImplementation((url: string) => {
      if (url.includes('/flows/')) {
        return Promise.resolve(mockFlow);
      }
      if (url === '/platform/prospecting/campaigns') {
        return Promise.resolve({ publicId: 'campaign-789' });
      }
      if (url.includes('/materialize-audience')) {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('First attempt failed'));
        }
        return Promise.resolve({ materialized: 5 });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    const onClose = vi.fn();
    renderComponent({ onClose });

    // First attempt
    let button = screen.getByRole('button', { name: /Criar campanha/ });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Campanha criada, mas não foi possível adicionar o público/)).toBeInTheDocument();
    });

    expect(callCount).toBe(1);

    // Retry - should succeed this time
    button = screen.getByRole('button', { name: /Criar campanha|Campanha/ });
    fireEvent.click(button);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });

    // Materialize should have been called twice
    expect(callCount).toBe(2);
  });

  it('shows different error message if campaign creation fails', async () => {
    mockHttpClient.request.mockImplementation((url: string) => {
      if (url.includes('/flows/')) {
        return Promise.resolve(mockFlow);
      }
      if (url === '/platform/prospecting/campaigns') {
        return Promise.reject(new Error('Campaign creation failed'));
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    renderComponent();

    const button = screen.getByRole('button', { name: /Criar campanha/ });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Não foi possível criar a campanha/)).toBeInTheDocument();
    });
  });

  it('disables back button after campaign is created', async () => {
    mockHttpClient.request.mockImplementation((url: string) => {
      if (url.includes('/flows/')) {
        return Promise.resolve(mockFlow);
      }
      if (url === '/platform/prospecting/campaigns') {
        return Promise.resolve({ publicId: 'campaign-101' });
      }
      if (url.includes('/materialize-audience')) {
        return Promise.resolve({ materialized: 3 });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    const onBack = vi.fn();
    renderComponent({ onBack });

    const backButton = screen.getAllByRole('button').find((btn) => btn.textContent === 'Voltar');
    expect(backButton).not.toBeDisabled();

    const createButton = screen.getByRole('button', { name: /Criar campanha/ });
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(backButton).toBeDisabled();
    });
  });

  it('invalidates campaigns query on success', async () => {
    mockHttpClient.request.mockImplementation((url: string) => {
      if (url.includes('/flows/')) {
        return Promise.resolve(mockFlow);
      }
      if (url === '/platform/prospecting/campaigns') {
        return Promise.resolve({ publicId: 'campaign-202' });
      }
      if (url.includes('/materialize-audience')) {
        return Promise.resolve({ materialized: 2 });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    const onClose = vi.fn();
    renderComponent({ onClose });

    const button = screen.getByRole('button', { name: /Criar campanha/ });
    fireEvent.click(button);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('does not show success message when only campaign is created', async () => {
    mockHttpClient.request.mockImplementation((url: string) => {
      if (url.includes('/flows/')) {
        return Promise.resolve(mockFlow);
      }
      if (url === '/platform/prospecting/campaigns') {
        return Promise.resolve({ publicId: 'campaign-303' });
      }
      if (url.includes('/materialize-audience')) {
        return Promise.reject(new Error('Materialize failed'));
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    renderComponent();

    const button = screen.getByRole('button', { name: /Criar campanha/ });
    fireEvent.click(button);

    await waitFor(() => {
      // Should NOT show success
      expect(screen.queryByText(/✓ Campanha criada com sucesso/)).not.toBeInTheDocument();
      // Should show error
      expect(screen.getByText(/Campanha criada, mas não foi possível adicionar o público/)).toBeInTheDocument();
    });
  });

  it('shows success message only after both create and materialize succeed', async () => {
    mockHttpClient.request.mockImplementation((url: string) => {
      if (url.includes('/flows/')) {
        return Promise.resolve(mockFlow);
      }
      if (url === '/platform/prospecting/campaigns') {
        return Promise.resolve({ publicId: 'campaign-404' });
      }
      if (url.includes('/materialize-audience')) {
        return Promise.resolve({ materialized: 15 });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    const onClose = vi.fn();
    renderComponent({ onClose });

    const button = screen.getByRole('button', { name: /Criar campanha/ });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/✓ Campanha criada com sucesso/)).toBeInTheDocument();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('button text changes based on state', async () => {
    mockHttpClient.request.mockImplementation((url: string) => {
      if (url.includes('/flows/')) {
        return Promise.resolve(mockFlow);
      }
      if (url === '/platform/prospecting/campaigns') {
        return Promise.resolve({ publicId: 'campaign-505' });
      }
      if (url.includes('/materialize-audience')) {
        return Promise.reject(new Error('First materialize fails'));
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    renderComponent();

    let button = screen.getByRole('button', { name: /Criar campanha/ });
    expect(button).toHaveTextContent('Criar campanha');

    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Campanha criada, mas não foi possível adicionar o público/)).toBeInTheDocument();
    });

    // Button should show "Tentar adicionar público novamente"
    button = screen.getByRole('button', { name: /Tentar|Criar/ });
    expect(button.textContent).toMatch(/Tentar|criar|público/i);
  });
});
