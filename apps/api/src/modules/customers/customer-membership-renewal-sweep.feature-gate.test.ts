import { describe, expect, it, vi } from 'vitest';

import { CustomerMembershipRenewalSweepService } from './customer-membership-renewal-sweep.service.js';

describe('customer membership renewal feature gate', () => {
  it('does not create a renewal charge while sales are disabled', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 1n }]),
      customerMembership: {
        findFirst: vi.fn().mockResolvedValue({
          id: 1n,
          tenantId: 10n,
          publicId: 'membership',
          status: 'ACTIVE',
          nextBillingAt: new Date('2026-10-01T00:00:00.000Z'),
          cancelAtPeriodEnd: false,
          currentPeriodEnd: new Date('2026-10-01T00:00:00.000Z'),
          plan: { billingInterval: 'MONTHLY' },
          charges: [
            {
              periodStart: new Date('2026-09-01T00:00:00.000Z'),
              planSnapshot: { priceCents: 1000, billingInterval: 'MONTHLY' },
              amountCents: 1000n,
            },
          ],
          tenant: {
            operatingModel: 'MEMBERSHIP',
            timezone: 'America/Sao_Paulo',
            settings: { membershipSalesEnabled: false },
          },
        }),
        updateMany: vi.fn(),
      },
      customerMembershipCharge: { create: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue(undefined) },
    };
    const client = {
      customerMembership: {
        findMany: vi.fn().mockResolvedValue([{ id: 1n, tenantId: 10n, publicId: 'membership' }]),
      },
      $transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
    };

    const result = await new CustomerMembershipRenewalSweepService(client as never).run(
      new Date('2026-10-02T00:00:00.000Z'),
    );

    expect(result.renewedChargesCreated).toBe(0);
    expect(tx.customerMembershipCharge.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'customer_membership.renewal_sales_disabled' }),
      }),
    );
  });

  it('efetiva cancelamento agendado de membership PAST_DUE e cancela cobrança gateway pendente', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 1n }]),
      customerMembership: {
        findFirst: vi.fn().mockResolvedValue({
          id: 1n,
          tenantId: 10n,
          publicId: 'membership',
          status: 'PAST_DUE',
          nextBillingAt: new Date('2026-10-01T00:00:00.000Z'),
          currentPeriodEnd: new Date('2026-10-01T00:00:00.000Z'),
          cancelAtPeriodEnd: true,
          charges: [],
          tenant: {
            operatingModel: 'MEMBERSHIP',
            timezone: 'America/Sao_Paulo',
            settings: { membershipSalesEnabled: false },
          },
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      customerMembershipUsage: { count: vi.fn().mockResolvedValue(0) },
      appointment: { count: vi.fn().mockResolvedValue(0) },
      customerMembershipCharge: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      paymentGatewayCharge: {
        findMany: vi.fn().mockResolvedValue([{ id: 91n }]),
      },
      auditLog: { create: vi.fn().mockResolvedValue(undefined) },
    };
    const gatewayCancellation = {
      cancelPendingMembershipCharges: vi.fn().mockResolvedValue(undefined),
    };
    const client = {
      customerMembership: {
        findMany: vi.fn().mockResolvedValue([{ id: 1n, tenantId: 10n, publicId: 'membership' }]),
      },
      $transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
    };

    const result = await new CustomerMembershipRenewalSweepService(
      client as never,
      50,
      gatewayCancellation,
    ).run(new Date('2026-10-02T00:00:00.000Z'));

    expect(result.cancelAtPeriodEndApplied).toBe(1);
    expect(tx.customerMembership.updateMany).toHaveBeenCalledWith({
      where: { id: 1n, tenantId: 10n },
      data: {
        status: 'CANCELED',
        activeKey: null,
        canceledAt: new Date('2026-10-01T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
        nextBillingAt: null,
      },
    });
    expect(tx.customerMembershipCharge.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 10n, membershipId: 1n, status: 'PENDING' },
      data: { status: 'CANCELED' },
    });
    expect(gatewayCancellation.cancelPendingMembershipCharges).toHaveBeenCalledWith(10n, [91n], {
      userId: null,
      sessionId: null,
    });
  });
});
