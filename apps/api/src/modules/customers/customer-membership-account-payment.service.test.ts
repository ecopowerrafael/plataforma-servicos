import { describe, expect, it, vi } from 'vitest';

import { CustomerMembershipAccountPaymentService } from './customer-membership-account-payment.service.js';

const periodStart = new Date('2026-10-01T00:00:00.000Z');
const periodEnd = new Date('2026-11-01T00:00:00.000Z');

function charge(
  status: 'PENDING' | 'FAILED' = 'PENDING',
  gatewayStatus?: 'PENDING' | 'PROCESSING' | 'PAID' | 'CANCELED' | 'REFUNDED',
  start = periodStart,
) {
  return {
    publicId: `charge-${start.toISOString()}`,
    periodStart: start,
    periodEnd,
    amountCents: 4900n,
    status,
    dueAt: start,
    paidAt: null,
    gatewayCharges:
      gatewayStatus === undefined
        ? []
        : [
            {
              publicId: 'gateway-charge',
              provider: 'mercadopago',
              status: gatewayStatus,
              amountCents: 4900n,
              currency: 'BRL',
              pixCopyPaste: 'pix-code',
              lastCheckedAt: null,
              canceledAt: null,
            },
          ],
  };
}

function membership(
  status: 'PENDING' | 'PAST_DUE' | 'ACTIVE' | 'PAUSED',
  charges: ReturnType<typeof charge>[],
) {
  return {
    status,
    createdAt: periodStart,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    charges,
  };
}

function setup(
  record: ReturnType<typeof membership>,
  gate = { operatingModel: 'MEMBERSHIP', settings: { membershipSalesEnabled: true } },
) {
  const client = {
    customerMembership: { findMany: vi.fn().mockResolvedValue([record]) },
    tenant: { findFirst: vi.fn().mockResolvedValue(gate) },
  };
  const paymentGateway = {
    resolveActiveMembershipProvider: vi.fn().mockResolvedValue('mercadopago'),
    createMembershipCharge: vi.fn().mockResolvedValue(undefined),
    getCharge: vi.fn().mockResolvedValue(undefined),
  };
  return {
    service: new CustomerMembershipAccountPaymentService(client as never, paymentGateway as never),
    client,
    paymentGateway,
  };
}

describe('CustomerMembershipAccountPaymentService', () => {
  it('seleciona a primeira cobrança pendente da Membership PENDING', async () => {
    const first = charge('PENDING', undefined, new Date('2026-09-01T00:00:00.000Z'));
    const second = charge('PENDING', undefined, periodStart);
    const { service } = setup(membership('PENDING', [first, second]));

    const result = await service.getForCustomer(10n, 20n);

    expect(result.charge?.periodStart).toBe(first.periodStart.toISOString());
    expect(result.canGenerateGatewayCharge).toBe(true);
  });

  it('seleciona a renewal charge do período inadimplente em PAST_DUE', async () => {
    const old = charge('PENDING', undefined, new Date('2026-09-01T00:00:00.000Z'));
    const renewal = charge('PENDING', undefined, periodEnd);
    const { service, paymentGateway } = setup(membership('PAST_DUE', [old, renewal]));

    await service.createOrReuse(10n, 20n, { userId: null, sessionId: 30n });

    expect(paymentGateway.createMembershipCharge).toHaveBeenCalledWith(
      10n,
      renewal.publicId,
      'mercadopago',
      { userId: null, sessionId: 30n },
    );
  });

  it('reutiliza gateway PENDING sem criar nova cobrança', async () => {
    const { service, paymentGateway } = setup(
      membership('PENDING', [charge('PENDING', 'PENDING')]),
    );

    const result = await service.createOrReuse(10n, 20n, { userId: null, sessionId: 30n });

    expect(result.gateway?.pixCopyPaste).toBe('pix-code');
    expect(paymentGateway.resolveActiveMembershipProvider).not.toHaveBeenCalled();
    expect(paymentGateway.createMembershipCharge).not.toHaveBeenCalled();
  });

  it('permite retry de charge FAILED quando o gateway aceita nova cobrança', async () => {
    const failed = charge('FAILED');
    const { service, paymentGateway } = setup(membership('PENDING', [failed]));

    await service.createOrReuse(10n, 20n, { userId: null, sessionId: 30n });

    expect(paymentGateway.createMembershipCharge).toHaveBeenCalledOnce();
    expect(paymentGateway.createMembershipCharge).toHaveBeenCalledWith(
      10n,
      failed.publicId,
      'mercadopago',
      { userId: null, sessionId: 30n },
    );
  });

  it('faz refresh somente da gateway existente', async () => {
    const { service, paymentGateway } = setup(
      membership('PAST_DUE', [charge('PENDING', 'PROCESSING')]),
    );

    await service.refresh(10n, 20n);

    expect(paymentGateway.getCharge).toHaveBeenCalledWith(10n, 'gateway-charge', true);
    expect(paymentGateway.createMembershipCharge).not.toHaveBeenCalled();
  });

  it.each(['PAID', 'CANCELED', 'REFUNDED'] as const)(
    'não expõe gateway %s como pagamento reutilizável',
    async (status) => {
      const { service, paymentGateway } = setup(membership('PENDING', [charge('PENDING', status)]));

      const result = await service.getForCustomer(10n, 20n);

      expect(result.gateway).toBeNull();
      expect(result.canGenerateGatewayCharge).toBe(true);
      expect(paymentGateway.getCharge).not.toHaveBeenCalled();
    },
  );

  it('mantém leitura de gateway existente com gate OFF, mas deixa nova criação para o gate central', async () => {
    const record = membership('PENDING', [charge('PENDING', 'PENDING')]);
    const { service, paymentGateway } = setup(record, {
      operatingModel: 'MEMBERSHIP',
      settings: { membershipSalesEnabled: false },
    });

    const result = await service.getForCustomer(10n, 20n);

    expect(result.gateway?.status).toBe('PENDING');
    expect(result.canGenerateGatewayCharge).toBe(false);
    await expect(
      service.createOrReuse(10n, 20n, { userId: null, sessionId: 30n }),
    ).resolves.toMatchObject({ gateway: { status: 'PENDING' } });
    expect(paymentGateway.createMembershipCharge).not.toHaveBeenCalled();
  });

  it('não transforma gate OFF em nova cobrança quando não existe gateway', async () => {
    const { service, paymentGateway } = setup(membership('PENDING', [charge()]), {
      operatingModel: 'MEMBERSHIP',
      settings: { membershipSalesEnabled: false },
    });
    paymentGateway.createMembershipCharge.mockRejectedValue(new Error('MEMBERSHIP_SALES_DISABLED'));

    await expect(service.createOrReuse(10n, 20n, { userId: null, sessionId: 30n })).rejects.toThrow(
      'MEMBERSHIP_SALES_DISABLED',
    );
    expect(paymentGateway.resolveActiveMembershipProvider).toHaveBeenCalledOnce();
  });

  it.each(['ACTIVE', 'PAUSED'] as const)(
    'não oferece pagamento para Membership %s',
    async (status) => {
      const { service } = setup(membership(status, [charge()]));

      const result = await service.getForCustomer(10n, 20n);

      expect(result.charge).toBeNull();
      expect(result.gateway).toBeNull();
      expect(result.canGenerateGatewayCharge).toBe(false);
    },
  );
});
