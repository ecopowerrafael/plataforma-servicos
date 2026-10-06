import { describe, expect, it, vi } from 'vitest';

import { CustomerMembershipPaymentService } from './customer-membership-payment.service.js';
import { type Prisma, type PrismaClient } from '../../database-client/client.js';

describe('CustomerMembershipPaymentService — reconciliação externa com vendas desabilitadas', () => {
  it('registra o pagamento do webhook sem reativar a membership', async () => {
    const membershipUpdate = vi.fn().mockResolvedValue({});
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 11n }]),
      tenant: {
        findFirst: vi.fn().mockResolvedValue({
          operatingModel: 'MEMBERSHIP',
          settings: { membershipSalesEnabled: false },
        }),
      },
      customerMembershipCharge: {
        findFirst: vi.fn().mockResolvedValue({
          id: 11n,
          publicId: 'membership-charge',
          status: 'PENDING',
          amountCents: 4900,
          periodStart: new Date('2026-10-01T00:00:00.000Z'),
          periodEnd: new Date('2026-11-01T00:00:00.000Z'),
          membershipId: 12n,
          membership: { status: 'PENDING', publicId: 'membership' },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      payment: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 13n,
          originType: 'MEMBERSHIP_CHARGE',
          appointmentId: null,
          membershipChargeId: 11n,
          debtId: null,
        }),
      },
      customerMembership: { update: membershipUpdate },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as unknown as Prisma.TransactionClient;

    const service = new CustomerMembershipPaymentService({} as PrismaClient);

    await service.confirmMembershipChargePaymentWithinTransaction(
      tx,
      10n,
      'membership-charge',
      14n,
      { userId: null, sessionId: null },
      { allowDisabledFeatureReconciliation: true },
    );

    expect(tx.payment.create).toHaveBeenCalledOnce();
    expect(tx.customerMembershipCharge.update).toHaveBeenCalledWith({
      where: { id: 11n },
      data: expect.objectContaining({ status: 'PAID' }),
    });
    expect(membershipUpdate).not.toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'customer_membership_charge.payment_reconciled_sales_disabled',
      }),
    });
  });

  it('não ativa uma adesão paga depois do fim do período inicial', async () => {
    const membershipUpdate = vi.fn().mockResolvedValue({});
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 11n }]),
      tenant: {
        findFirst: vi.fn().mockResolvedValue({
          operatingModel: 'MEMBERSHIP',
          settings: { membershipSalesEnabled: true },
        }),
      },
      customerMembershipCharge: {
        findFirst: vi.fn().mockResolvedValue({
          id: 11n,
          publicId: 'initial-charge',
          status: 'PENDING',
          amountCents: 4900,
          periodStart: new Date('2026-09-01T00:00:00.000Z'),
          periodEnd: new Date('2026-10-01T00:00:00.000Z'),
          membershipId: 12n,
          membership: {
            status: 'PENDING',
            publicId: 'membership',
            currentPeriodStart: null,
          },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      payment: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 13n,
          originType: 'MEMBERSHIP_CHARGE',
          appointmentId: null,
          membershipChargeId: 11n,
          debtId: null,
        }),
      },
      customerMembership: { update: membershipUpdate },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as unknown as Prisma.TransactionClient;

    const service = new CustomerMembershipPaymentService({} as PrismaClient);

    await service.confirmMembershipChargePaymentWithinTransaction(tx, 10n, 'initial-charge', 14n, {
      userId: null,
      sessionId: null,
    });

    expect(tx.payment.create).toHaveBeenCalledOnce();
    expect(tx.customerMembershipCharge.update).toHaveBeenCalledWith({
      where: { id: 11n },
      data: expect.objectContaining({ status: 'PAID' }),
    });
    expect(membershipUpdate).not.toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'customer_membership.initial_charge_paid_after_period_end',
      }),
    });
  });

  it('recupera PAST_DUE com as datas originais da renewal charge', async () => {
    const membershipUpdate = vi.fn().mockResolvedValue({});
    const periodStart = new Date('2026-10-01T00:00:00.000Z');
    const periodEnd = new Date('2026-11-01T00:00:00.000Z');
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 21n }]),
      tenant: {
        findFirst: vi.fn().mockResolvedValue({
          operatingModel: 'MEMBERSHIP',
          settings: { membershipSalesEnabled: true },
        }),
      },
      customerMembershipCharge: {
        findFirst: vi.fn().mockResolvedValue({
          id: 21n,
          publicId: 'renewal-charge',
          status: 'PENDING',
          amountCents: 4900,
          periodStart,
          periodEnd,
          membershipId: 22n,
          membership: {
            status: 'PAST_DUE',
            publicId: 'membership',
            currentPeriodStart: new Date('2026-09-01T00:00:00.000Z'),
          },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      payment: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 23n,
          originType: 'MEMBERSHIP_CHARGE',
          appointmentId: null,
          membershipChargeId: 21n,
          debtId: null,
        }),
      },
      customerMembership: { update: membershipUpdate },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as unknown as Prisma.TransactionClient;

    await new CustomerMembershipPaymentService(
      {} as PrismaClient,
    ).confirmMembershipChargePaymentWithinTransaction(tx, 20n, 'renewal-charge', 24n, {
      userId: null,
      sessionId: null,
    });

    expect(membershipUpdate).toHaveBeenCalledWith({
      where: { id: 22n },
      data: {
        status: 'ACTIVE',
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        nextBillingAt: periodEnd,
      },
    });
  });
});
