// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { httpClient } from '../../lib/http.js';
import { CustomerProfile } from './CustomerProfile.js';

vi.mock('../../lib/http.js', () => ({
  httpClient: { request: vi.fn() },
}));

const profile = {
  customer: {
    publicId: '00000000-0000-4000-8000-000000000001',
    name: 'Cliente CRM',
    socialName: null,
    phone: null,
    whatsapp: null,
    email: 'cliente@example.com',
    birthDate: null,
    document: null,
    notes: 'Observação',
    source: 'MANUAL',
    acceptsCommunications: false,
    primaryUnitPublicId: null,
    customFields: {},
    status: 'ACTIVE',
    createdAt: '2026-01-01T12:00:00.000Z',
    updatedAt: '2026-01-01T12:00:00.000Z',
  },
  appointments: [],
  summary: {
    completedCount: 0,
    canceledCount: 0,
    noShowCount: 0,
    nextAppointment: null,
    lastCompleted: null,
    recurringServices: [],
    recurringProfessionals: [],
  },
  relationship: { loyaltyBalances: [], usedCoupons: [], waitlist: [] },
  financial: {
    paidTotalCents: '9900',
    paidCount: 1,
    averageTicketCents: '0',
    recentPayments: [
      {
        publicId: '00000000-0000-4000-8000-000000000002',
        amountCents: '9900',
        kind: 'PAYMENT',
        status: 'PAID',
        originType: 'MEMBERSHIP_CHARGE',
        createdAt: '2026-08-01T13:00:00.000Z',
        occurredAt: '2026-08-02T13:00:00.000Z',
        appointmentPublicId: null,
        membership: {
          planName: 'Plano Essencial',
          periodStart: '2026-08-01T12:00:00.000Z',
          periodEnd: '2026-08-31T12:00:00.000Z',
        },
        reversals: [
          {
            type: 'REFUND',
            amountCents: '9900',
            effectiveAt: '2026-08-03T13:00:00.000Z',
          },
          {
            type: 'CHARGEBACK',
            amountCents: '9900',
            effectiveAt: '2026-08-04T13:00:00.000Z',
          },
        ],
      },
    ],
  },
  membership: {
    current: {
      publicId: '00000000-0000-4000-8000-000000000003',
      status: 'ACTIVE',
      planName: 'Plano Essencial',
      priceCents: '9900',
      billingInterval: 'MONTHLY',
      currentPeriodStart: '2026-08-01T12:00:00.000Z',
      currentPeriodEnd: '2026-08-31T12:00:00.000Z',
      nextBillingAt: '2026-09-01T12:00:00.000Z',
      cancelAtPeriodEnd: false,
      benefits: [
        {
          serviceName: 'Corte',
          type: 'QUANTITY',
          quantityPerCycle: 4,
          discountPercent: null,
          available: 3,
        },
      ],
    },
    history: [],
  },
  reviews: [],
  timeline: [],
  relationshipStatus: {
    segments: [],
    daysSinceLastVisit: null,
    averageIntervalDays: null,
    noReturnAfterDays: null,
    inactiveAfterDays: null,
    recoveryEligible: false,
  },
  whatsapp: null,
};

describe('CustomerProfile Membership CRM', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders Membership read-only summary and financial origin/reversals', async () => {
    vi.mocked(httpClient.request).mockResolvedValue(profile as never);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <CustomerProfile
            tenantPublicId="00000000-0000-4000-8000-000000000010"
            publicId={profile.customer.publicId}
            terminology="Cliente"
            canReadPayments
          />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect((await screen.findAllByText('Mensalidade')).length).toBeGreaterThan(0);
    expect(screen.getByText('Plano Essencial')).toBeTruthy();
    expect(screen.getByText('3 de 4 disponíveis')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Financeiro' }));
    expect(screen.getAllByText('Mensalidade').length).toBeGreaterThan(0);
    expect(screen.getByText((text) => text.includes('Reembolso de mensalidade'))).toBeTruthy();
    expect(screen.getByText((text) => text.includes('Pagamento contestado'))).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull();
  });

  it('renders an explicit empty Membership state without commercial actions', async () => {
    vi.mocked(httpClient.request).mockResolvedValue({
      ...profile,
      financial: null,
      membership: { current: null, history: [] },
    } as never);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <CustomerProfile
            tenantPublicId="00000000-0000-0000-0000-000000000010"
            publicId={profile.customer.publicId}
            terminology="Cliente"
          />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Este cliente não possui Membership registrada.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Financeiro' })).toBeNull();
  });
});
