import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { TreatmentPlansReminderConfigSection } from './TreatmentPlansReminderConfigSection.js';
import { httpClient } from '../../lib/http.js';

vi.mock('../../lib/http.js');

const mockTenantPublicId = '550e8400-e29b-41d4-a716-446655440000';

describe('TreatmentPlansReminderConfigSection', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();

    const mockConfig = {
      enabled: true,
      channel: 'WHATSAPP',
      sequence: [
        { enabled: true, delayValue: 1, delayUnit: 'DAY', message: 'Test message 1' },
        { enabled: true, delayValue: 3, delayUnit: 'DAY', message: 'Test message 2' },
      ],
    };

    (httpClient.request as any).mockResolvedValue(mockConfig);
  });

  it('should render reminder configuration section', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TreatmentPlansReminderConfigSection tenantPublicId={mockTenantPublicId} canUpdate={true} />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Lembretes automáticos de orçamento')).toBeInTheDocument();
  });

  it('should load and display configuration', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TreatmentPlansReminderConfigSection tenantPublicId={mockTenantPublicId} canUpdate={true} />
      </QueryClientProvider>,
    );

    // Should show loading initially
    expect(screen.getByLabelText('Carregando conteúdo')).toBeInTheDocument();

    // Wait for config to load
    await screen.findByLabelText('Ativar lembretes automáticos');
    expect(screen.getByLabelText('Ativar lembretes automáticos')).toBeInTheDocument();
  });

  it('should toggle reminders on/off', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TreatmentPlansReminderConfigSection tenantPublicId={mockTenantPublicId} canUpdate={true} />
      </QueryClientProvider>,
    );

    await screen.findByLabelText('Ativar lembretes automáticos');
    const checkbox = screen.getByLabelText('Ativar lembretes automáticos') as HTMLInputElement;

    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);
  });

  it('should show message preview', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TreatmentPlansReminderConfigSection
          tenantPublicId={mockTenantPublicId}
          canUpdate={true}
          treatmentPlanLabels={{ singular: 'Orçamento' }}
        />
      </QueryClientProvider>,
    );

    await screen.findByText('Ver preview');
    const previewBtn = screen.getAllByText('Ver preview')[0];
    fireEvent.click(previewBtn);

    expect(screen.getByText(/Preview/)).toBeInTheDocument();
  });

  it('should disable form when canUpdate is false', () => {
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <TreatmentPlansReminderConfigSection
          tenantPublicId={mockTenantPublicId}
          canUpdate={false}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByLabelText('Ativar lembretes automáticos')).toBeDisabled();
  });

  it('should allow adding steps', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TreatmentPlansReminderConfigSection tenantPublicId={mockTenantPublicId} canUpdate={true} />
      </QueryClientProvider>,
    );

    await screen.findByText('Adicionar etapa');
    const addBtn = screen.getByText('Adicionar etapa');
    fireEvent.click(addBtn);

    // Should see the new step
    expect(screen.getByText('Lembrete 3')).toBeInTheDocument();
  });

  it('uses the tenantPublicId path for GET and PATCH', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TreatmentPlansReminderConfigSection tenantPublicId={mockTenantPublicId} canUpdate={true} />
      </QueryClientProvider>,
    );

    await screen.findByLabelText('Ativar lembretes automáticos');
    expect(httpClient.request).toHaveBeenCalledWith(
      `/platform/tenants/${mockTenantPublicId}/reminder-config`,
      expect.objectContaining({
        schema: expect.anything(),
        tenantPublicId: mockTenantPublicId,
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Salvar configuração' }));
    await vi.waitFor(() => {
      expect(httpClient.request).toHaveBeenCalledWith(
        `/platform/tenants/${mockTenantPublicId}/reminder-config`,
        expect.objectContaining({
          method: 'PATCH',
          schema: expect.anything(),
          tenantPublicId: mockTenantPublicId,
        }),
      );
    });
  });

  it('shows a friendly load error', async () => {
    (httpClient.request as any).mockRejectedValueOnce(new Error('unexpected details'));
    render(
      <QueryClientProvider client={queryClient}>
        <TreatmentPlansReminderConfigSection tenantPublicId={mockTenantPublicId} canUpdate={true} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Não foi possível carregar os lembretes.')).toBeInTheDocument();
    expect(screen.queryByText('unexpected details')).not.toBeInTheDocument();
  });
});
