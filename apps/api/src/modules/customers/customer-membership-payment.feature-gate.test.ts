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
});
