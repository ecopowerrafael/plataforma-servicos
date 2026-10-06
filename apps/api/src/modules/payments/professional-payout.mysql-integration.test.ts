import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaClient } from '../../database-client/client.js';
import { CashRegisterService } from './cash-register.service.js';
import { ProfessionalPayoutService } from './professional-payout.service.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const enabled = databaseUrl !== undefined;

describe.skipIf(!enabled)('ProfessionalPayout MySQL concurrency and reversal', () => {
  let client: PrismaClient;
  let service: ProfessionalPayoutService;
  let cash: CashRegisterService;
  let tenantId: bigint;
  let professionalId: bigint;
  let userId: bigint;
  let sessionId: bigint;
  let registerPublicId: string;

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    client = new PrismaClient({ adapter: new PrismaMariaDb({ host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: decodeURIComponent(url.pathname.slice(1)), connectionLimit: 16 }) });
    service = new ProfessionalPayoutService(client);
    cash = new CashRegisterService(client);
    const tenant = await client.tenant.create({ data: { publicId: randomUUID(), slug: `payout-${randomUUID().slice(0, 10)}`, legalName: 'Payout test', displayName: 'Payout test', timezone: 'UTC', locale: 'pt-BR', currency: 'BRL' } });
    tenantId = tenant.id;
    const professional = await client.professional.create({ data: { publicId: randomUUID(), tenantId, name: 'Professional', publicName: 'Professional', calendarColor: '#111111' } });
    professionalId = professional.id;
    const user = await client.user.create({ data: { publicId: randomUUID(), email: `${randomUUID()}@test.invalid`, normalizedEmail: `${randomUUID()}@test.invalid`, passwordHash: 'test', status: 'ACTIVE' } });
    userId = user.id;
    const session = await client.userSession.create({ data: { publicId: randomUUID(), userId, tokenHash: randomUUID().replaceAll('-', ''), expiresAt: new Date(Date.now() + 86_400_000), lastSeenAt: new Date() } });
    sessionId = session.id;
    const opened = await cash.open(tenantId, { openingBalanceCents: 1_000_000 }, { userId, sessionId });
    registerPublicId = opened.publicId;
  });

  afterAll(async () => {
    await client.cashMovement.deleteMany({ where: { tenantId } });
    await client.professionalPayout.deleteMany({ where: { tenantId } });
    await client.cashRegister.deleteMany({ where: { tenantId } });
    await client.commissionCycleAllocation.deleteMany({ where: { cycle: { tenantId } } });
    await client.commissionCycle.deleteMany({ where: { tenantId } });
    await client.auditLog.deleteMany({ where: { tenantId } });
    await client.professional.deleteMany({ where: { tenantId } });
    await client.tenant.delete({ where: { id: tenantId } });
    await client.userSession.delete({ where: { id: sessionId } });
    await client.user.delete({ where: { id: userId } });
    await client.$disconnect();
  });

  async function allocation(amountCents = 40_000n) {
    const cycle = await client.commissionCycle.create({ data: { publicId: randomUUID(), tenantId, periodStart: new Date(Date.now() - 86_400_000), periodEnd: new Date(Date.now() + 86_400_000), status: 'CLOSED', closingDay: 1, teamPercentBps: 1000, closedAt: new Date() } });
    return client.commissionCycleAllocation.create({ data: { publicId: randomUUID(), cycleId: cycle.id, professionalId, points: 1, amountCents } });
  }

  const actor = () => ({ userId, sessionId });
  const input = (amountCents: number, idempotencyKey = randomUUID()) => ({ amountCents: String(amountCents), paidAt: new Date().toISOString(), method: 'PIX' as const, idempotencyKey });

  it('allows only one of two concurrent 30000 payouts against 40000', async () => {
    const item = await allocation();
    const paymentsBefore = await client.payment.count({ where: { tenantId } });
    const results = await Promise.allSettled([service.create(tenantId, item.publicId, input(30_000), actor()), service.create(tenantId, item.publicId, input(30_000), actor())]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((await client.professionalPayout.aggregate({ where: { commissionCycleAllocationId: item.id, status: 'ACTIVE' }, _sum: { amountCents: true } }))._sum.amountCents).toBe(30_000n);
    expect((await client.cashMovement.aggregate({ where: { professionalPayout: { commissionCycleAllocationId: item.id }, direction: 'OUT' }, _sum: { amountCents: true } }))._sum.amountCents).toBe(30_000n);
    expect(await client.payment.count({ where: { tenantId } })).toBe(paymentsBefore);
  });

  it('approves two concurrent 20000 payouts exactly once each', async () => {
    const item = await allocation();
    const results = await Promise.allSettled([service.create(tenantId, item.publicId, input(20_000), actor()), service.create(tenantId, item.publicId, input(20_000), actor())]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
    expect(await client.professionalPayout.count({ where: { commissionCycleAllocationId: item.id, status: 'ACTIVE' } })).toBe(2);
    expect((await client.cashMovement.aggregate({ where: { professionalPayout: { commissionCycleAllocationId: item.id }, direction: 'OUT' }, _sum: { amountCents: true } }))._sum.amountCents).toBe(40_000n);
  });

  it('makes concurrent reuse of one idempotency key create one payout and one OUT', async () => {
    const item = await allocation();
    const payload = input(20_000, `same-${randomUUID()}`);
    await Promise.all([service.create(tenantId, item.publicId, payload, actor()), service.create(tenantId, item.publicId, payload, actor())]);
    expect(await client.professionalPayout.count({ where: { commissionCycleAllocationId: item.id } })).toBe(1);
    expect(await client.cashMovement.count({ where: { professionalPayout: { commissionCycleAllocationId: item.id }, direction: 'OUT' } })).toBe(1);
  });

  it('does not create payout or movement when the cash register is closed', async () => {
    const item = await allocation();
    await cash.close(tenantId, registerPublicId, {}, actor());
    await expect(service.create(tenantId, item.publicId, input(1_000), actor())).rejects.toMatchObject({ code: 'PROFESSIONAL_PAYOUT_OPEN_CASH_REGISTER_REQUIRED' });
    expect(await client.professionalPayout.count({ where: { commissionCycleAllocationId: item.id } })).toBe(0);
    expect(await client.cashMovement.count({ where: { tenantId, professionalPayout: { commissionCycleAllocationId: item.id } } })).toBe(0);
    registerPublicId = (await cash.open(tenantId, { openingBalanceCents: 1_000_000 }, actor())).publicId;
  });

  it('reverses through IN only after reopening the cash register', async () => {
    const item = await allocation();
    const created = await service.create(tenantId, item.publicId, input(30_000), actor());
    const payout = await client.professionalPayout.findFirstOrThrow({ where: { commissionCycleAllocationId: item.id } });
    await cash.close(tenantId, registerPublicId, {}, actor());
    await expect(service.cancel(tenantId, payout.publicId, { reason: 'Correção' }, actor())).rejects.toMatchObject({ code: 'PROFESSIONAL_PAYOUT_OPEN_CASH_REGISTER_REQUIRED' });
    expect(await client.professionalPayout.findUniqueOrThrow({ where: { id: payout.id } })).toMatchObject({ status: 'ACTIVE' });
    const reopened = await cash.open(tenantId, { openingBalanceCents: 0 }, actor());
    registerPublicId = reopened.publicId;
    await service.cancel(tenantId, payout.publicId, { reason: 'Correção' }, actor());
    expect(await client.cashMovement.count({ where: { professionalPayoutId: payout.id, direction: 'IN' } })).toBe(1);
    expect(created.paidCents).toBe('30000');
    expect((await service.list(tenantId, item.publicId)).paidCents).toBe('0');
  });
});
