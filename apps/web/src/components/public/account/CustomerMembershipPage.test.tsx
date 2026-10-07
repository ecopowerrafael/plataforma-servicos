// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { httpClient } from '../../../lib/http.js';
import { ACCOUNT_SECTIONS } from './customer-account.js';
import { CustomerMembershipPage } from './CustomerMembershipPage.js';

vi.mock('../../../lib/http.js', () => ({ httpClient: { request: vi.fn() } }));

const iso = '2026-01-01T00:00:00.000Z';
const next = '2026-02-01T00:00:00.000Z';

const paymentState = {
  membershipStatus: 'PENDING' as const,
  charge: {
    periodStart: iso,
    periodEnd: next,
    amountCents: 9900,
    status: 'PENDING' as const,
    dueAt: iso,
    paidAt: null,
  },
  gateway: null,
  canGenerateGatewayCharge: true,
  canRefreshGatewayCharge: false,
};

const gatewayPaymentState = {
  ...paymentState,
  gateway: {
    provider: 'mercadopago',
    status: 'PENDING' as const,
    amountCents: 9900,
    currency: 'BRL',
    pixCopyPaste: '000201pix-code',
    lastCheckedAt: null,
    canceledAt: null,
  },
  canGenerateGatewayCharge: false,
  canRefreshGatewayCharge: true,
};

const item = (status: 'ACTIVE' | 'PENDING' | 'PAST_DUE' | 'PAUSED' | 'CANCELED' | 'EXPIRED') => ({
  publicId: `00000000-0000-4000-8000-00000000000${status === 'ACTIVE' ? '1' : status === 'PENDING' ? '2' : status === 'PAST_DUE' ? '3' : status === 'CANCELED' ? '4' : '5'}`,
  status,
  planName: 'Plano mensal',
  planDescription: 'Benefícios do mês',
  priceCents: 9900,
  billingInterval: 'MONTHLY' as const,
  startedAt: iso,
  currentPeriodStart: iso,
  currentPeriodEnd: next,
  nextBillingAt: next,
  canceledAt: status === 'CANCELED' ? iso : null,
  cancelAtPeriodEnd: false,
  charges: [
    {
      periodStart: iso,
      periodEnd: next,
      amountCents: 9900,
      status: status === 'ACTIVE' ? ('PAID' as const) : ('PENDING' as const),
      dueAt: iso,
      paidAt: status === 'ACTIVE' ? iso : null,
    },
  ],
  benefits: [
    {
      serviceName: 'Corte',
      type: 'QUANTITY' as const,
      limit: 4,
      reserved: 1,
      consumed: 1,
      available: 2,
      discountPercent: null,
    },
  ],
  benefitsAvailable: status === 'ACTIVE',
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CustomerMembershipPage slug="studio" />
    </QueryClientProvider>,
  );
}

describe('CustomerMembershipPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('adiciona Minha mensalidade ao menu e mostra ACTIVE com benefícios e cobrança', async () => {
    vi.mocked(httpClient.request).mockResolvedValue({ current: item('ACTIVE'), history: [] });
    expect(ACCOUNT_SECTIONS.find((section) => section.id === 'membership')?.label).toBe(
      'Minha mensalidade',
    );
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Mensalidade ativa' })).not.toBeNull();
    expect(screen.getByText('Seus benefícios')).not.toBeNull();
    expect(screen.getByText('2 disponível(is)')).not.toBeNull();
    expect(screen.getAllByText('Próxima cobrança').length).toBeGreaterThan(0);
  });

  it('mostra PAST_DUE com ação de regularização e preserva a mensagem de reservas', async () => {
    vi.mocked(httpClient.request)
      .mockResolvedValueOnce({ current: item('PAST_DUE'), history: [] })
      .mockResolvedValueOnce({ ...paymentState, membershipStatus: 'PAST_DUE' as const });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Mensalidade pendente' })).not.toBeNull();
    expect(screen.getByText(/Agendamentos já reservados não são cancelados/u)).not.toBeNull();
    expect(await screen.findByRole('button', { name: 'Regularizar mensalidade' })).not.toBeNull();
  });

  it('mostra empty e histórico cancelado sem CTA comercial', async () => {
    vi.mocked(httpClient.request).mockResolvedValue({
      current: null,
      history: [item('CANCELED'), item('EXPIRED')],
    });
    renderPage();
    expect(await screen.findByText('Você ainda não possui uma mensalidade.')).not.toBeNull();
    expect(screen.getByText('Mensalidade cancelada')).not.toBeNull();
    expect(screen.getByText('Mensalidade expirada')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /assinar|pagar|reativar/iu })).toBeNull();
  });

  it('lista planos públicos, confirma adesão somente com planPublicId e mostra sucesso', async () => {
    const user = userEvent.setup();
    const plan = {
      publicId: '00000000-0000-4000-8000-000000000006',
      name: 'Plano mensal',
      description: 'Quatro cortes por ciclo',
      priceCents: 9900,
      billingInterval: 'MONTHLY' as const,
      benefits: [
        {
          serviceName: 'Corte',
          type: 'QUANTITY' as const,
          quantityPerCycle: 4,
          discountPercent: null,
        },
      ],
    };
    vi.mocked(httpClient.request).mockImplementation(((
      url: string,
      options?: { method?: string },
    ) => {
      if (url.endsWith('/membership/plans')) return Promise.resolve({ items: [plan] }) as never;
      if (url.endsWith('/customer/membership') && options?.method === 'POST')
        return Promise.resolve({
          publicId: '00000000-0000-4000-8000-000000000007',
          customerPublicId: '00000000-0000-4000-8000-000000000008',
          planPublicId: plan.publicId,
          planName: plan.name,
          status: 'PENDING',
          startedAt: null,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          nextBillingAt: null,
          cancelAtPeriodEnd: false,
          canceledAt: null,
          priceCents: 9900,
          createdAt: iso,
          updatedAt: iso,
        }) as never;
      if (url.endsWith('/customer/membership/payment'))
        return Promise.resolve(paymentState) as never;
      return Promise.resolve({ current: null, history: [] }) as never;
    }) as never);

    renderPage();
    expect(await screen.findByText('Plano mensal')).not.toBeNull();
    expect(screen.getByText('Corte: 4 por ciclo')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Escolher plano' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar mensalidade' }));

    expect(httpClient.request).toHaveBeenCalledWith(
      '/public/sites/studio/customer/membership',
      expect.objectContaining({ method: 'POST', body: { planPublicId: plan.publicId } }),
    );
    expect((await screen.findByRole('status')).textContent).toContain(
      'Mensalidade criada — conclua o pagamento.',
    );
  });

  it('não exibe catálogo comercial quando já existe uma mensalidade ativa', async () => {
    vi.mocked(httpClient.request).mockResolvedValue({ current: item('ACTIVE'), history: [] });
    renderPage();
    await screen.findByRole('heading', { name: 'Mensalidade ativa' });
    expect(screen.queryByText('Planos disponíveis')).toBeNull();
    expect(httpClient.request).not.toHaveBeenCalledWith(
      '/public/sites/studio/customer/membership/plans',
      expect.anything(),
    );
  });

  it('desabilita confirmação durante a criação e impede double click', async () => {
    const user = userEvent.setup();
    let resolveCreate!: (value: unknown) => void;
    const plan = {
      publicId: '00000000-0000-4000-8000-000000000010',
      name: 'Plano mensal',
      description: null,
      priceCents: 10000,
      billingInterval: 'MONTHLY' as const,
      benefits: [],
    };
    vi.mocked(httpClient.request).mockImplementation(((
      url: string,
      options?: { method?: string },
    ) => {
      if (url.endsWith('/membership/plans')) return Promise.resolve({ items: [plan] }) as never;
      if (url.endsWith('/customer/membership') && options?.method === 'POST')
        return new Promise((resolve) => {
          resolveCreate = resolve;
        }) as never;
      return Promise.resolve({ current: null, history: [] }) as never;
    }) as never);

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Escolher plano' }));
    const confirm = screen.getByRole('button', {
      name: 'Confirmar mensalidade',
    }) as HTMLButtonElement;
    await user.click(confirm);
    expect(confirm.disabled).toBe(true);
    expect(
      (
        vi.mocked(httpClient.request).mock.calls as unknown as Array<[string, { method?: string }?]>
      ).filter(
        ([url, options]) => url.endsWith('/customer/membership') && options?.method === 'POST',
      ),
    ).toHaveLength(1);

    resolveCreate({
      publicId: '00000000-0000-4000-8000-000000000011',
      customerPublicId: '00000000-0000-4000-8000-000000000012',
      planPublicId: plan.publicId,
      planName: plan.name,
      status: 'PENDING',
      startedAt: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      nextBillingAt: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      priceCents: plan.priceCents,
      createdAt: iso,
      updatedAt: iso,
    });
    expect(await screen.findByRole('status')).not.toBeNull();
  });

  it('mostra PENDING, PAUSED e cancelamento programado sem ações comerciais', async () => {
    vi.mocked(httpClient.request)
      .mockResolvedValueOnce({
        current: { ...item('PENDING'), cancelAtPeriodEnd: true },
        history: [item('PAUSED')],
      })
      .mockResolvedValueOnce(paymentState);
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Aguardando pagamento' })).not.toBeNull();
    expect(screen.getByText(/Cancelamento programado para/iu)).not.toBeNull();
    expect(await screen.findByRole('button', { name: 'Realizar pagamento' })).not.toBeNull();
  });

  it('renderiza ilimitado e desconto com os dados do backend', async () => {
    vi.mocked(httpClient.request).mockResolvedValue({
      current: {
        ...item('ACTIVE'),
        benefits: [
          {
            serviceName: 'Barba',
            type: 'UNLIMITED',
            limit: null,
            reserved: null,
            consumed: null,
            available: null,
            discountPercent: null,
          },
          {
            serviceName: 'Massagem',
            type: 'DISCOUNT',
            limit: null,
            reserved: null,
            consumed: null,
            available: null,
            discountPercent: 10,
          },
        ],
      },
      history: [],
    });
    renderPage();
    expect(await screen.findByText('Ilimitado')).not.toBeNull();
    expect(screen.getByText('10% de desconto')).not.toBeNull();
  });

  it('expõe loading e erro sem resposta técnica', async () => {
    let resolveRequest!: (value: unknown) => void;
    vi.mocked(httpClient.request).mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }) as never,
    );
    renderPage();
    expect(screen.getByText('Carregando sua mensalidade…')).not.toBeNull();
    resolveRequest({ current: null, history: [] });
    cleanup();
    vi.mocked(httpClient.request).mockRejectedValue(new Error('internal stack'));
    renderPage();
    expect(await screen.findByText('Não foi possível carregar sua mensalidade.')).not.toBeNull();
    expect(screen.queryByText('internal stack')).toBeNull();
  });

  it('reutiliza gateway existente, copia PIX e atualiza o pagamento', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    vi.mocked(httpClient.request)
      .mockResolvedValueOnce({ current: item('PENDING'), history: [] })
      .mockResolvedValueOnce(gatewayPaymentState)
      .mockResolvedValueOnce({
        ...gatewayPaymentState,
        gateway: { ...gatewayPaymentState.gateway, status: 'PAID' as const },
      });

    renderPage();
    expect(await screen.findByDisplayValue('000201pix-code')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Copiar código PIX' }));
    expect(writeText).toHaveBeenCalledWith('000201pix-code');
    expect(screen.getByRole('button', { name: 'Copiado' })).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Atualizar pagamento' }));
    expect(httpClient.request).toHaveBeenCalledWith(
      '/public/sites/studio/customer/membership/payment/refresh',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('gera PIX somente quando não existe gateway reutilizável', async () => {
    const user = userEvent.setup();
    vi.mocked(httpClient.request)
      .mockResolvedValueOnce({ current: item('PENDING'), history: [] })
      .mockResolvedValueOnce(paymentState)
      .mockResolvedValueOnce(gatewayPaymentState);

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Realizar pagamento' }));
    expect(httpClient.request).toHaveBeenCalledWith(
      '/public/sites/studio/customer/membership/payment/gateway',
      expect.objectContaining({ method: 'POST', body: {} }),
    );
  });

  it('não exibe nova ação quando gate está OFF e mostra erro seguro do pagamento', async () => {
    vi.mocked(httpClient.request)
      .mockResolvedValueOnce({ current: item('PENDING'), history: [] })
      .mockRejectedValueOnce(new Error('MEMBERSHIP_SALES_DISABLED'));

    renderPage();
    expect(
      await screen.findByText('Não foi possível carregar ou atualizar o pagamento.'),
    ).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Realizar pagamento' })).toBeNull();
    expect(screen.queryByText('MEMBERSHIP_SALES_DISABLED')).toBeNull();
  });
});
