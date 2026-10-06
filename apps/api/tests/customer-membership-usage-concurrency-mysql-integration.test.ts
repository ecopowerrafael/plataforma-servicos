import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { CustomerMembershipUsageService } from '../src/modules/customers/customer-membership-usage.service.js';

const url = process.env.TEST_DATABASE_URL;
if (url === undefined)
  throw new Error('TEST_DATABASE_URL is required for usage concurrency tests.');

describe('customer membership usage transitions (MySQL)', () => {
  const client = createPrismaClient(url);
  const ids = { tenant: 0n, customer: 0n, plan: 0n, membership: 0n, charge: 0n, service: 0n };
  let usageId = 0n;
  let usageService: CustomerMembershipUsageService;

  beforeAll(async () => {
    const [{ database_name: database }] = await client.$queryRaw<Array<{ database_name: string }>>`
      SELECT DATABASE() AS database_name
    `;
    const expectedDatabase = process.env.TEST_DATABASE_NAME ?? 'u891593158_teste';
    if (database !== expectedDatabase) throw new Error(`Wrong integration database: ${database}`);

    const tenant = await client.tenant.create({
      data: {
        publicId: randomUUID(),
        slug: `usage-race-${randomUUID().slice(0, 8)}`,
        legalName: 'Usage Race Test',
        displayName: 'Usage Race Test',
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        currency: 'BRL',
        operatingModel: 'MEMBERSHIP',
      },
    });
    ids.tenant = tenant.id;
    const customer = await client.customer.create({
      data: { publicId: randomUUID(), tenantId: ids.tenant, name: 'Usage Race Customer' },
    });
    ids.customer = customer.id;
    const plan = await client.customerMembershipPlan.create({
      data: {
        publicId: randomUUID(),
        tenantId: ids.tenant,
        name: 'Usage Race Plan',
        priceCents: 1000n,
        billingInterval: 'MONTHLY',
      },
    });
    ids.plan = plan.id;
    const membership = await client.customerMembership.create({
      data: {
        publicId: randomUUID(),
        tenantId: ids.tenant,
        customerId: ids.customer,
        planId: ids.plan,
        status: 'ACTIVE',
        activeKey: `usage-race:${randomUUID()}`,
      },
    });
    ids.membership = membership.id;
    const charge = await client.customerMembershipCharge.create({
      data: {
        publicId: randomUUID(),
        tenantId: ids.tenant,
        membershipId: ids.membership,
        periodStart: new Date('2026-01-01T00:00:00.000Z'),
        periodEnd: new Date('2026-02-01T00:00:00.000Z'),
        amountCents: 1000n,
        status: 'PAID',
        paidAt: new Date('2026-01-01T00:00:00.000Z'),
        dueAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    ids.charge = charge.id;
    const service = await client.service.create({
      data: {
        publicId: randomUUID(),
        tenantId: ids.tenant,
        name: 'Usage Race Service',
        durationMinutes: 30,
        priceCents: 1000n,
        color: '#111111',
      },
    });
    ids.service = service.id;
    usageService = new CustomerMembershipUsageService(client);
  }, 60000);

  beforeEach(async () => {
    const usage = await client.customerMembershipUsage.create({
      data: {
        publicId: randomUUID(),
        tenantId: ids.tenant,
        membershipId: ids.membership,
        membershipChargeId: ids.charge,
        serviceId: ids.service,
        quantity: 1,
        status: 'RESERVED',
      },
    });
    usageId = usage.id;
  });

  afterAll(async () => {
    if (ids.tenant !== 0n) {
      await client.customerMembershipUsage.deleteMany({ where: { tenantId: ids.tenant } });
      await client.customerMembershipCharge.deleteMany({ where: { tenantId: ids.tenant } });
      await client.customerMembership.deleteMany({ where: { tenantId: ids.tenant } });
      await client.customerMembershipPlan.deleteMany({ where: { tenantId: ids.tenant } });
      await client.service.deleteMany({ where: { tenantId: ids.tenant } });
      await client.customer.deleteMany({ where: { tenantId: ids.tenant } });
      await client.tenant.delete({ where: { id: ids.tenant } });
    }
    await client.$disconnect();
  }, 60000);

  it('serializes consume + release so only one transition wins', async () => {
    const results = await Promise.allSettled([
      usageService.consume(ids.tenant, usageId),
      usageService.release(ids.tenant, usageId),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const usage = await client.customerMembershipUsage.findUniqueOrThrow({
      where: { id: usageId },
    });
    expect(['CONSUMED', 'RELEASED']).toContain(usage.status);
  });

  it('keeps duplicate consume idempotent and does not duplicate effects', async () => {
    await expect(
      Promise.all([
        usageService.consume(ids.tenant, usageId),
        usageService.consume(ids.tenant, usageId),
      ]),
    ).resolves.toEqual([undefined, undefined]);
    expect(
      (await client.customerMembershipUsage.findUniqueOrThrow({ where: { id: usageId } })).status,
    ).toBe('CONSUMED');
  });

  it('keeps duplicate release idempotent and does not duplicate effects', async () => {
    await expect(
      Promise.all([
        usageService.release(ids.tenant, usageId),
        usageService.release(ids.tenant, usageId),
      ]),
    ).resolves.toEqual([undefined, undefined]);
    expect(
      (await client.customerMembershipUsage.findUniqueOrThrow({ where: { id: usageId } })).status,
    ).toBe('RELEASED');
  });
});
