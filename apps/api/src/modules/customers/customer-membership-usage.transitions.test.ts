import { describe, expect, it, vi } from 'vitest';

import { CustomerMembershipUsageService } from './customer-membership-usage.service.js';

function harness(
  initialStatus: 'RESERVED' | 'CONSUMED' | 'RELEASED' | 'REVERSED' = 'RESERVED',
  targetStatus: 'CONSUMED' | 'RELEASED' = 'CONSUMED',
) {
  let status = initialStatus;
  const updateMany = vi.fn().mockImplementation(({ where }: { where: { status: string } }) => {
    if (status !== where.status) return { count: 0 };
    status = targetStatus;
    return { count: 1 };
  });
  const client = {
    customerMembershipUsage: {
      updateMany,
      findFirst: vi.fn().mockImplementation(() => Promise.resolve({ tenantId: 7n, status })),
    },
  };
  return {
    service: new CustomerMembershipUsageService(client as never),
    client,
    getStatus: () => status,
  };
}

describe('CustomerMembershipUsageService transitions', () => {
  it('allows exactly one winner for two concurrent consume calls', async () => {
    const h = harness();

    await expect(
      Promise.all([h.service.consume(7n, 1n), h.service.consume(7n, 1n)]),
    ).resolves.toEqual([undefined, undefined]);
    expect(h.getStatus()).toBe('CONSUMED');
    expect(h.client.customerMembershipUsage.updateMany).toHaveBeenCalledTimes(2);
  });

  it('allows exactly one winner for two concurrent release calls', async () => {
    const h = harness('RESERVED', 'RELEASED');

    await expect(
      Promise.all([h.service.release(7n, 1n), h.service.release(7n, 1n)]),
    ).resolves.toEqual([undefined, undefined]);
    expect(h.getStatus()).toBe('RELEASED');
  });

  it('is idempotent for the winning final state and rejects an incompatible state', async () => {
    await expect(harness('CONSUMED').service.consume(7n, 1n)).resolves.toBeUndefined();
    await expect(harness('RELEASED').service.release(7n, 1n)).resolves.toBeUndefined();
    await expect(harness('CONSUMED').service.release(7n, 1n)).rejects.toMatchObject({
      code: 'USAGE_TRANSITION_CONFLICT',
      statusCode: 409,
    });
    await expect(harness('RELEASED').service.consume(7n, 1n)).rejects.toMatchObject({
      code: 'USAGE_TRANSITION_CONFLICT',
      statusCode: 409,
    });
  });

  it('does not reveal usage existence across tenants', async () => {
    const missing = harness();
    missing.client.customerMembershipUsage.updateMany.mockResolvedValueOnce({ count: 0 });
    missing.client.customerMembershipUsage.findFirst.mockResolvedValueOnce(null);
    await expect(missing.service.consume(7n, 1n)).rejects.toMatchObject({
      code: 'USAGE_NOT_FOUND',
      statusCode: 404,
    });

    const mismatch = harness();
    mismatch.client.customerMembershipUsage.updateMany.mockResolvedValueOnce({ count: 0 });
    mismatch.client.customerMembershipUsage.findFirst.mockResolvedValueOnce(null);
    await expect(mismatch.service.release(7n, 1n)).rejects.toMatchObject({
      code: 'USAGE_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('requires the tenant for administrative reversal', async () => {
    const h = harness();
    h.client.customerMembershipUsage.findFirst.mockResolvedValueOnce(null);
    await expect(h.service.reverse(7n, 1n)).rejects.toMatchObject({
      code: 'USAGE_NOT_FOUND',
      statusCode: 404,
    });
  });
});
