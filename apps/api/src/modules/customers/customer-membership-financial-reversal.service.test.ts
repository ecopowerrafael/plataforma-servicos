import { describe, expect, it, vi } from 'vitest';

import { CustomerMembershipFinancialReversalService } from './customer-membership-financial-reversal.service.js';

function buildTransaction(overrides: Record<string, unknown> = {}) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 10n }]),
    paymentGatewayCharge: {
      findFirst: vi.fn().mockResolvedValue({
        id: 10n,
        publicId: 'gateway-charge',
        originType: 'MEMBERSHIP_CHARGE',
        membershipChargeId: 20n,
        paymentId: 30n,
        amountCents: 100n,
      }),
    },
    customerMembershipCharge: {
      findFirst: vi
        .fn()
        .mockResolvedValueOnce({
          id: 20n,
          publicId: 'membership-charge',
          membershipId: 40n,
          amountCents: 100n,
          status: 'PAID',
          membership: { publicId: 'membership', status: 'ACTIVE' },
        })
        .mockResolvedValueOnce(null),
      update: vi.fn().mockResolvedValue({}),
    },
    payment: {
      findFirst: vi.fn().mockResolvedValue({ id: 30n, amountCents: 100n }),
    },
    customerMembershipFinancialReversal: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ publicId: 'reversal', paymentId: 30n }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    customerMembership: { update: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    ...overrides,
  };
  return tx;
}

function buildService(tx: Record<string, unknown>) {
  const client = {
    $transaction: vi.fn(async (callback: (value: unknown) => unknown) => callback(tx)),
    customerMembershipFinancialReversal: tx.customerMembershipFinancialReversal,
  };
  return { service: new CustomerMembershipFinancialReversalService(client as never), client };
}

const input = {
  tenantId: 1n,
  paymentGatewayChargeId: 10n,
  type: 'REFUND' as const,
  amountCents: 100n,
  effectiveAt: new Date('2026-10-10T12:00:00.000Z'),
  provider: 'mercadopago',
  externalReference: 'evt-1',
  idempotencyKey: 'membership-reversal:gateway-charge:REFUND',
};

describe('CustomerMembershipFinancialReversalService', () => {
  it('cria reversal total, preserva Payment e coloca a Membership corrente em PAST_DUE', async () => {
    const tx = buildTransaction();
    const { service } = buildService(tx);

    const result = await service.reconcile(input);

    expect(result).toMatchObject({ created: true, partialUnsupported: false });
    expect(tx.customerMembershipFinancialReversal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 1n,
        paymentId: 30n,
        amountCents: 100n,
        type: 'REFUND',
      }),
    });
    expect(tx.payment).not.toHaveProperty('update');
    expect(tx.customerMembershipCharge.update).toHaveBeenCalledWith({
      where: { id: 20n },
      data: { status: 'REFUNDED' },
    });
    expect(tx.customerMembership.update).toHaveBeenCalledWith({
      where: { id: 40n },
      data: { status: 'PAST_DUE' },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'customer_membership_charge.refunded' }),
    });
  });

  it('não duplica reversal nem efeito comercial para uma segunda identidade do mesmo refund', async () => {
    const tx = buildTransaction();
    tx.customerMembershipFinancialReversal.findFirst = vi.fn().mockResolvedValue({
      publicId: 'existing-reversal',
      paymentId: 30n,
    });
    const { service } = buildService(tx);

    const result = await service.reconcile({ ...input, externalReference: 'evt-2' });

    expect(result).toMatchObject({ created: false, reversalPublicId: 'existing-reversal' });
    expect(tx.customerMembershipFinancialReversal.create).not.toHaveBeenCalled();
    expect(tx.customerMembership.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('persiste charged back como CHARGEBACK e usa o audit específico', async () => {
    const tx = buildTransaction();
    const { service } = buildService(tx);

    const result = await service.reconcile({
      ...input,
      type: 'CHARGEBACK',
      externalReference: 'chargeback-event',
    });

    expect(result.created).toBe(true);
    expect(tx.customerMembershipFinancialReversal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'CHARGEBACK' }),
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'customer_membership_charge.charged_back' }),
    });
  });

  it('não coloca Membership em PAST_DUE quando a charge refundada é histórica', async () => {
    const tx = buildTransaction();
    tx.customerMembershipCharge.findFirst = vi
      .fn()
      .mockResolvedValueOnce({
        id: 20n,
        publicId: 'membership-charge',
        membershipId: 40n,
        amountCents: 100n,
        status: 'PAID',
        membership: { publicId: 'membership', status: 'ACTIVE' },
      })
      .mockResolvedValueOnce({ id: 99n });
    const { service } = buildService(tx);

    await service.reconcile(input);

    expect(tx.customerMembership.update).not.toHaveBeenCalled();
  });

  it('não reativa Membership cancelada e rejeita refund parcial sem criar ledger', async () => {
    const tx = buildTransaction();
    tx.customerMembershipCharge.findFirst = vi
      .fn()
      .mockResolvedValueOnce({
        id: 20n,
        publicId: 'membership-charge',
        membershipId: 40n,
        amountCents: 100n,
        status: 'PAID',
        membership: { publicId: 'membership', status: 'CANCELED' },
      })
      .mockResolvedValueOnce(null);
    tx.payment.findFirst = vi.fn().mockResolvedValue({ id: 30n, amountCents: 50n });
    const { service } = buildService(tx);

    const result = await service.reconcile(input);

    expect(result.partialUnsupported).toBe(true);
    expect(tx.customerMembershipFinancialReversal.create).not.toHaveBeenCalled();
    expect(tx.customerMembership.update).not.toHaveBeenCalled();
    expect(tx.customerMembershipCharge.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'customer_membership_charge.unsupported_partial_refund',
      }),
    });
  });

  it('anexa Payment reconciliado posteriormente sem alterar o ledger', async () => {
    const tx = buildTransaction();
    const { service } = buildService(tx);

    await service.attachPayment(1n, 10n, 30n);

    expect(tx.customerMembershipFinancialReversal.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 1n, paymentGatewayChargeId: 10n, paymentId: null },
      data: { paymentId: 30n },
    });
  });

  it('repete a transação quando MySQL reporta conflito transitório de leitura', async () => {
    const tx = buildTransaction();
    const client = {
      $transaction: vi
        .fn()
        .mockRejectedValueOnce(
          new Error("Record has changed since last read in table 'customer_membership_charges'"),
        )
        .mockImplementationOnce(async (callback: (value: unknown) => unknown) => callback(tx)),
      customerMembershipFinancialReversal: tx.customerMembershipFinancialReversal,
    };
    const service = new CustomerMembershipFinancialReversalService(client as never);

    const result = await service.reconcile(input);

    expect(result.created).toBe(true);
    expect(client.$transaction).toHaveBeenCalledTimes(2);
  });
});
