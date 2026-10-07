import { describe, expect, it, vi } from 'vitest';

import { CustomerMembershipRepository } from './customer-membership.repository.js';

describe('CustomerMembershipRepository current membership policy', () => {
  it('queries only current statuses, leaving CANCELED and EXPIRED as history', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const repository = new CustomerMembershipRepository({
      customerMembership: { findFirst },
    } as never);

    await repository.findByCustomer(1n, 2n);

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 1n,
        customerId: 2n,
        status: { in: ['PENDING', 'ACTIVE', 'PAST_DUE', 'PAUSED'] },
      },
      include: { plan: true, charges: true },
    });
  });
});
