import { describe, expect, it, vi } from 'vitest';

import { CustomerMembershipService } from './customer-membership.service.js';

const actor = { userId: 1n, sessionId: 2n };

function repository(overrides: Record<string, unknown> = {}) {
  return {
    findSalesSettings: vi.fn().mockResolvedValue({ membershipSalesEnabled: true }),
    findPlan: vi.fn().mockResolvedValue({ id: 3n, publicId: 'plan', priceCents: 100n, benefits: [] }),
    findCustomer: vi.fn().mockResolvedValue({ id: 4n }),
    findByCustomer: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 5n }),
    audit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('CustomerMembershipService commercial policy', () => {
  it('blocks only new membership sales when the tenant flag is disabled', async () => {
    const repo = repository({
      findSalesSettings: vi.fn().mockResolvedValue({ membershipSalesEnabled: false }),
    });
    const service = new CustomerMembershipService(repo as never);

    await expect(service.create(1n, 'customer', 'plan', actor)).rejects.toMatchObject({
      code: 'MEMBERSHIP_SALES_DISABLED',
      statusCode: 409,
    });
    expect(repo.findPlan).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('keeps the canonical creation flow enabled by default', async () => {
    const repo = repository();
    const service = new CustomerMembershipService(repo as never);

    await expect(service.create(1n, 'customer', 'plan', actor)).resolves.toBeDefined();
    expect(repo.create).toHaveBeenCalledOnce();
  });
});
