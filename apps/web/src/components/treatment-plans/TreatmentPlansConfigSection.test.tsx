import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { TreatmentPlansConfigSection } from './TreatmentPlansConfigSection.js';
import { httpClient } from '../../lib/http.js';

vi.mock('../../lib/http.js');

const mockTenantPublicId = '550e8400-e29b-41d4-a716-446655440000';

describe('TreatmentPlansConfigSection', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
    (httpClient.request as any).mockResolvedValue({});
  });

  it('should render configuration section', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TreatmentPlansConfigSection
          tenantPublicId={mockTenantPublicId}
          canUpdate={true}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Orçamentos e Planos')).toBeInTheDocument();
    expect(screen.getByLabelText('Título do módulo')).toBeInTheDocument();
  });

  it('should display all preset buttons', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TreatmentPlansConfigSection
          tenantPublicId={mockTenantPublicId}
          canUpdate={true}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Clínica de estética')).toBeInTheDocument();
    expect(screen.getByText('Odontologia')).toBeInTheDocument();
    expect(screen.getByText('Oficina')).toBeInTheDocument();
    expect(screen.getByText('Tatuagem')).toBeInTheDocument();
    expect(screen.getByText('Consultoria')).toBeInTheDocument();
    expect(screen.getByText('Personal Trainer')).toBeInTheDocument();
  });

  it('should update fields when preset is selected', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TreatmentPlansConfigSection
          tenantPublicId={mockTenantPublicId}
          canUpdate={true}
        />
      </QueryClientProvider>,
    );

    const aestheticButton = screen.getByRole('button', { name: 'Clínica de estética' });
    fireEvent.click(aestheticButton);

    const moduleTitle = screen.getByDisplayValue('Tratamentos') as HTMLInputElement;
    expect(moduleTitle.value).toBe('Tratamentos');
  });

  it('should show permission message when canUpdate is false', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TreatmentPlansConfigSection
          tenantPublicId={mockTenantPublicId}
          canUpdate={false}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Você não tem permissão para atualizar estas configurações.')).toBeInTheDocument();
  });

  it('should disable form when canUpdate is false', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TreatmentPlansConfigSection
          tenantPublicId={mockTenantPublicId}
          canUpdate={false}
        />
      </QueryClientProvider>,
    );

    const fieldset = screen.getByRole('group') as HTMLFieldSetElement;
    expect(fieldset.disabled).toBe(true);
  });

  it('should populate fields from terminology prop', () => {
    const terminology = {
      treatmentPlanModuleTitle: 'Meus Tratamentos',
      treatmentPlanSingular: 'Tratamento',
      treatmentPlanPlural: 'Tratamentos',
      treatmentPlanSessionSingular: 'Sessão',
      treatmentPlanSessionPlural: 'Sessões',
    };

    render(
      <QueryClientProvider client={queryClient}>
        <TreatmentPlansConfigSection
          tenantPublicId={mockTenantPublicId}
          terminology={terminology}
          canUpdate={true}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByDisplayValue('Meus Tratamentos')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Tratamento')).toBeInTheDocument();
  });

  it('should submit form data correctly', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TreatmentPlansConfigSection
          tenantPublicId={mockTenantPublicId}
          canUpdate={true}
        />
      </QueryClientProvider>,
    );

    const submitButton = screen.getByRole('button', { name: 'Salvar configurações' });
    expect(submitButton).toBeInTheDocument();
  });
});
