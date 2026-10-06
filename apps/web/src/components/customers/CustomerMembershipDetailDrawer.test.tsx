// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { httpClient } from '../../lib/http.js';
import { CustomerMembershipDetailDrawer } from './CustomerMembershipDetailDrawer.js';

vi.mock('../../lib/http.js', () => ({
  httpClient: { request: vi.fn() },
}));

const membership = {
  publicId: '00000000-0000-4000-8000-000000000001',
  customerPublicId: '00000000-0000-4000-8000-000000000002',
  planPublicId: '00000000-0000-4000-8000-000000000003',
  planName: 'Plano mensal',
  status: 'ACTIVE',
  startedAt: '2026-01-01T00:00:00.000Z',
  currentPeriodStart: '2026-01-01T00:00:00.000Z',
  currentPeriodEnd: '2026-02-01T00:00:00.000Z',
  nextBillingAt: '2026-02-01T00:00:00.000Z',
  cancelAtPeriodEnd: false,
  canceledAt: null,
  priceCents: 9900,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const charges = {
  items: [
    {
      publicId: '00000000-0000-4000-8000-000000000004',
      periodStart: '2026-01-01T00:00:00.000Z',
      periodEnd: '2026-02-01T00:00:00.000Z',
      amountCents: 9900,
      status: 'PENDING',
      dueAt: '2026-01-01T00:00:00.000Z',
      paidAt: null,
      payments: [],
      gatewayCharges: [],
      financialReversals: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
};

const benefits = {
  membershipStatus: 'ACTIVE',
  cycleStart: '2026-01-01T00:00:00.000Z',
  cycleEnd: '2026-02-01T00:00:00.000Z',
  benefits: [
    {
      servicePublicId: '00000000-0000-4000-8000-000000000005',
      serviceName: 'Serviço',
      type: 'QUANTITY',
      limit: 4,
      reserved: 1,
      consumed: 1,
      released: 0,
      available: 2,
      discountPercent: null,
      cycleEnd: '2026-02-01T00:00:00.000Z',
    },
  ],
};

const paymentOptions = {
  payLocal: { active: true },
  pixLocal: {
    active: true,
    hasCredentials: true,
    keyType: 'RANDOM',
    receiverName: 'Teste',
    city: 'São Paulo',
  },
  mercadoPago: {
    active: false,
    hasCredentials: false,
    environment: 'sandbox',
    providerImplemented: true,
  },
};

function renderDrawer(canManage: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CustomerMembershipDetailDrawer
        tenantPublicId="00000000-0000-4000-8000-000000000010"
        customerPublicId={membership.customerPublicId}
        customerName="Cliente Teste"
        customerEmail="cliente@example.com"
        membershipPublicId={membership.publicId}
        priceCents={membership.priceCents}
        canManage={canManage}
        onClose={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe('CustomerMembershipDetailDrawer', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(httpClient.request).mockImplementation(async (path) => {
      if (path.includes('/membership?')) return membership;
      if (path.includes('/charges')) return charges;
      if (path.includes('/benefits')) return benefits;
      if (path === '/tenant/payment-options') return paymentOptions;
      throw new Error(`Unexpected request: ${path}`);
    });
  });

  it('renders the active detail and enables safe management actions', async () => {
    renderDrawer(true);

    expect(await screen.findByText('Cliente Teste')).not.toBeNull();
    expect(
      await screen.findByRole('button', { name: 'Confirmar pagamento manual' }),
    ).not.toBeNull();
    expect(screen.getByText(/Mensalidade ativa/u)).not.toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Confirmar pagamento manual' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(
      (screen.getByRole('button', { name: 'Gerar cobrança PIX' }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(
      (screen.getByRole('button', { name: 'Cancelar ao fim do período' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it('keeps the detail read-only when management is unavailable', async () => {
    renderDrawer(false);

    expect(await screen.findByText(/Visualização histórica/u)).not.toBeNull();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Confirmar pagamento manual' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Gerar cobrança PIX' })).toBeNull();
    });
  });

  it('shows the backend error for a failed manual payment mutation', async () => {
    vi.mocked(httpClient.request).mockImplementation(async (path) => {
      if (path.includes('/membership?')) return membership;
      if (path.includes('/charges')) return charges;
      if (path.includes('/benefits')) return benefits;
      if (path === '/tenant/payment-options') return paymentOptions;
      if (path.includes('/payments/local/confirm'))
        throw new Error('A venda de mensalidades está desativada.');
      throw new Error(`Unexpected request: ${path}`);
    });
    renderDrawer(true);

    const button = await screen.findByRole('button', { name: 'Confirmar pagamento manual' });
    button.click();

    expect(await screen.findByRole('alert')).not.toBeNull();
    expect(screen.getByText('A venda de mensalidades está desativada.')).not.toBeNull();
  });

  it('generates the configured PIX gateway charge and shows success feedback', async () => {
    vi.mocked(httpClient.request).mockImplementation(async (path) => {
      if (path.includes('/membership?')) return membership;
      if (path.includes('/charges')) return charges;
      if (path.includes('/benefits')) return benefits;
      if (path === '/tenant/payment-options') return paymentOptions;
      if (path.includes('/gateway-charges?provider=pix-local')) return { success: true };
      throw new Error(`Unexpected request: ${path}`);
    });
    renderDrawer(true);

    const button = await screen.findByRole('button', { name: 'Gerar cobrança PIX' });
    button.click();

    await waitFor(() => {
      expect(vi.mocked(httpClient.request)).toHaveBeenCalledWith(
        `/tenant/customer-membership-charges/${charges.items[0].publicId}/gateway-charges?provider=pix-local`,
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(await screen.findByText('Cobrança gerada.')).not.toBeNull();
  });

  it('highlights PAST_DUE and reuses an existing pending gateway charge', async () => {
    const pastDueMembership = { ...membership, status: 'PAST_DUE' as const };
    const pendingGatewayCharge = {
      publicId: '00000000-0000-4000-8000-000000000007',
      paymentPublicId: null,
      provider: 'pix-local',
      externalId: 'external-1',
      status: 'PENDING' as const,
      amountCents: 9900,
      pixCopyPaste: '000201pix',
      lastCheckedAt: null,
      canceledAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const pastDueCharges = {
      items: [
        {
          ...charges.items[0],
          dueAt: '2026-01-01T00:00:00.000Z',
          gatewayCharges: [pendingGatewayCharge],
        },
      ],
    };
    vi.mocked(httpClient.request).mockImplementation(async (path) => {
      if (path.includes('/membership?')) return pastDueMembership;
      if (path.includes('/charges')) return pastDueCharges;
      if (path.includes('/benefits')) return { ...benefits, membershipStatus: 'PAST_DUE' };
      if (path === '/tenant/payment-options') return paymentOptions;
      throw new Error(`Unexpected request: ${path}`);
    });
    renderDrawer(true);

    expect(await screen.findByRole('alert')).not.toBeNull();
    expect(screen.getByText('Mensalidade pendente')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Regularizar' })).not.toBeNull();
    expect(screen.getAllByText(/99,00/u).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Gerar cobrança PIX' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Atualizar gateway' })).not.toBeNull();
  });

  it('does not offer regularization for a canceled membership', async () => {
    vi.mocked(httpClient.request).mockImplementation(async (path) => {
      if (path.includes('/membership?')) return { ...membership, status: 'CANCELED' as const };
      if (path.includes('/charges'))
        return {
          items: [
            {
              ...charges.items[0],
              status: 'CANCELED' as const,
              dueAt: charges.items[0].periodStart,
            },
          ],
        };
      if (path.includes('/benefits')) return { ...benefits, membershipStatus: 'CANCELED' };
      if (path === '/tenant/payment-options') return paymentOptions;
      throw new Error(`Unexpected request: ${path}`);
    });
    renderDrawer(true);

    expect((await screen.findAllByText('Cancelada')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Regularizar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirmar pagamento manual' })).toBeNull();
  });
});
