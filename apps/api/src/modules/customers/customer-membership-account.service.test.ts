import { describe, expect, it, vi } from 'vitest';

import { CustomerMembershipAccountService } from './customer-membership-account.service.js';

const iso = '2026-10-01T00:00:00.000Z';
const later = '2026-11-01T00:00:00.000Z';

function membership(status: 'ACTIVE' | 'PENDING' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED') {
  return {
    id: BigInt(status === 'ACTIVE' ? 1 : status === 'PAST_DUE' ? 2 : status === 'PENDING' ? 3 : 4),
    publicId: `00000000-0000-4000-8000-00000000000${status === 'ACTIVE' ? 1 : 2}`,
    status,
    startedAt: new Date(iso),
    currentPeriodStart: new Date(iso),
    currentPeriodEnd: new Date(later),
    nextBillingAt: new Date(later),
    canceledAt: status === 'CANCELED' ? new Date(iso) : null,
    cancelAtPeriodEnd: false,
    createdAt: new Date(iso),
    plan: {
      name: 'Plano mensal',
      description: 'Benefícios do mês',
      priceCents: 9900n,
      billingInterval: 'MONTHLY',
      benefits: [
        {
          serviceId: 11n,
          service: { name: 'Corte' },
          type: 'QUANTITY',
          quantityPerCycle: 4,
          discountPercent: null,
        },
        {
          serviceId: 12n,
          service: { name: 'Barba' },
          type: 'DISCOUNT',
          quantityPerCycle: null,
          discountPercent: 10,
        },
      ],
    },
    charges: [
      {
        id: 21n,
        periodStart: new Date(iso),
        periodEnd: new Date(later),
        amountCents: 9900n,
        status: status === 'ACTIVE' ? 'PAID' : 'PENDING',
        dueAt: new Date(iso),
        paidAt: status === 'ACTIVE' ? new Date(iso) : null,
        planSnapshot: {
          benefits: [
            { serviceId: '11', type: 'QUANTITY', quantityPerCycle: 4, discountPercent: null },
            { serviceId: '12', type: 'DISCOUNT', quantityPerCycle: null, discountPercent: 10 },
          ],
        },
        financialReversals: [],
      },
    ],
  };
}

function service(records: ReturnType<typeof membership>[], usage = []) {
  const client = {
    customerMembership: { findMany: vi.fn().mockResolvedValue(records) },
    customerMembershipUsage: { groupBy: vi.fn().mockResolvedValue(usage) },
  };
  return { service: new CustomerMembershipAccountService(client as never), client };
}

describe('CustomerMembershipAccountService', () => {
  it('separa Membership atual ACTIVE do histórico e expõe charge e saldo do backend', async () => {
    const active = membership('ACTIVE');
    const canceled = membership('CANCELED');
    const { service: account, client } = service(
      [canceled, active],
      [
        { serviceId: 11n, status: 'RESERVED', _count: 1 },
        { serviceId: 11n, status: 'CONSUMED', _count: 1 },
      ],
    );

    const result = await account.getForCustomer(1n, 5n);

    expect(result.current?.status).toBe('ACTIVE');
    expect(result.current?.charges[0]).toMatchObject({ status: 'PAID', amountCents: 9900 });
    expect(result.current?.benefits).toEqual([
      expect.objectContaining({ serviceName: 'Corte', available: 2, consumed: 1, reserved: 1 }),
      expect.objectContaining({ serviceName: 'Barba', discountPercent: 10 }),
    ]);
    expect(result.history).toHaveLength(1);
    expect(result.history[0]?.status).toBe('CANCELED');
    expect(client.customerMembershipUsage.groupBy).toHaveBeenCalledOnce();
  });

  it.each(['PENDING', 'PAST_DUE'] as const)(
    'preserva o status %s sem habilitar benefícios',
    async (status) => {
      const { service: account } = service([membership(status)]);
      const result = await account.getForCustomer(1n, 5n);
      expect(result.current?.status).toBe(status);
      expect(result.current?.benefits).toEqual([]);
      expect(result.current?.benefitsAvailable).toBe(false);
    },
  );

  it('trata CANCELED e EXPIRED como histórico e retorna empty quando não há Membership corrente', async () => {
    const { service: account } = service([membership('EXPIRED'), membership('CANCELED')]);
    const result = await account.getForCustomer(1n, 5n);
    expect(result.current).toBeNull();
    expect(result.history).toHaveLength(2);
  });

  it('mantém a leitura histórica sem consultar feature gate', async () => {
    const { service: account, client } = service([membership('CANCELED')]);
    const result = await account.getForCustomer(1n, 5n);
    expect(result.current).toBeNull();
    expect(result.history[0]?.status).toBe('CANCELED');
    expect(client).not.toHaveProperty('tenantSettings');
  });

  it('expõe evento financeiro sem alterar o histórico já pago', async () => {
    const paid = membership('CANCELED');
    paid.charges[0].status = 'PAID';
    paid.charges[0].paidAt = new Date(iso);
    paid.charges[0].financialReversals = [{ type: 'CHARGEBACK' }];

    const { service: account } = service([paid]);
    const result = await account.getForCustomer(1n, 5n);

    expect(result.history[0]?.charges[0]).toMatchObject({
      status: 'PAID',
      financialEvent: 'CHARGEBACK',
    });
  });
});
