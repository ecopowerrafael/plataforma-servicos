import { config } from 'dotenv';
import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrismaClient } from '../src/database/connection.js';
import { CommercialManualPaymentService } from '../src/modules/commercial/commercial-manual-payment.service.js';
import { CommercialRemittanceService } from '../src/modules/commercial/commercial-remittance.service.js';

config({ path: '../../.env' });
const url = process.env.MYSQL_INTEGRATION_DATABASE_URL;

describe.skipIf(!url)('commercial settlement schema on real MySQL', () => {
  const client = createPrismaClient(url ?? 'mysql://invalid');
  afterAll(async () => { await client.$disconnect(); });

  it('has the financial migrations applied and all settlement tables present', async () => {
    const migrations = await client.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM _prisma_migrations WHERE migration_name IN ('20261011000001_add_subscription_settlement_ledger','20261011000002_add_commercial_remittances') ORDER BY migration_name`;
    expect(migrations.map((m) => m.migration_name)).toEqual(['20261011000001_add_subscription_settlement_ledger', '20261011000002_add_commercial_remittances']);
    const tables = await client.$queryRaw<{ table_name: string }[]>`SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('commercial_manual_payments','commercial_wallet_entries','commercial_commissions','platform_ledger_entries','commercial_remittances','commercial_remittance_allocations') ORDER BY table_name`;
    expect(tables).toHaveLength(6);
  });

  it('enforces the required ledger signs arithmetically in MySQL', async () => {
    const [row] = await client.$queryRaw<{ net: bigint }[]>`SELECT CAST((-10000 + 4000) AS SIGNED) AS net`;
    expect(row.net).toBe(-6000n);
  });

  it('settles a representative receipt, is idempotent, and confirms a remittance', async () => {
    const suffix = randomUUID();
    const user = await client.user.create({ data: { publicId: randomUUID(), email: `${suffix}@test.local`, normalizedEmail: `${suffix}@test.local`, status: 'ACTIVE' } });
    const tenant = await client.tenant.create({ data: { publicId: randomUUID(), slug: `settlement-${suffix.slice(0, 8)}`, legalName: 'Settlement Test', displayName: 'Settlement Test', timezone: 'America/Sao_Paulo', locale: 'pt-BR', currency: 'BRL' } });
    const plan = await client.commercialPlan.create({ data: { publicId: randomUUID(), code: `SETTLE-${suffix.slice(0, 8)}`, name: 'Settlement Plan', billingCycle: 'MONTHLY', priceCents: 10_000n, currency: 'BRL' } });
    const account = await client.commercialAccount.create({ data: { publicId: randomUUID(), userId: user.id, createdByUserId: user.id, role: 'REPRESENTATIVE', defaultCommissionBps: 4_000 } });
    await client.tenantCommercialAssignment.create({ data: { tenantId: tenant.id, representativeId: account.id, source: 'MANUAL_OVERRIDE' } });
    const end = new Date(Date.now() + 30 * 86400000);
    const subscription = await client.tenantSubscription.create({ data: { publicId: randomUUID(), tenantId: tenant.id, planId: plan.id, status: 'PAST_DUE', startsAt: new Date(), currentPeriodStartsAt: new Date(), currentPeriodEndsAt: end, priceCents: 10_000n, currency: 'BRL', billingCycle: 'MONTHLY', effectiveKey: 'EFFECTIVE' } });
    const service = new CommercialManualPaymentService(client);
    const input = { commercialAccountId: account.id, tenantPublicId: tenant.publicId, amountCents: 10_000n, currency: 'BRL', paymentMethod: 'CASH', idempotencyKey: randomUUID() };
    const first = await service.settleSubscription(input);
    const retry = await service.settleSubscription(input);
    expect(retry.publicId).toBe(first.publicId);
    const entries = await client.commercialWalletEntry.findMany({ where: { subscriptionId: subscription.id }, orderBy: { amountCents: 'asc' } });
    expect(entries.map((entry) => entry.amountCents)).toEqual([-10_000n, 4_000n]);
    expect(entries.reduce((sum, entry) => sum + entry.amountCents, 0n)).toBe(-6_000n);
    const remittance = await new CommercialRemittanceService(client).create({ commercialAccountId: account.id, tenantId: tenant.id, amountCents: 6_000n, paymentMethod: 'PIX', paymentPublicIds: [first.publicId] });
    await new CommercialRemittanceService(client).confirm(remittance.publicId, user.id);
    const balance = await client.commercialWalletEntry.aggregate({ where: { commercialAccountId: account.id }, _sum: { amountCents: true } });
    expect(balance._sum.amountCents).toBe(0n);
    const remittanceService = new CommercialRemittanceService(client);
    await expect(remittanceService.create({ commercialAccountId: account.id, tenantId: tenant.id, amountCents: 1n, paymentMethod: 'PIX', paymentPublicIds: [first.publicId] })).rejects.toMatchObject({ code: 'COMMERCIAL_REMITTANCE_EXCEEDS_PAYMENTS' });
    const concurrentRemittances = await Promise.allSettled([
      remittanceService.create({ commercialAccountId: account.id, tenantId: tenant.id, amountCents: 1n, paymentMethod: 'PIX', paymentPublicIds: [first.publicId] }),
      remittanceService.create({ commercialAccountId: account.id, tenantId: tenant.id, amountCents: 1n, paymentMethod: 'PIX', paymentPublicIds: [first.publicId] }),
    ]);
    expect(concurrentRemittances.every((result) => result.status === 'rejected')).toBe(true);

    const tenant2 = await client.tenant.create({ data: { publicId: randomUUID(), slug: `admin-${suffix.slice(0, 8)}`, legalName: 'Admin Settlement Test', displayName: 'Admin Settlement Test', timezone: 'America/Sao_Paulo', locale: 'pt-BR', currency: 'BRL' } });
    const plan2 = await client.commercialPlan.create({ data: { publicId: randomUUID(), code: `ADMIN-${suffix.slice(0, 8)}`, name: 'Admin Plan', billingCycle: 'MONTHLY', priceCents: 10_000n, currency: 'BRL' } });
    await client.tenantCommercialAssignment.create({ data: { tenantId: tenant2.id, managerId: account.id, source: 'MANUAL_OVERRIDE' } });
    await client.tenantSubscription.create({ data: { publicId: randomUUID(), tenantId: tenant2.id, planId: plan2.id, status: 'PAST_DUE', startsAt: new Date(), currentPeriodStartsAt: new Date(), currentPeriodEndsAt: end, priceCents: 10_000n, currency: 'BRL', billingCycle: 'MONTHLY', effectiveKey: 'EFFECTIVE' } });
    const adminPayment = await service.settleAdministratorSubscription({ tenantPublicId: tenant2.publicId, amountCents: 10_000n, currency: 'BRL', paymentMethod: 'CASH', idempotencyKey: randomUUID() });
    const adminLedger = await client.platformLedgerEntry.findFirst({ where: { manualPayment: { publicId: adminPayment.publicId } } });
    expect(adminLedger?.amountCents).toBe(10_000n);
    expect(await client.commercialWalletEntry.count({ where: { tenantId: tenant2.id, amountCents: { lt: 0 } } })).toBe(0);
    await service.reversePayment(adminPayment.publicId, 'admin reversal integration test');
    const adminReversal = await client.platformLedgerEntry.findFirst({ where: { manualPayment: { publicId: adminPayment.publicId }, amountCents: -10_000n } });
    expect(adminReversal?.type).toBe('SUBSCRIPTION_PAYMENT_REVERSAL');
    expect((await client.tenantSubscription.findUniqueOrThrow({ where: { tenantId_effectiveKey: { tenantId: tenant2.id, effectiveKey: 'EFFECTIVE' } } })).status).toBe('PAST_DUE');

    const tenant3 = await client.tenant.create({ data: { publicId: randomUUID(), slug: `race-${suffix.slice(0, 8)}`, legalName: 'Race Test', displayName: 'Race Test', timezone: 'America/Sao_Paulo', locale: 'pt-BR', currency: 'BRL' } });
    const plan3 = await client.commercialPlan.create({ data: { publicId: randomUUID(), code: `RACE-${suffix.slice(0, 8)}`, name: 'Race Plan', billingCycle: 'MONTHLY', priceCents: 10_000n, currency: 'BRL' } });
    await client.tenantCommercialAssignment.create({ data: { tenantId: tenant3.id, representativeId: account.id, source: 'MANUAL_OVERRIDE' } });
    await client.tenantSubscription.create({ data: { publicId: randomUUID(), tenantId: tenant3.id, planId: plan3.id, status: 'PAST_DUE', startsAt: new Date(), currentPeriodStartsAt: new Date(), currentPeriodEndsAt: end, priceCents: 10_000n, currency: 'BRL', billingCycle: 'MONTHLY', effectiveKey: 'EFFECTIVE' } });
    const raceInput = { ...input, tenantPublicId: tenant3.publicId, idempotencyKey: randomUUID() };
    const race = await Promise.allSettled([service.settleSubscription(raceInput), service.settleSubscription(raceInput)]);
    expect(race.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
    const racePayment = (race[0].status === 'fulfilled' ? race[0].value : race[1].status === 'fulfilled' ? race[1].value : null);
    expect(racePayment).not.toBeNull();
    await service.reversePayment(racePayment!.publicId, 'integration test');
    await service.reversePayment(racePayment!.publicId, 'duplicate reversal');
    const reversed = await client.commercialManualPayment.findUnique({ where: { publicId: racePayment!.publicId } });
    expect(reversed?.status).toBe('REVERSED');
    expect((await client.commercialWalletEntry.aggregate({ where: { tenantId: tenant3.id }, _sum: { amountCents: true } }))._sum.amountCents).toBe(0n);
  });

  it.each([
    ['MONTHLY', 10_000n, 1], ['QUARTERLY', 30_000n, 3], ['SEMIANNUAL', 60_000n, 6], ['ANNUAL', 120_000n, 12],
  ] as const)('renews exactly one contracted %s cycle', async (cycle, amount, months) => {
    const suffix = randomUUID();
    const user = await client.user.create({ data: { publicId: randomUUID(), email: `${suffix}@test.local`, normalizedEmail: `${suffix}@test.local`, status: 'ACTIVE' } });
    const tenant = await client.tenant.create({ data: { publicId: randomUUID(), slug: `cycle-${suffix.slice(0, 8)}`, legalName: 'Cycle Test', displayName: 'Cycle Test', timezone: 'America/Sao_Paulo', locale: 'pt-BR', currency: 'BRL' } });
    const plan = await client.commercialPlan.create({ data: { publicId: randomUUID(), code: `CYCLE-${suffix.slice(0, 8)}`, name: 'Cycle Plan', billingCycle: cycle, priceCents: amount, currency: 'BRL' } });
    const account = await client.commercialAccount.create({ data: { publicId: randomUUID(), userId: user.id, createdByUserId: user.id, role: 'REPRESENTATIVE', defaultCommissionBps: 4_000 } });
    await client.tenantCommercialAssignment.create({ data: { tenantId: tenant.id, representativeId: account.id, source: 'MANUAL_OVERRIDE' } });
    const start = new Date('2030-01-01T00:00:00.000Z');
    const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + months);
    const subscription = await client.tenantSubscription.create({ data: { publicId: randomUUID(), tenantId: tenant.id, planId: plan.id, status: 'PAST_DUE', startsAt: start, currentPeriodStartsAt: start, currentPeriodEndsAt: end, priceCents: amount, currency: 'BRL', billingCycle: cycle, effectiveKey: 'EFFECTIVE' } });
    const payment = await new CommercialManualPaymentService(client).settleSubscription({ commercialAccountId: account.id, tenantPublicId: tenant.publicId, amountCents: amount, currency: 'BRL', paymentMethod: 'CASH', idempotencyKey: randomUUID() });
    const updated = await client.tenantSubscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(updated.currentPeriodStartsAt.getTime()).toBe(end.getTime());
    const expectedEnd = new Date(end); expectedEnd.setUTCMonth(expectedEnd.getUTCMonth() + months);
    expect(updated.currentPeriodEndsAt.getTime()).toBe(expectedEnd.getTime());
    expect(await client.commercialManualPayment.count({ where: { publicId: payment.publicId } })).toBe(1);
  });

  it('rejects divergent amount/currency, unlinked account, and already-paid cycle without partial entries', async () => {
    const suffix = randomUUID();
    const user = await client.user.create({ data: { publicId: randomUUID(), email: `${suffix}@test.local`, normalizedEmail: `${suffix}@test.local`, status: 'ACTIVE' } });
    const tenant = await client.tenant.create({ data: { publicId: randomUUID(), slug: `validation-${suffix.slice(0, 8)}`, legalName: 'Validation Test', displayName: 'Validation Test', timezone: 'America/Sao_Paulo', locale: 'pt-BR', currency: 'BRL' } });
    const plan = await client.commercialPlan.create({ data: { publicId: randomUUID(), code: `VALID-${suffix.slice(0, 8)}`, name: 'Validation Plan', billingCycle: 'MONTHLY', priceCents: 10_000n, currency: 'BRL' } });
    const account = await client.commercialAccount.create({ data: { publicId: randomUUID(), userId: user.id, createdByUserId: user.id, role: 'REPRESENTATIVE', defaultCommissionBps: 4_000 } });
    const outsider = await client.commercialAccount.create({ data: { publicId: randomUUID(), userId: user.id, createdByUserId: user.id, role: 'SELLER', defaultCommissionBps: 0 } });
    await client.tenantCommercialAssignment.create({ data: { tenantId: tenant.id, representativeId: account.id, source: 'MANUAL_OVERRIDE' } });
    const start = new Date('2031-01-01T00:00:00.000Z'); const end = new Date('2031-02-01T00:00:00.000Z');
    await client.tenantSubscription.create({ data: { publicId: randomUUID(), tenantId: tenant.id, planId: plan.id, status: 'PAST_DUE', startsAt: start, currentPeriodStartsAt: start, currentPeriodEndsAt: end, priceCents: 10_000n, currency: 'BRL', billingCycle: 'MONTHLY', effectiveKey: 'EFFECTIVE' } });
    const service = new CommercialManualPaymentService(client);
    const base = { tenantPublicId: tenant.publicId, paymentMethod: 'CASH', idempotencyKey: randomUUID() };
    await expect(service.settleSubscription({ ...base, commercialAccountId: account.id, amountCents: 9_999n, currency: 'BRL' })).rejects.toMatchObject({ code: 'COMMERCIAL_PAYMENT_VALUE_INVALID' });
    await expect(service.settleSubscription({ ...base, commercialAccountId: account.id, amountCents: 10_000n, currency: 'USD', idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: 'COMMERCIAL_PAYMENT_VALUE_INVALID' });
    await expect(service.settleSubscription({ ...base, commercialAccountId: outsider.id, amountCents: 10_000n, currency: 'BRL', idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: 'COMMERCIAL_TENANT_ACCESS_DENIED' });
    const payment = await service.settleSubscription({ ...base, commercialAccountId: account.id, amountCents: 10_000n, currency: 'BRL' });
    await expect(service.settleSubscription({ ...base, commercialAccountId: account.id, amountCents: 10_000n, currency: 'BRL', idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: 'COMMERCIAL_SUBSCRIPTION_ALREADY_PAID' });
    expect(await client.commercialManualPayment.count({ where: { subscription: { tenantId: tenant.id } } })).toBe(1);
    expect(payment.publicId).toBeTruthy();
  });
});
