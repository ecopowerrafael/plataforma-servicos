import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaClient } from '../../database-client/client.js';
import { CommissionCycleService } from './commission-cycle.service.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const enabled = databaseUrl !== undefined;

describe.skipIf(!enabled)('CommissionCycle MySQL concurrency', () => {
  let client: PrismaClient;
  let tenantId: bigint;
  let firstCyclePublicId: string;

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    const adapter = new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.slice(1)),
      connectionLimit: 8,
    });
    client = new PrismaClient({ adapter });
    const identity = await client.$queryRaw<Array<{ database_name: string | null }>>`SELECT DATABASE() AS database_name`;
    expect(identity[0]?.database_name).toBe('agendei_commission_cycle_integration');
    const tenant = await client.tenant.create({
      data: {
        publicId: randomUUID(), slug: `commission-concurrency-${randomUUID().slice(0, 8)}`,
        legalName: 'Commission concurrency test', displayName: 'Commission concurrency test',
        timezone: 'UTC', locale: 'pt-BR', currency: 'BRL',
        settings: { create: { commissionTeamPercentBps: 1000, commissionClosingDay: 10, commissionEffectiveFrom: new Date('2026-01-01T00:00:00.000Z') } },
      },
      select: { id: true },
    });
    tenantId = tenant.id;
  });

  afterAll(async () => {
    if (tenantId !== undefined) {
      await client.commissionCycle.deleteMany({ where: { tenantId } });
      await client.auditLog.deleteMany({ where: { tenantId } });
      await client.tenantSettings.deleteMany({ where: { tenantId } });
      await client.tenant.delete({ where: { id: tenantId } });
    }
    await client?.$disconnect();
  });

  it('creates exactly one cycle and closes it idempotently in 10 concurrent iterations', async () => {
    const currentAt = new Date('2026-10-05T12:00:00.000Z');
    const serviceA = new CommissionCycleService(client);
    const serviceB = new CommissionCycleService(client);
    for (let iteration = 0; iteration < 10; iteration += 1) {
      const current = await Promise.all([serviceA.current(tenantId, currentAt), serviceB.current(tenantId, currentAt)]);
      expect(new Set(current.map((item) => item.publicId)).size).toBe(1);
      firstCyclePublicId = current[0]!.publicId;
      const closed = await Promise.all([
        serviceA.close(tenantId, firstCyclePublicId, { userId: null, sessionId: null }, new Date('2026-10-11T12:00:00.000Z')),
        serviceB.close(tenantId, firstCyclePublicId, { userId: null, sessionId: null }, new Date('2026-10-11T12:00:00.000Z')),
      ]);
      expect(closed[0]?.status).toBe('CLOSED');
      expect(closed[1]?.status).toBe('CLOSED');
      expect(closed[0]?.publicId).toBe(closed[1]?.publicId);
      expect(await client.commissionCycle.count({ where: { tenantId } })).toBe(1);
      expect(await client.commissionCycleAllocation.count({ where: { cycle: { tenantId } } })).toBe(0);
    }
  });
});
