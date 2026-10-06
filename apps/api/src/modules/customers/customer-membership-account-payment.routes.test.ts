import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { describe, expect, it, vi } from 'vitest';

import { AppError } from '../../errors/AppError.js';
import { customerMembershipAccountPaymentRoutes } from './customer-membership-account-payment.routes.js';

const charge = {
  publicId: 'membership-charge-public-id',
  periodStart: new Date('2026-10-01T00:00:00.000Z'),
  periodEnd: new Date('2026-11-01T00:00:00.000Z'),
  amountCents: 4900n,
  status: 'PENDING',
  dueAt: new Date('2026-10-01T00:00:00.000Z'),
  paidAt: null,
  gatewayCharges: [],
};

const membership = {
  status: 'PENDING',
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
  currentPeriodStart: charge.periodStart,
  currentPeriodEnd: charge.periodEnd,
  charges: [charge],
};

async function setup() {
  const app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  const authenticateForTenantSlug = vi.fn().mockResolvedValue({
    id: 30n,
    tenantId: 10n,
    customer: { id: 20n },
  });
  const findMany = vi.fn().mockResolvedValue([membership]);
  const paymentGateway = {
    resolveActiveMembershipProvider: vi.fn().mockResolvedValue('mercadopago'),
    createMembershipCharge: vi.fn().mockResolvedValue(undefined),
    getCharge: vi.fn().mockResolvedValue(undefined),
  };
  await app.register(cookie);
  await app.register(customerMembershipAccountPaymentRoutes, {
    authService: { authenticateForTenantSlug } as never,
    cookieName: 'customer_session',
    client: {
      customerMembership: { findMany },
      tenant: {
        findFirst: vi.fn().mockResolvedValue({
          operatingModel: 'MEMBERSHIP',
          settings: { membershipSalesEnabled: true },
        }),
      },
    } as never,
    paymentGateway: paymentGateway as never,
  });
  return { app, authenticateForTenantSlug, findMany, paymentGateway };
}

describe('customer membership account payment routes', () => {
  it('deriva tenant e customer da sessão e ignora IDs enviados pelo cliente', async () => {
    const fixture = await setup();
    const response = await fixture.app.inject({
      method: 'POST',
      url: '/public/sites/studio/customer/membership/payment/gateway',
      cookies: { customer_session: 'opaque-token' },
      payload: {
        tenantId: '999',
        customerId: '998',
        membershipId: '997',
        chargePublicId: 'arbitrary-charge',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(fixture.authenticateForTenantSlug).toHaveBeenCalledWith('opaque-token', 'studio');
    expect(fixture.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 10n, customerId: 20n }),
      }),
    );
    expect(fixture.paymentGateway.createMembershipCharge).toHaveBeenCalledWith(
      10n,
      'membership-charge-public-id',
      'mercadopago',
      { userId: null, sessionId: 30n },
    );
    await fixture.app.close();
  });

  it('autentica slug antes de acessar qualquer cobrança', async () => {
    const fixture = await setup();
    fixture.authenticateForTenantSlug.mockRejectedValue(
      new AppError({
        code: 'CUSTOMER_AUTH_REQUIRED',
        message: 'Sessão expirada.',
        statusCode: 401,
      }),
    );

    const response = await fixture.app.inject({
      method: 'GET',
      url: '/public/sites/other/customer/membership/payment',
      cookies: { customer_session: 'expired-token' },
    });

    expect(response.statusCode).toBe(401);
    expect(fixture.findMany).not.toHaveBeenCalled();
    await fixture.app.close();
  });
});
