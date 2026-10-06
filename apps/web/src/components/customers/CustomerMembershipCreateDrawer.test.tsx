// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { httpClient } from '../../lib/http.js';
import { CustomerMembershipCreateDrawer } from './CustomerMembershipCreateDrawer.js';

vi.mock('../../lib/http.js', () => ({
  httpClient: { request: vi.fn() },
}));

const customer = {
  publicId: '00000000-0000-4000-8000-000000000002',
  name: 'Cliente Teste',
  socialName: null,
  phone: '11999999999',
  whatsapp: null,
  email: 'cliente@example.com',
  birthDate: null,
  document: null,
  notes: null,
  source: 'MANUAL',
  acceptsCommunications: false,
  primaryUnitPublicId: null,
  customFields: {},
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  lastCompletedAt: null,
  nextAppointmentAt: null,
  appointmentCount: 0,
  segments: [],
  paidTotalCents: null,
  averageTicketCents: null,
  lastServiceName: null,
  lastProfessionalName: null,
  nextServiceName: null,
};

const plan = {
  publicId: '00000000-0000-4000-8000-000000000003',
  name: 'Plano mensal',
  description: null,
  priceCents: 9900,
  billingInterval: 'MONTHLY' as const,
  active: true,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  benefits: [
    {
      publicId: '00000000-0000-4000-8000-000000000004',
      servicePublicId: '00000000-0000-4000-8000-000000000005',
      serviceName: 'Serviço',
      type: 'QUANTITY' as const,
      quantityPerCycle: 4,
      discountPercent: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
};

const membership = {
  publicId: '00000000-0000-4000-8000-000000000006',
  customerPublicId: customer.publicId,
  planPublicId: plan.publicId,
  planName: plan.name,
  status: 'PENDING' as const,
  startedAt: null,
  currentPeriodStart: null,
  currentPeriodEnd: null,
  nextBillingAt: null,
  cancelAtPeriodEnd: false,
  canceledAt: null,
  priceCents: plan.priceCents,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const listResponse = {
  items: [customer],
  page: { page: 1, limit: 20, total: 1, totalPages: 1 },
};

function renderDrawer(onCreated = vi.fn(), plans = [plan]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <CustomerMembershipCreateDrawer
          tenantPublicId="00000000-0000-4000-8000-000000000010"
          plans={plans}
          onClose={vi.fn()}
          onCreated={onCreated}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('CustomerMembershipCreateDrawer', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(httpClient.request).mockImplementation(async (path) => {
      if (path.startsWith('/tenant/customers?')) return listResponse;
      if (path.includes('/membership')) return membership;
      throw new Error(`Unexpected request: ${path}`);
    });
  });

  it('selects a customer and active plan, confirms, and creates a pending membership', async () => {
    const onCreated = vi.fn();
    renderDrawer(onCreated);

    fireEvent.click(await screen.findByRole('option', { name: /Cliente Teste/u }));
    fireEvent.click(await screen.findByRole('option', { name: /Plano mensal/u }));

    expect(screen.getByText('Confirme os dados')).not.toBeNull();
    expect(screen.getByText(/99,00/u)).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Criar mensalidade' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(membership, customer, plan));
    expect(vi.mocked(httpClient.request)).toHaveBeenCalledWith(
      `/tenant/customers/${customer.publicId}/membership`,
      expect.objectContaining({ method: 'POST', body: { planPublicId: plan.publicId } }),
    );
  });

  it('prevents duplicate creates while the request is pending', async () => {
    const user = userEvent.setup();
    let resolveCreate: ((value: typeof membership) => void) | undefined;
    vi.mocked(httpClient.request).mockImplementation((path) => {
      if (path.startsWith('/tenant/customers?')) return Promise.resolve(listResponse);
      if (path.includes('/membership'))
        return new Promise((resolve) => {
          resolveCreate = resolve;
        });
      throw new Error(`Unexpected request: ${path}`);
    });
    renderDrawer();

    fireEvent.click(await screen.findByRole('option', { name: /Cliente Teste/u }));
    fireEvent.click(await screen.findByRole('option', { name: /Plano mensal/u }));
    const createButton = screen.getByRole('button', { name: 'Criar mensalidade' });
    await user.click(createButton);
    await user.click(createButton);

    await waitFor(() => {
      expect(
        vi.mocked(httpClient.request).mock.calls.filter(([path]) => path.includes('/membership')),
      ).toHaveLength(1);
    });
    expect((createButton as HTMLButtonElement).disabled).toBe(true);
    resolveCreate?.(membership);
  });

  it('shows a visible error when membership creation fails', async () => {
    vi.mocked(httpClient.request).mockImplementation(async (path) => {
      if (path.startsWith('/tenant/customers?')) return listResponse;
      if (path.includes('/membership')) throw new Error('Venda de mensalidades desativada.');
      throw new Error(`Unexpected request: ${path}`);
    });
    renderDrawer();

    fireEvent.click(await screen.findByRole('option', { name: /Cliente Teste/u }));
    fireEvent.click(await screen.findByRole('option', { name: /Plano mensal/u }));
    fireEvent.click(screen.getByRole('button', { name: 'Criar mensalidade' }));

    expect(await screen.findByRole('alert')).not.toBeNull();
    expect(screen.getByText('Venda de mensalidades desativada.')).not.toBeNull();
  });

  it('shows the empty state when there are no active plans', async () => {
    renderDrawer(vi.fn(), [{ ...plan, active: false }]);

    fireEvent.click(await screen.findByRole('option', { name: /Cliente Teste/u }));

    expect(await screen.findByText('Nenhum plano de mensalidade ativo')).not.toBeNull();
    expect(screen.queryByRole('option', { name: /Plano mensal/u })).toBeNull();
  });
});
