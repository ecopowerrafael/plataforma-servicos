import { describe, expect, it, vi } from 'vitest';

import {
  ChargeSource,
  CustomerMembershipBenefitResolver,
} from './customer-membership-benefit-resolver.js';

describe('customer membership benefit resolver feature gate', () => {
  it('falls back to the normal service price while sales are disabled', async () => {
    const client = {
      tenant: {
        findFirst: vi.fn().mockResolvedValue({
          operatingModel: 'MEMBERSHIP',
          settings: { membershipSalesEnabled: false },
        }),
      },
      customerMembership: { findFirst: vi.fn() },
      customerMembershipCharge: { findFirst: vi.fn() },
      customerMembershipUsage: { groupBy: vi.fn() },
    };

    const result = await new CustomerMembershipBenefitResolver(client as never).resolveBenefit(
      1n,
      2n,
      3n,
      1000n,
    );

    expect(result).toMatchObject({
      covered: false,
      chargeSource: ChargeSource.SERVICE_PRICE,
      referencePriceCents: 1000n,
      amountDueCents: 1000n,
    });
    expect(client.customerMembership.findFirst).not.toHaveBeenCalled();
  });
});
