import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../database-client/client.js';
import { CustomerMembershipService } from './customer-membership.service.js';
import { CustomerMembershipRepository } from './customer-membership.repository.js';

const actor = { userId: 1n, sessionId: 2n };

function harness(
  status: 'PENDING' | 'ACTIVE' | 'PAST_DUE' | 'PAUSED' | 'CANCELED' | 'EXPIRED' = 'ACTIVE',
) {
  const membership = { id: 10n, publicId: 'membership-1', status };
  const tx = {
    $queryRaw: vi
      .fn()
      .mockResolvedValue(
        status === 'ACTIVE' || status === 'PENDING' || status === 'PAST_DUE' || status === 'PAUSED'
          ? [{ id: 10n }]
          : [{ id: 10n }],
      ),
    customerMembership: {
      findFirst: vi.fn().mockResolvedValue(membership),
      update: vi.fn().mockResolvedValue({
        ...membership,
        status: 'CANCELED',
        canceledAt: new Date(),
        cancelAtPeriodEnd: false,
        nextBillingAt: null,
      }),
    },
    appointment: { count: vi.fn().mockResolvedValue(0) },
    customerMembershipUsage: { count: vi.fn().mockResolvedValue(0) },
    customerMembershipCharge: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    paymentGatewayCharge: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    auditLog: { create: vi.fn() },
  };
  const client = {
    $transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
  };
  const repository = new CustomerMembershipRepository(client as never);
  vi.spyOn(repository, 'find').mockResolvedValue({
    ...membership,
    status: 'CANCELED',
    canceledAt: new Date(),
    cancelAtPeriodEnd: false,
    nextBillingAt: null,
  } as never);
  return { tx, client, repository, service: new CustomerMembershipService(repository) };
}

describe('CustomerMembershipService.cancel', () => {
  it.each(['PENDING', 'ACTIVE', 'PAST_DUE', 'PAUSED'] as const)(
    'cancela %s preservando o histórico',
    async (status) => {
      const h = harness(status);
      await h.service.cancel(3n, 'membership-1', actor);
      expect(h.tx.customerMembership.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'CANCELED',
            activeKey: null,
            cancelAtPeriodEnd: false,
            nextBillingAt: null,
          }),
        }),
      );
      expect(h.tx.customerMembershipCharge.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PENDING' }),
          data: { status: 'CANCELED' },
        }),
      );
      expect(h.tx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'customer_membership.canceled' }),
        }),
      );
    },
  );

  it.each(['CANCELED', 'EXPIRED'] as const)('é idempotente para %s', async (status) => {
    const h = harness(status);
    await h.service.cancel(3n, 'membership-1', actor);
    expect(h.tx.customerMembership.update).not.toHaveBeenCalled();
    expect(h.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('bloqueia usage RESERVED e appointment com benefício aberto', async () => {
    const h = harness();
    h.tx.customerMembershipUsage.count.mockResolvedValue(1);
    await expect(h.service.cancel(3n, 'membership-1', actor)).rejects.toMatchObject({
      code: 'RESERVED_MEMBERSHIP_USAGE',
    });
    h.tx.customerMembershipUsage.count.mockResolvedValue(0);
    h.tx.appointment.count.mockResolvedValue(1);
    await expect(h.service.cancel(3n, 'membership-1', actor)).rejects.toMatchObject({
      code: 'OPEN_MEMBERSHIP_APPOINTMENTS',
    });
  });

  it('cancela gateway pendente após o commit e não desfaz o cancelamento se o provider falhar', async () => {
    const h = harness();
    h.tx.paymentGatewayCharge.findMany.mockResolvedValue([{ id: 21n }, { id: 22n }]);
    const gateway = {
      cancelPendingMembershipCharges: vi.fn(async () => {
        /* PaymentGatewayService registra a falha e não propaga. */
      }),
    };
    const service = new CustomerMembershipService(h.repository, undefined, gateway);
    await service.cancel(3n, 'membership-1', actor);
    expect(gateway.cancelPendingMembershipCharges).toHaveBeenCalledWith(3n, [21n, 22n], actor);
    expect(h.tx.customerMembership.update).toHaveBeenCalled();
  });

  it('bloqueia gateway PAID sem Payment local reconciliado', async () => {
    const h = harness();
    h.tx.paymentGatewayCharge.count.mockResolvedValue(1);
    await expect(h.service.cancel(3n, 'membership-1', actor)).rejects.toMatchObject({
      code: 'PAID_GATEWAY_CHARGE_UNRECONCILED',
    });
    expect(h.tx.customerMembership.update).not.toHaveBeenCalled();
  });

  it('retries the complete cancel transaction once for P2034', async () => {
    const h = harness();
    const p2034 = new Prisma.PrismaClientKnownRequestError('transaction conflict', {
      code: 'P2034',
      clientVersion: '7.9.1',
    });
    h.client.$transaction.mockReset();
    h.client.$transaction
      .mockRejectedValueOnce(p2034)
      .mockImplementationOnce(async (callback: (value: typeof h.tx) => unknown) => callback(h.tx));

    await expect(h.service.cancel(3n, 'membership-1', actor)).resolves.toBeDefined();

    expect(h.client.$transaction).toHaveBeenCalledTimes(2);
    expect(h.tx.customerMembership.update).toHaveBeenCalledOnce();
    expect(h.tx.auditLog.create).toHaveBeenCalledOnce();
  });
});
