import { describe, expect, it, vi } from 'vitest';

import { Prisma } from '../../database-client/client.js';
import { CustomerMembershipService } from './customer-membership.service.js';

const actor = { userId: 1n, sessionId: 2n };

function repository(overrides: Record<string, unknown> = {}) {
  const result = {
    client: {
      tenant: {
        findFirst: vi.fn().mockResolvedValue({
          operatingModel: 'MEMBERSHIP',
          settings: { membershipSalesEnabled: true },
        }),
      },
    },
    findSalesSettings: vi.fn().mockResolvedValue({ membershipSalesEnabled: true }),
    findOperatingModel: vi.fn().mockResolvedValue({ operatingModel: 'MEMBERSHIP' }),
    findPlan: vi
      .fn()
      .mockResolvedValue({ id: 3n, publicId: 'plan', priceCents: 100n, benefits: [] }),
    findCustomer: vi.fn().mockResolvedValue({ id: 4n }),
    findByCustomer: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 5n }),
    audit: vi.fn().mockResolvedValue(undefined),
    withTenantLock: vi.fn(),
    ...overrides,
  };
  result.withTenantLock.mockImplementation(
    async (_tenantId: bigint, callback: (repository: typeof result) => Promise<unknown>) =>
      callback(result),
  );
  return result;
}

describe('CustomerMembershipService commercial policy', () => {
  it('blocks only new membership sales when the tenant flag is disabled', async () => {
    const repo = repository({
      findSalesSettings: vi.fn().mockResolvedValue({ membershipSalesEnabled: false }),
      client: {
        tenant: {
          findFirst: vi.fn().mockResolvedValue({
            operatingModel: 'MEMBERSHIP',
            settings: { membershipSalesEnabled: false },
          }),
        },
      },
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

  it.each(['ACTIVE', 'PENDING', 'PAST_DUE', 'PAUSED'] as const)(
    'blocks a second adhesion while the existing membership is %s',
    async (status) => {
      const repo = repository({
        findByCustomer: vi.fn().mockResolvedValue({ status }),
      });
      const service = new CustomerMembershipService(repo as never);

      await expect(service.create(1n, 'customer', 'plan', actor)).rejects.toMatchObject({
        code: 'CUSTOMER_MEMBERSHIP_EXISTS',
        statusCode: 409,
      });
      expect(repo.withTenantLock).toHaveBeenCalledOnce();
      expect(repo.create).not.toHaveBeenCalled();
    },
  );

  it.each(['CANCELED', 'EXPIRED'] as const)(
    'keeps %s as history and allows the canonical service to attempt a new adhesion',
    async () => {
      const repo = repository({
        findByCustomer: vi.fn().mockResolvedValue(null),
      });
      const service = new CustomerMembershipService(repo as never);

      await expect(service.create(1n, 'customer', 'plan', actor)).resolves.toBeDefined();
      expect(repo.findByCustomer).toHaveBeenCalledWith(1n, 4n);
      expect(repo.create).toHaveBeenCalledOnce();
    },
  );

  it('rejects a cross-tenant plan without creating commercial records', async () => {
    const repo = repository({ findPlan: vi.fn().mockResolvedValue(null) });
    const service = new CustomerMembershipService(repo as never);

    await expect(
      service.create(1n, 'customer', 'plan-from-other-tenant', actor),
    ).rejects.toMatchObject({
      code: 'CUSTOMER_MEMBERSHIP_PLAN_NOT_FOUND',
      statusCode: 404,
    });
    expect(repo.findCustomer).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('rejects a plan that became inactive before POST without creating commercial records', async () => {
    const repo = repository({ findPlan: vi.fn().mockResolvedValue(null) });
    const service = new CustomerMembershipService(repo as never);

    await expect(service.create(1n, 'customer', 'deactivated-plan', actor)).rejects.toMatchObject({
      code: 'CUSTOMER_MEMBERSHIP_PLAN_NOT_FOUND',
      statusCode: 404,
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('evaluates the gate at POST time when the sales flag changes after catalog load', async () => {
    const tenantLookup = vi
      .fn()
      .mockResolvedValueOnce({
        operatingModel: 'MEMBERSHIP',
        settings: { membershipSalesEnabled: true },
      })
      .mockResolvedValueOnce({
        operatingModel: 'MEMBERSHIP',
        settings: { membershipSalesEnabled: false },
      });
    const repo = repository({
      client: { tenant: { findFirst: tenantLookup } },
    });
    const service = new CustomerMembershipService(repo as never);

    await expect(service.create(1n, 'customer', 'plan', actor)).resolves.toBeDefined();
    await expect(service.create(1n, 'customer-2', 'plan', actor)).rejects.toMatchObject({
      code: 'MEMBERSHIP_SALES_DISABLED',
      statusCode: 409,
    });
    expect(repo.create).toHaveBeenCalledOnce();
  });

  it('evaluates the operating model at POST time when it changes after catalog load', async () => {
    const tenantLookup = vi
      .fn()
      .mockResolvedValueOnce({
        operatingModel: 'MEMBERSHIP',
        settings: { membershipSalesEnabled: true },
      })
      .mockResolvedValueOnce({
        operatingModel: 'SERVICE_PRICING',
        settings: { membershipSalesEnabled: true },
      });
    const repo = repository({
      client: { tenant: { findFirst: tenantLookup } },
    });
    const service = new CustomerMembershipService(repo as never);

    await expect(service.create(1n, 'customer', 'plan', actor)).resolves.toBeDefined();
    await expect(service.create(1n, 'customer-2', 'plan', actor)).rejects.toMatchObject({
      code: 'OPERATING_MODEL_INCOMPATIBLE',
      statusCode: 409,
    });
    expect(repo.create).toHaveBeenCalledOnce();
  });

  it('serializes concurrent adhesions so only one membership can win', async () => {
    let existing = false;
    let lockHeld = false;
    const repo = repository({
      findByCustomer: vi
        .fn()
        .mockImplementation(async () => (existing ? { status: 'PENDING' } : null)),
      create: vi.fn().mockImplementation(async () => {
        existing = true;
        return { id: 5n };
      }),
    });
    repo.withTenantLock.mockReset();
    repo.withTenantLock.mockImplementation(
      async (_tenantId: bigint, callback: (locked: unknown) => Promise<unknown>) => {
        if (lockHeld) throw new Error('SERIALIZABLE_LOCK_CONFLICT');
        lockHeld = true;
        try {
          return await callback(repo);
        } finally {
          lockHeld = false;
        }
      },
    );
    const service = new CustomerMembershipService(repo as never);

    const results = await Promise.allSettled([
      service.create(1n, 'customer', 'plan', actor),
      service.create(1n, 'customer', 'plan', actor),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(repo.create).toHaveBeenCalledOnce();
  });

  it('uses the persisted plan price and benefits for exactly one initial charge', async () => {
    const plan = {
      id: 3n,
      publicId: 'plan',
      name: 'Plano real',
      priceCents: 10000n,
      billingInterval: 'MONTHLY',
      benefits: [
        {
          serviceId: 7n,
          type: 'QUANTITY',
          quantityPerCycle: 4,
          discountPercent: null,
        },
      ],
    };
    const chargeCreate = vi.fn().mockResolvedValue({ id: 6n });
    const repo = repository({
      client: {
        tenant: {
          findFirst: vi.fn().mockResolvedValue({
            operatingModel: 'MEMBERSHIP',
            settings: { membershipSalesEnabled: true },
          }),
        },
        customerMembershipCharge: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: chargeCreate,
        },
        auditLog: { create: vi.fn().mockResolvedValue(undefined) },
      },
      findOperatingModel: vi
        .fn()
        .mockResolvedValue({ operatingModel: 'MEMBERSHIP', timezone: 'UTC' }),
      findPlan: vi.fn().mockResolvedValue(plan),
      create: vi.fn().mockResolvedValue({
        id: 5n,
        publicId: 'membership',
        status: 'PENDING',
        plan,
        startedAt: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        nextBillingAt: null,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    });
    const service = new CustomerMembershipService(repo as never, {} as never);

    await service.create(1n, 'customer', 'plan', actor);

    expect(chargeCreate).toHaveBeenCalledOnce();
    expect(chargeCreate.mock.calls[0]?.[0].data).toMatchObject({
      amountCents: 10000n,
      planSnapshot: {
        planPublicId: 'plan',
        priceCents: 10000,
        benefits: [
          {
            serviceId: '7',
            type: 'QUANTITY',
            quantityPerCycle: 4,
            discountPercent: null,
          },
        ],
      },
    });
  });

  it('retries the complete create transaction once for P2034', async () => {
    const p2034 = new Prisma.PrismaClientKnownRequestError('transaction conflict', {
      code: 'P2034',
      clientVersion: '7.9.1',
    });
    const plan = {
      id: 3n,
      publicId: 'plan',
      name: 'Plano real',
      priceCents: 100n,
      billingInterval: 'MONTHLY',
      benefits: [],
    };
    const chargeCreate = vi.fn().mockResolvedValue({ id: 6n });
    const repo = repository({
      client: {
        tenant: {
          findFirst: vi.fn().mockResolvedValue({
            operatingModel: 'MEMBERSHIP',
            settings: { membershipSalesEnabled: true },
          }),
        },
        customerMembershipCharge: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: chargeCreate,
        },
        auditLog: { create: vi.fn().mockResolvedValue(undefined) },
      },
      findOperatingModel: vi
        .fn()
        .mockResolvedValue({ operatingModel: 'MEMBERSHIP', timezone: 'UTC' }),
      findPlan: vi.fn().mockResolvedValue(plan),
      create: vi.fn().mockResolvedValue({
        id: 5n,
        publicId: 'membership',
        status: 'PENDING',
        plan,
      }),
    });
    let attempts = 0;
    repo.withTenantLock.mockReset();
    repo.withTenantLock.mockImplementation(
      async (_tenantId: bigint, callback: (locked: typeof repo) => Promise<unknown>) => {
        attempts += 1;
        if (attempts === 1) throw p2034;
        return callback(repo);
      },
    );
    const service = new CustomerMembershipService(repo as never, {} as never);

    await expect(service.create(1n, 'customer', 'plan', actor)).resolves.toBeDefined();

    expect(attempts).toBe(2);
    expect(repo.create).toHaveBeenCalledOnce();
    expect(chargeCreate).toHaveBeenCalledOnce();
  });
});
