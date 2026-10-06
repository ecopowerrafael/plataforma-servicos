import { describe, expect, it } from 'vitest';
import {
  CustomerMembershipBenefitsBalanceResponseSchema,
  CustomerMembershipChargePublicSchema,
  CustomerMembershipPublicSchema,
} from '@plataforma/shared';

const iso = '2026-01-01T00:00:00.000Z';

const membership = (status: 'PENDING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED') => ({
  publicId: '00000000-0000-4000-8000-000000000001',
  customerPublicId: '00000000-0000-4000-8000-000000000002',
  planPublicId: '00000000-0000-4000-8000-000000000003',
  planName: 'Plano mensal',
  status,
  startedAt: iso,
  currentPeriodStart: iso,
  currentPeriodEnd: iso,
  nextBillingAt: iso,
  cancelAtPeriodEnd: status === 'CANCELED',
  canceledAt: status === 'CANCELED' ? iso : null,
  priceCents: 9900,
  createdAt: iso,
  updatedAt: iso,
});

describe('customer Membership detail contract', () => {
  it.each(['PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED'] as const)(
    'accepts the %s detail state',
    (status) => {
      expect(CustomerMembershipPublicSchema.parse(membership(status)).status).toBe(status);
    },
  );

  it('accepts refunded charges and chargeback reversals without appointment fields', () => {
    const parsed = CustomerMembershipChargePublicSchema.parse({
      publicId: '00000000-0000-4000-8000-000000000004',
      periodStart: iso,
      periodEnd: iso,
      amountCents: 9900,
      status: 'REFUNDED',
      dueAt: iso,
      paidAt: iso,
      payments: [],
      gatewayCharges: [],
      financialReversals: [
        {
          publicId: '00000000-0000-4000-8000-000000000005',
          type: 'CHARGEBACK',
          amountCents: 9900,
          effectiveAt: iso,
          provider: 'mercadopago',
          externalReference: 'external-1',
        },
      ],
      createdAt: iso,
      updatedAt: iso,
    });
    expect(parsed.financialReversals[0]?.type).toBe('CHARGEBACK');
  });

  it('keeps benefit balance server-owned', () => {
    const parsed = CustomerMembershipBenefitsBalanceResponseSchema.parse({
      membershipStatus: 'ACTIVE',
      cycleStart: iso,
      cycleEnd: iso,
      benefits: [
        {
          servicePublicId: '00000000-0000-4000-8000-000000000006',
          serviceName: 'Serviço',
          type: 'QUANTITY',
          limit: 4,
          reserved: 1,
          consumed: 1,
          released: 0,
          available: 2,
          discountPercent: null,
          cycleEnd: iso,
        },
      ],
    });
    expect(parsed.benefits[0]?.available).toBe(2);
  });
});
