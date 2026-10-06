import { describe, expect, it, vi } from 'vitest';

import {
  assertCustomerMembershipFeatureEnabled,
  getCustomerMembershipFeatureState,
  isCustomerMembershipFeatureEnabled,
} from './customer-membership-feature-gate.js';

function client(value: unknown) {
  return { tenant: { findFirst: vi.fn().mockResolvedValue(value) } } as never;
}

describe('customer membership feature gate', () => {
  it.each([
    [
      { operatingModel: 'SERVICE_PRICING', settings: { membershipSalesEnabled: true } },
      'OPERATING_MODEL_INCOMPATIBLE',
    ],
    [
      { operatingModel: 'MEMBERSHIP', settings: { membershipSalesEnabled: false } },
      'MEMBERSHIP_SALES_DISABLED',
    ],
    [{ operatingModel: 'MEMBERSHIP', settings: null }, 'MEMBERSHIP_SALES_DISABLED'],
  ])('blocks commercial effects for %j', async (tenant, code) => {
    await expect(assertCustomerMembershipFeatureEnabled(client(tenant), 1n)).rejects.toMatchObject({
      code,
      statusCode: 409,
    });
  });

  it('requires both the operating model and the explicit sales flag', async () => {
    const state = await getCustomerMembershipFeatureState(
      client({ operatingModel: 'MEMBERSHIP', settings: { membershipSalesEnabled: true } }),
      1n,
    );
    expect(state).toEqual({ operatingModel: 'MEMBERSHIP', membershipSalesEnabled: true });
    expect(isCustomerMembershipFeatureEnabled(state)).toBe(true);
    await expect(
      assertCustomerMembershipFeatureEnabled(
        client({ operatingModel: 'MEMBERSHIP', settings: { membershipSalesEnabled: true } }),
        1n,
      ),
    ).resolves.toBeUndefined();
  });

  it('fails closed when the tenant or settings do not exist', async () => {
    const state = await getCustomerMembershipFeatureState(client(null), 1n);
    expect(state).toEqual({ operatingModel: null, membershipSalesEnabled: false });
    expect(isCustomerMembershipFeatureEnabled(state)).toBe(false);
  });
});
