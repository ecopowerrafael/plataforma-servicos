import { describe, expect, it, vi } from 'vitest';

import { CustomerMembershipPlanService } from './customer-membership-plan.service.js';

const plan = {
  publicId: '00000000-0000-4000-8000-000000000001',
  name: 'Plano mensal',
  description: 'Benefícios do mês',
  priceCents: 9900n,
  billingInterval: 'MONTHLY',
  benefits: [
    {
      service: { name: 'Corte' },
      type: 'QUANTITY',
      quantityPerCycle: 4,
      discountPercent: null,
    },
  ],
};

function repository(feature: { operatingModel: string; membershipSalesEnabled: boolean }) {
  return {
    client: {
      tenant: {
        findFirst: vi.fn().mockResolvedValue({
          operatingModel: feature.operatingModel,
          settings: { membershipSalesEnabled: feature.membershipSalesEnabled },
        }),
      },
    },
    listAvailable: vi.fn().mockResolvedValue([plan]),
  };
}

describe('CustomerMembershipPlanService self-service catalog', () => {
  it.each([
    [{ operatingModel: 'SERVICE_PRICING', membershipSalesEnabled: true }],
    [{ operatingModel: 'MEMBERSHIP', membershipSalesEnabled: false }],
  ])('returns no plans when either feature gate condition is off', async (feature) => {
    const repo = repository(feature);
    const result = await new CustomerMembershipPlanService(repo as never).listAvailableForCustomer(
      1n,
    );

    expect(result).toEqual({ items: [] });
    expect(repo.listAvailable).not.toHaveBeenCalled();
  });

  it('exposes only active-plan public data with persisted price and benefits', async () => {
    const repo = repository({ operatingModel: 'MEMBERSHIP', membershipSalesEnabled: true });
    const result = await new CustomerMembershipPlanService(repo as never).listAvailableForCustomer(
      1n,
    );

    expect(result).toEqual({
      items: [
        {
          publicId: plan.publicId,
          name: plan.name,
          description: plan.description,
          priceCents: 9900,
          billingInterval: 'MONTHLY',
          benefits: [
            {
              serviceName: 'Corte',
              type: 'QUANTITY',
              quantityPerCycle: 4,
              discountPercent: null,
            },
          ],
        },
      ],
    });
  });

  it('preserves benefit timestamps in the tenant plan response', async () => {
    const createdAt = new Date('2026-10-07T12:00:00.000Z');
    const updatedAt = new Date('2026-10-07T12:05:00.000Z');
    const repo = {
      find: vi.fn().mockResolvedValue({
        ...plan,
        active: true,
        sortOrder: 0,
        createdAt,
        updatedAt,
        benefits: [
          {
            ...plan.benefits[0],
            publicId: '00000000-0000-4000-8000-000000000002',
            service: { publicId: '00000000-0000-4000-8000-000000000003', name: 'Corte' },
            createdAt,
            updatedAt,
          },
        ],
      }),
    };

    const result = await new CustomerMembershipPlanService(repo as never).get(1n, plan.publicId);

    expect(result.benefits[0]).toMatchObject({
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    });
  });
});
