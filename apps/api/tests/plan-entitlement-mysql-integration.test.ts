import { randomUUID } from 'node:crypto';

import { config } from 'dotenv';
import { afterAll, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { PlanEntitlementService } from '../src/modules/tenants/plan-entitlement.service.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;

describe.skipIf(url === undefined)('enforcement transacional de plano no MySQL', () => {
  const client = createPrismaClient(url ?? 'mysql://invalid');
  const suffix = randomUUID().slice(0, 8);
  let tenantId: bigint | undefined;
  let planId: bigint | undefined;

  afterAll(async () => {
    if (tenantId !== undefined) {
      await client.businessUnit.deleteMany({ where: { tenantId } });
      await client.tenantSubscription.deleteMany({ where: { tenantId } });
      await client.tenant.deleteMany({ where: { id: tenantId } });
    }
    if (planId !== undefined) {
      await client.planLimit.deleteMany({ where: { planId } });
      await client.commercialPlan.deleteMany({ where: { id: planId } });
    }
    await client.$disconnect();
  });

  it('permite somente uma criação concorrente quando o limite de unidades é um', async () => {
    const plan = await client.commercialPlan.create({
      data: {
        publicId: randomUUID(),
        code: `LOCK_${suffix.toUpperCase()}`,
        name: 'Plano de lock',
        status: 'ACTIVE',
        billingCycle: 'MONTHLY',
        priceCents: 1000n,
        currency: 'BRL',
        limits: { create: { key: 'units.max', valueType: 'INTEGER', integerValue: 1n } },
      },
    });
    planId = plan.id;
    const tenant = await client.tenant.create({
      data: {
        publicId: randomUUID(),
        slug: `lock-${suffix}`,
        legalName: 'Teste de lock',
        displayName: 'Teste de lock',
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        currency: 'BRL',
      },
    });
    tenantId = tenant.id;
    const now = new Date();
    await client.tenantSubscription.create({
      data: {
        publicId: randomUUID(),
        tenantId: tenant.id,
        planId: plan.id,
        status: 'ACTIVE',
        effectiveKey: 'EFFECTIVE',
        startsAt: now,
        currentPeriodStartsAt: now,
        currentPeriodEndsAt: new Date(now.getTime() + 31 * 86_400_000),
        priceCents: 1000n,
        currency: 'BRL',
        billingCycle: 'MONTHLY',
      },
    });
    const create = (slug: string) =>
      client.$transaction(async (transaction) => {
        await new PlanEntitlementService().assertCanCreateUnit(transaction, tenant.id);
        return transaction.businessUnit.create({
          data: {
            publicId: randomUUID(),
            tenantId: tenant.id,
            name: slug,
            slug,
            status: 'ACTIVE',
            timezone: 'America/Sao_Paulo',
          },
        });
      });

    const results = await Promise.allSettled([create('unidade-a'), create('unidade-b')]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    await expect(new PlanEntitlementService().assertCanCreateUnit(client as never, tenant.id)).rejects.toMatchObject({
      code: 'PLAN_LIMIT_REACHED',
    });
  });
});
