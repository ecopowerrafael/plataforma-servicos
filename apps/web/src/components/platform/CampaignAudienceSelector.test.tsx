import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CampaignAudienceSelector, type AudienceSelection } from './CampaignAudienceSelector.js';

// Mock httpClient
vi.mock('../../lib/http.js', () => ({
  httpClient: {
    request: vi.fn(),
  },
}));

import { httpClient } from '../../lib/http.js';

const mockHttpClient = httpClient as any;

const mockCategories = [
  { publicId: 'cat-1', name: 'Categoria 1' },
  { publicId: 'cat-2', name: 'Categoria 2' },
];

const mockCities = [
  { city: 'São Paulo', state: 'SP', label: 'São Paulo, SP' },
  { city: 'Campinas', state: 'SP', label: 'Campinas, SP' },
  { city: 'Jundiaí', state: 'SP', label: 'Jundiaí, SP' },
  { city: 'Rio de Janeiro', state: 'RJ', label: 'Rio de Janeiro, RJ' },
  { city: 'Niterói', state: 'RJ', label: 'Niterói, RJ' },
];

const mockCounters = {
  total: 1000,
  withPhone: 950,
  neverContacted: 600,
  contacted: 350,
  suppressed: 0,
  eligible: 950,
};

const mockAudienceData = {
  data: [
    {
      publicId: 'biz-1',
      name: 'Estabelecimento 1',
      category: 'Categoria 1',
      city: 'São Paulo',
      state: 'SP',
      phone: '(11) 99999-9999',
      status: 'Nunca enviado',
    },
    {
      publicId: 'biz-2',
      name: 'Estabelecimento 2',
      category: 'Categoria 1',
      city: 'Campinas',
      state: 'SP',
      phone: '(19) 99999-9999',
      status: 'Já enviado',
    },
  ],
  pagination: {
    page: 1,
    limit: 50,
    total: 100,
    pages: 2,
  },
};

describe('CampaignAudienceSelector', () => {
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
      if (url.includes('/categories')) {
        return Promise.resolve({ items: mockCategories });
      }
      if (url.includes('/cities')) {
        return Promise.resolve({ items: mockCities });
      }
      if (url.includes('/counters')) {
        return Promise.resolve(mockCounters);
      }
      if (url.includes('/preview')) {
        return Promise.resolve(mockAudienceData);
      }
      return Promise.reject(new Error('Unknown URL'));
    });
  });

  const renderComponent = (props = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <CampaignAudienceSelector {...props} />
      </QueryClientProvider>
    );
  };

  it('renders available states derived from citiesQuery', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('SP')).toBeInTheDocument();
      expect(screen.getByText('RJ')).toBeInTheDocument();
    });
  });

  it('renders state group with correct count', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/SP \(3\)/)).toBeInTheDocument();
      expect(screen.getByText(/RJ \(2\)/)).toBeInTheDocument();
    });
  });

  it('renders "Todas as cidades" checkbox in each state group', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Todas as cidades de SP')).toBeInTheDocument();
      expect(screen.getByText('Todas as cidades de RJ')).toBeInTheDocument();
    });
  });

  it('marks state when "Todas as cidades" checkbox is clicked', async () => {
    const onSelectionChange = vi.fn();
    renderComponent({ onSelectionChange });

    await waitFor(() => {
      const spGroup = screen.getByText('SP (3)').closest('details');
      expect(spGroup).toBeInTheDocument();
    });

    const allCitiesSPCheckbox = screen.getByRole('checkbox', { name: /Todas as cidades de SP/ });
    fireEvent.click(allCitiesSPCheckbox);

    await waitFor(() => {
      expect(allCitiesSPCheckbox).toBeChecked();
    });
  });

  it('disables individual city checkboxes when state is selected', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Todas as cidades de SP')).toBeInTheDocument();
    });

    const allCitiesSPCheckbox = screen.getByRole('checkbox', { name: /Todas as cidades de SP/ });
    fireEvent.click(allCitiesSPCheckbox);

    await waitFor(() => {
      const spGroup = screen.getByText('SP (3)').closest('details') as HTMLDetailsElement;
      const cityCheckboxes = within(spGroup!).getAllByRole('checkbox');
      // First is "Todas as cidades", rest are individual cities
      for (let i = 1; i < cityCheckboxes.length; i++) {
        expect(cityCheckboxes[i]).toBeDisabled();
      }
    });
  });

  it('removes state when specific city is selected', async () => {
    renderComponent();

    // First select the entire state
    await waitFor(() => {
      const allCitiesSPCheckbox = screen.getByRole('checkbox', { name: /Todas as cidades de SP/ });
      fireEvent.click(allCitiesSPCheckbox);
    });

    // Unselect state to enable cities
    const allCitiesSPCheckbox = screen.getByRole('checkbox', { name: /Todas as cidades de SP/ });
    fireEvent.click(allCitiesSPCheckbox);

    // Now select a specific city
    await waitFor(() => {
      const spGroup = screen.getByText('SP (3)').closest('details') as HTMLDetailsElement;
      const cityCheckboxes = within(spGroup!).getAllByRole('checkbox');
      // Select first individual city
      fireEvent.click(cityCheckboxes[1]);
    });

    await waitFor(() => {
      // State checkbox should be unchecked
      expect(allCitiesSPCheckbox).not.toBeChecked();
    });
  });

  it('filters cities by search term', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Digite cidade ou UF')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Digite cidade ou UF') as HTMLInputElement;
    await userEvent.type(searchInput, 'Campinas');

    await waitFor(() => {
      expect(screen.getByText('Campinas')).toBeInTheDocument();
      expect(screen.queryByText('Niterói')).not.toBeInTheDocument();
    });
  });

  it('shows only states with results when searching', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('SP (3)')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Digite cidade ou UF') as HTMLInputElement;
    await userEvent.type(searchInput, 'Rio de Janeiro');

    await waitFor(() => {
      expect(screen.getByText('Rio de Janeiro')).toBeInTheDocument();
      expect(screen.queryByText('SP (3)')).not.toBeInTheDocument();
    });
  });

  it('clears all filters when "Limpar filtros" button is clicked', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('SP (3)')).toBeInTheDocument();
    });

    // Select some filters
    const allCitiesSPCheckbox = screen.getByRole('checkbox', { name: /Todas as cidades de SP/ });
    fireEvent.click(allCitiesSPCheckbox);

    const searchInput = screen.getByPlaceholderText('Digite cidade ou UF') as HTMLInputElement;
    await userEvent.type(searchInput, 'Campinas');

    await waitFor(() => {
      expect(allCitiesSPCheckbox).toBeChecked();
      expect(searchInput.value).toBe('Campinas');
    });

    // Click clear filters button
    const clearButton = screen.getByText('Limpar filtros');
    fireEvent.click(clearButton);

    await waitFor(() => {
      expect(allCitiesSPCheckbox).not.toBeChecked();
      expect(searchInput.value).toBe('');
    });
  });

  it('shows active filters summary', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('SP (3)')).toBeInTheDocument();
    });

    // Select state and contact status
    const allCitiesSPCheckbox = screen.getByRole('checkbox', { name: /Todas as cidades de SP/ });
    fireEvent.click(allCitiesSPCheckbox);

    const statusSelect = screen.getByDisplayValue('Todos');
    fireEvent.change(statusSelect, { target: { value: 'sent' } });

    await waitFor(() => {
      expect(screen.getByText(/Filtros ativos:/)).toBeInTheDocument();
      expect(screen.getByText(/1 estado\(s\)/)).toBeInTheDocument();
      expect(screen.getByText(/Já enviados/)).toBeInTheDocument();
    });
  });

  it('preserves states in allFiltered mode on confirm', async () => {
    const onSelectionChange = vi.fn();
    renderComponent({ onSelectionChange });

    await waitFor(() => {
      expect(screen.getByText('SP (3)')).toBeInTheDocument();
    });

    // Select state
    const allCitiesSPCheckbox = screen.getByRole('checkbox', { name: /Todas as cidades de SP/ });
    fireEvent.click(allCitiesSPCheckbox);

    // Switch to allFiltered mode
    const selectAllCheckbox = screen.getByRole('checkbox', {
      name: /Selecionar todos/,
    });
    fireEvent.click(selectAllCheckbox);

    // Confirm
    const confirmButton = screen.getByRole('button', { name: /Confirmar Seleção/ });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(onSelectionChange).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'allFiltered',
          filters: expect.objectContaining({
            states: ['SP'],
          }),
        })
      );
    });
  });

  it('preserves cities in allFiltered mode on confirm', async () => {
    const onSelectionChange = vi.fn();
    renderComponent({ onSelectionChange });

    await waitFor(() => {
      expect(screen.getByText('SP (3)')).toBeInTheDocument();
    });

    // Unselect state to enable individual cities
    const allCitiesSPCheckbox = screen.getByRole('checkbox', { name: /Todas as cidades de SP/ });
    fireEvent.click(allCitiesSPCheckbox);
    fireEvent.click(allCitiesSPCheckbox);

    // Select specific city
    const spGroup = screen.getByText('SP (3)').closest('details') as HTMLDetailsElement;
    const cityCheckboxes = within(spGroup!).getAllByRole('checkbox');
    fireEvent.click(cityCheckboxes[1]); // First individual city

    // Switch to allFiltered mode
    const selectAllCheckbox = screen.getByRole('checkbox', {
      name: /Selecionar todos/,
    });
    fireEvent.click(selectAllCheckbox);

    // Confirm
    const confirmButton = screen.getByRole('button', { name: /Confirmar Seleção/ });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(onSelectionChange).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'allFiltered',
          filters: expect.objectContaining({
            cities: expect.arrayContaining([expect.stringMatching(/\|SP$/)]),
          }),
        })
      );
    });
  });

  it('preserves contactStatus in allFiltered mode on confirm', async () => {
    const onSelectionChange = vi.fn();
    renderComponent({ onSelectionChange });

    await waitFor(() => {
      expect(screen.getByDisplayValue('Todos')).toBeInTheDocument();
    });

    // Change contact status
    const statusSelect = screen.getByDisplayValue('Todos');
    fireEvent.change(statusSelect, { target: { value: 'responded' } });

    // Switch to allFiltered mode
    const selectAllCheckbox = screen.getByRole('checkbox', {
      name: /Selecionar todos/,
    });
    fireEvent.click(selectAllCheckbox);

    // Confirm
    const confirmButton = screen.getByRole('button', { name: /Confirmar Seleção/ });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(onSelectionChange).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'allFiltered',
          filters: expect.objectContaining({
            contactStatus: 'responded',
          }),
        })
      );
    });
  });

  it('renders status select with correct options', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByDisplayValue('Todos')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Todos')).toHaveValue('all');
    });

    const statusSelect = screen.getByDisplayValue('Todos') as HTMLSelectElement;
    expect(statusSelect.querySelector('option[value="never"]')?.textContent).toBe('Nunca enviados');
    expect(statusSelect.querySelector('option[value="sent"]')?.textContent).toBe('Já enviados');
    expect(statusSelect.querySelector('option[value="responded"]')?.textContent).toBe('Responderam');
  });

  it('displays counters with correct labels', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Total encontrado')).toBeInTheDocument();
      expect(screen.getByText('Com telefone válido')).toBeInTheDocument();
      expect(screen.getByText('Nunca enviados')).toBeInTheDocument();
      expect(screen.getByText('Já enviados')).toBeInTheDocument();
      expect(screen.getByText('Suprimidos')).toBeInTheDocument();
      expect(screen.getByText('Elegíveis')).toBeInTheDocument();
    });
  });
});
