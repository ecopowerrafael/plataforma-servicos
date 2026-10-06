import { describe, expect, it, vi } from 'vitest';

import { CommissionCycleService } from './commission-cycle.service.js';

const tenantA = 1n;
const tenantB = 2n;
const a1 = 11n;
const a2 = 12n;
const b1 = 21n;
const now = new Date('2026-10-15T12:00:00.000Z');

const openCycle = (tenantId: bigint) => ({
  id: tenantId,
  publicId: `00000000-0000-4000-8000-00000000000${tenantId}`,
  tenantId,
  periodStart: new Date('2026-10-01T03:00:00.000Z'),
  periodEnd: new Date('2026-11-01T02:59:59.000Z'),
  status: 'OPEN' as const,
  closingDay: 1,
  teamPercentBps: 1000,
  effectiveFrom: new Date('2026-10-01T03:00:00.000Z'),
  eligibleRevenueCents: null,
  poolCents: null,
  totalPoints: null,
  distributedCents: null,
  closedAt: null,
  closedByUserId: null,
  createdAt: now,
  updatedAt: now,
  allocations: [],
});

function fixture() {
  const cycleA = openCycle(tenantA);
  const cycleB = openCycle(tenantB);
  const client = {
    tenant: { findUnique: vi.fn(async ({ where }: { where: { id: bigint } }) => where.id === tenantA || where.id === tenantB ? { timezone: 'America/Sao_Paulo', settings: { commissionTeamPercentBps: 1000, commissionClosingDay: 1, commissionEffectiveFrom: new Date('2026-10-01T03:00:00.000Z') } } : null) },
    commissionCycle: {
      upsert: vi.fn(async ({ where }: { where: { tenantId_periodStart_periodEnd: { tenantId: bigint } } }) => where.tenantId_periodStart_periodEnd.tenantId === tenantB ? cycleB : cycleA),
      findMany: vi.fn(async ({ where }: { where: { tenantId: bigint } }) => where.tenantId === tenantB ? [cycleB] : [cycleA]),
    },
    payment: { aggregate: vi.fn(async () => ({ _sum: { amountCents: 100000n } })) },
    appointment: { findMany: vi.fn(async () => [
      { professionalId: a1, professional: { publicId: '00000000-0000-4000-8000-000000000011', name: 'A1' } },
      { professionalId: a1, professional: { publicId: '00000000-0000-4000-8000-000000000011', name: 'A1' } },
      { professionalId: a2, professional: { publicId: '00000000-0000-4000-8000-000000000012', name: 'A2' } },
      { professionalId: b1, professional: { publicId: '00000000-0000-4000-8000-000000000021', name: 'B1' } },
    ]) },
  } as never;
  return { client, service: new CommissionCycleService(client) };
}

describe('CommissionCycleService self-service', () => {
  it('A1 e A2 recebem somente seus próprios pontos e valores no current', async () => {
    const { service } = fixture();
    const resultA1 = await service.currentForProfessional(tenantA, a1, now);
    const resultA2 = await service.currentForProfessional(tenantA, a2, now);
    expect(resultA1.myPoints).toBe(2);
    expect(resultA2.myPoints).toBe(1);
    expect(resultA1.myEstimatedAmountCents).not.toBe(resultA2.myEstimatedAmountCents);
    expect(resultA1).not.toHaveProperty('allocations');
    expect(resultA1).not.toHaveProperty('professionalName');
    expect(resultA1).not.toHaveProperty('professionalId');
  });

  it('aplica tenantId na consulta e não permite que o profissional atravesse tenant', async () => {
    const { client, service } = fixture();
    const result = await service.listForProfessional(tenantB, b1, now);
    expect(result.items).toHaveLength(1);
    expect(client.commissionCycle.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: tenantB } }));
    expect(result.items[0]).not.toHaveProperty('professionalName');
  });
});
