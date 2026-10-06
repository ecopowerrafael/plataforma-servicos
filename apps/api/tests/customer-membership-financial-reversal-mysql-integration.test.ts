import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { CustomerMembershipFinancialReversalService } from '../src/modules/customers/customer-membership-financial-reversal.service.js';

const url = process.env.TEST_DATABASE_URL;
if (url === undefined) throw new Error('TEST_DATABASE_URL é obrigatória para este teste.');

const prisma = createPrismaClient(url);
const ids = {
  tenant: 0n,
  customer: 0n,
  plan: 0n,
  membership: 0n,
  charge: 0n,
  method: 0n,
  payment: 0n,
  gatewayCharge: 0n,
};

describe('customer membership financial reversal (MySQL)', () => {
  beforeAll(async () => {
    const rows = await prisma.$queryRaw<Array<{ database_name: string }>>`
      SELECT DATABASE() AS database_name
    `;
    const database = rows[0]?.database_name;
    const expectedDatabase = process.env.TEST_DATABASE_NAME ?? 'u891593158_teste';
    if (database !== expectedDatabase) throw new Error(`Wrong integration database: ${database}`);

    const now = new Date();
    const tenant = await prisma.tenant.create({
      data: {
        publicId: randomUUID(),
        slug: `membership-reversal-${randomUUID().slice(0, 8)}`,
        legalName: 'Membership Reversal Test',
        displayName: 'Membership Reversal Test',
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        currency: 'BRL',
        operatingModel: 'MEMBERSHIP',
      },
    });
    ids.tenant = tenant.id;
    const customer = await prisma.customer.create({
      data: { publicId: randomUUID(), tenantId: ids.tenant, name: 'Reversal Customer' },
    });
    ids.customer = customer.id;
    const plan = await prisma.customerMembershipPlan.create({
      data: {
        publicId: randomUUID(),
        tenantId: ids.tenant,
        name: 'Reversal Plan',
        priceCents: 10_000n,
        billingInterval: 'MONTHLY',
      },
    });
    ids.plan = plan.id;
    const membership = await prisma.customerMembership.create({
      data: {
        publicId: randomUUID(),
        tenantId: ids.tenant,
        customerId: ids.customer,
        planId: ids.plan,
        status: 'ACTIVE',
        activeKey: `reversal:${randomUUID()}`,
        currentPeriodStart: new Date(now.getTime() - 86_400_000),
        currentPeriodEnd: new Date(now.getTime() + 86_400_000),
      },
    });
    ids.membership = membership.id;
    const charge = await prisma.customerMembershipCharge.create({
      data: {
        publicId: randomUUID(),
        tenantId: ids.tenant,
        membershipId: ids.membership,
        periodStart: new Date(now.getTime() - 86_400_000),
        periodEnd: new Date(now.getTime() + 86_400_000),
        amountCents: 10_000n,
        status: 'PAID',
        dueAt: new Date(now.getTime() - 86_400_000),
        paidAt: new Date(now.getTime() - 86_400_000),
      },
    });
    ids.charge = charge.id;
    const method = await prisma.paymentMethod.create({
      data: {
        publicId: randomUUID(),
        tenantId: ids.tenant,
        name: 'Reversal PIX',
        type: 'PIX',
      },
    });
    ids.method = method.id;
    const payment = await prisma.payment.create({
      data: {
        publicId: randomUUID(),
        tenantId: ids.tenant,
        originType: 'MEMBERSHIP_CHARGE',
        membershipChargeId: ids.charge,
        paymentMethodId: ids.method,
        amountCents: 10_000n,
        status: 'PAID',
        paidAt: new Date(now.getTime() - 86_400_000),
      },
    });
    ids.payment = payment.id;
    const gatewayCharge = await prisma.paymentGatewayCharge.create({
      data: {
        publicId: randomUUID(),
        tenantId: ids.tenant,
        originType: 'MEMBERSHIP_CHARGE',
        membershipChargeId: ids.charge,
        paymentId: ids.payment,
        provider: 'mercadopago',
        environment: 'SANDBOX',
        externalId: `reversal-${randomUUID()}`,
        status: 'REFUNDED',
        amountCents: 10_000n,
        currency: 'BRL',
        idempotencyKey: `reversal-charge:${randomUUID()}`,
        kind: 'PAYMENT',
      },
    });
    ids.gatewayCharge = gatewayCharge.id;
  }, 60_000);

  afterAll(async () => {
    if (ids.tenant !== 0n) {
      await prisma.customerMembershipFinancialReversal.deleteMany({
        where: { tenantId: ids.tenant },
      });
      await prisma.paymentGatewayCharge.updateMany({
        where: { tenantId: ids.tenant },
        data: { paymentId: null },
      });
      await prisma.auditLog.deleteMany({ where: { tenantId: ids.tenant } });
      await prisma.paymentGatewayCharge.deleteMany({ where: { tenantId: ids.tenant } });
      await prisma.payment.deleteMany({ where: { tenantId: ids.tenant } });
      await prisma.customerMembershipCharge.deleteMany({ where: { tenantId: ids.tenant } });
      await prisma.customerMembership.deleteMany({ where: { tenantId: ids.tenant } });
      await prisma.paymentMethod.deleteMany({ where: { tenantId: ids.tenant } });
      await prisma.customerMembershipPlan.deleteMany({ where: { tenantId: ids.tenant } });
      await prisma.customer.deleteMany({ where: { tenantId: ids.tenant } });
      await prisma.tenant.delete({ where: { id: ids.tenant } });
    }
    await prisma.$disconnect();
  }, 60_000);

  it('serializa dois eventos do mesmo refund em uma única reversão', async () => {
    const service = new CustomerMembershipFinancialReversalService(prisma);
    const input = {
      tenantId: ids.tenant,
      paymentGatewayChargeId: ids.gatewayCharge,
      type: 'REFUND' as const,
      amountCents: 10_000n,
      effectiveAt: new Date(),
      provider: 'mercadopago',
      externalReference: 'refund-event-a',
      idempotencyKey: `integration-reversal:${randomUUID()}`,
    };

    const results = await Promise.all([
      service.reconcile(input),
      service.reconcile({
        ...input,
        externalReference: 'refund-event-b',
        idempotencyKey: `${input.idempotencyKey}:b`,
      }),
    ]);

    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(
      await prisma.customerMembershipFinancialReversal.count({
        where: { tenantId: ids.tenant, membershipChargeId: ids.charge },
      }),
    ).toBe(1);
    expect(
      await prisma.customerMembershipCharge.findUniqueOrThrow({ where: { id: ids.charge } }),
    ).toMatchObject({ status: 'REFUNDED' });
    expect(
      await prisma.customerMembership.findUniqueOrThrow({ where: { id: ids.membership } }),
    ).toMatchObject({ status: 'PAST_DUE' });
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: ids.payment } })).toMatchObject({
      status: 'PAID',
    });
  });
});
