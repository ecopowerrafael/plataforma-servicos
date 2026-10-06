import { describe, expect, it, vi } from 'vitest';

const resolveBenefit = vi.fn();

vi.mock('../customers/customer-membership-benefit-resolver.js', () => ({
  ChargeSource: {
    SERVICE_PRICE: 'SERVICE_PRICE',
    MEMBERSHIP_INCLUDED: 'MEMBERSHIP_INCLUDED',
    MEMBERSHIP_DISCOUNT: 'MEMBERSHIP_DISCOUNT',
  },
  CustomerMembershipBenefitResolver: class {
    resolveBenefit = resolveBenefit;
  },
}));

import { AppointmentService } from './appointment.service.js';

const periodEnd = new Date('2026-11-01T15:00:00.000Z');

function buildService(allowSingleServiceSales: boolean) {
  const persisted: Array<Record<string, unknown>> = [];
  const repo = {
    customer: vi.fn().mockResolvedValue({ id: 1n }),
    professional: vi.fn().mockResolvedValue({ id: 2n }),
    service: vi.fn().mockResolvedValue({
      id: 3n,
      durationMinutes: 30,
      hasPostServiceBreak: false,
      postServiceBreakMinutes: 0,
      priceCents: 100n,
      pricingMode: 'FIXED',
    }),
    combo: vi.fn().mockResolvedValue(null),
    link: vi.fn().mockResolvedValue({
      active: true,
      durationMinutes: null,
      hasPostServiceBreak: null,
      postServiceBreakMinutes: null,
      priceCents: null,
    }),
    unit: vi.fn().mockResolvedValue(null),
    conflict: vi.fn().mockResolvedValue(false),
    createIfAvailable: vi.fn().mockImplementation(async (data: Record<string, unknown>) => {
      persisted.push(data);
      throw new Error('stop after charge-source decision');
    }),
  };
  const client = {
    tenant: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ operatingModel: 'MEMBERSHIP', settings: { allowSingleServiceSales } }),
    },
    customerMembershipCharge: {
      findFirst: vi.fn().mockResolvedValue({
        membership: { cancelAtPeriodEnd: true, currentPeriodEnd: periodEnd },
      }),
    },
  };
  const service = new AppointmentService(
    repo as never,
    { assertSlot: vi.fn().mockResolvedValue(undefined) } as never,
    client as never,
  );
  return { service, repo, persisted };
}

async function save(service: AppointmentService, startsAt: Date) {
  return (service as unknown as { save: (...args: unknown[]) => Promise<unknown> }).save(
    1n,
    {
      customerPublicId: 'customer',
      professionalPublicId: 'professional',
      servicePublicId: 'service',
      startsAt: startsAt.toISOString(),
      source: 'INTERNAL',
    },
    { userId: null, sessionId: null },
  );
}

describe('membership appointment period boundary', () => {
  it('keeps benefit strictly before currentPeriodEnd and falls back at/after it', async () => {
    resolveBenefit.mockResolvedValue({
      covered: true,
      chargeSource: 'MEMBERSHIP_INCLUDED',
      referencePriceCents: 100n,
      amountDueCents: 0n,
      membershipChargeId: 44n,
    });

    const inside = buildService(true);
    await expect(save(inside.service, new Date(periodEnd.getTime() - 1))).rejects.toThrow(
      'stop after charge-source decision',
    );
    expect(inside.persisted[0]).toMatchObject({ chargeSource: 'MEMBERSHIP_INCLUDED' });

    const boundary = buildService(true);
    await expect(save(boundary.service, periodEnd)).rejects.toThrow(
      'stop after charge-source decision',
    );
    expect(boundary.persisted[0]).toMatchObject({
      chargeSource: 'SERVICE_PRICE',
      amountDueCents: 100n,
    });
    expect(boundary.persisted[0]).not.toHaveProperty('membershipChargeId');

    const after = buildService(true);
    await expect(save(after.service, new Date(periodEnd.getTime() + 1))).rejects.toThrow(
      'stop after charge-source decision',
    );
    expect(after.persisted[0]).toMatchObject({
      chargeSource: 'SERVICE_PRICE',
      amountDueCents: 100n,
    });
    expect(after.persisted[0]).not.toHaveProperty('membershipChargeId');
  });

  it('blocks boundary fallback when single-service sales are disabled', async () => {
    resolveBenefit.mockResolvedValue({
      covered: true,
      chargeSource: 'MEMBERSHIP_INCLUDED',
      referencePriceCents: 100n,
      amountDueCents: 0n,
      membershipChargeId: 44n,
    });
    const { service, repo } = buildService(false);

    await expect(save(service, periodEnd)).rejects.toMatchObject({
      code: 'SINGLE_SERVICE_SALES_DISABLED',
      statusCode: 409,
    });
    expect(repo.createIfAvailable).not.toHaveBeenCalled();
  });
});
