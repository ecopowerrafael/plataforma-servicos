import { describe, it, expect, beforeEach, vi } from 'vitest';
import { type PrismaClient } from '../../database-client/client.js';
import { DebtService } from './debt.service.js';
import { type AuthService } from '../auth/auth.service.js';
import { AppError } from '../../errors/AppError.js';

const tenantId = 10n;
const otherTenantId = 20n;
const userId = 100n;
const sessionId = 200n;
const actor = { userId, sessionId };

const mockDebt = (overrides: Record<string, unknown> = {}) => ({
  id: 1n,
  publicId: 'debt-1',
  tenantId,
  status: 'OPEN',
  originalAmountCents: 10000n,
  currentBalanceCents: 5000n,
  debtorName: 'João Silva',
  debtorWhatsapp: '5511999999999',
  debtorEmail: 'joao@example.com',
  debtorDocument: null,
  description: 'Serviço',
  dueDate: new Date('2026-09-01'),
  originType: 'MANUAL',
  originAppointmentId: null,
  customerId: null,
  unitId: null,
  collectionRuleId: 1n,
  collectionRule: { publicId: 'rule-1' },
  collectionPausedAt: null,
  collectionPausedReason: null,
  createdAt: new Date('2026-08-20'),
  paidAt: null,
  canceledAt: null,
  pausedAt: null,
  humanSupportAt: null,
  disputedAt: null,
  balanceSyncPending: false,
  ...overrides,
});

function mockClient(overrides: Record<string, unknown> = {}) {
  const defaults: any = {
    debt: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
    },
    paymentPromise: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    paymentGatewayCharge: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    debtEvent: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    collectionAttempt: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({}),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    debtPaymentAllocation: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    payment: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  return { ...defaults, ...overrides } as unknown as PrismaClient;
}

function mockAuthService(overrides: Record<string, unknown> = {}) {
  return {
    requirePermission: vi.fn(),
    ...overrides,
  } as unknown as AuthService;
}

describe('DebtService.listWithFilters', () => {
  let client: PrismaClient;
  let service: DebtService;

  beforeEach(() => {
    client = mockClient();
    service = new DebtService(client);
  });

  it('deve retornar lista vazia quando não há dívidas', async () => {
    (client.debt.findMany as any).mockResolvedValue([]);
    (client.debt.count as any).mockResolvedValue(0);

    const result = await service.listWithFilters(tenantId, {});

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
    expect(result.totalPages).toBe(0);
  });

  it('deve retornar página com paginação correta', async () => {
    const debt1 = mockDebt({ id: 1n, publicId: 'debt-1' });
    const debt2 = mockDebt({ id: 2n, publicId: 'debt-2' });
    (client.debt.findMany as any).mockResolvedValue([debt1, debt2]);
    (client.debt.count as any).mockResolvedValue(100);
    (client.paymentPromise.findFirst).mockResolvedValue(null);
    (client.paymentGatewayCharge.findFirst).mockResolvedValue(null);
    (client.debtEvent.findFirst).mockResolvedValue(null);

    const result = await service.listWithFilters(tenantId, { page: 2, pageSize: 50 });

    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(50);
    expect(result.totalPages).toBe(2);
    expect(result.total).toBe(100);
    expect(result.items).toHaveLength(2);
  });

  it('deve limitar pageSize a 100', async () => {
    (client.debt.findMany as any).mockResolvedValue([]);
    (client.debt.count as any).mockResolvedValue(0);

    const result = await service.listWithFilters(tenantId, { pageSize: 500 });

    expect(result.pageSize).toBe(100);
  });

  it('deve filtrar por nome', async () => {
    const debt = mockDebt({ debtorName: 'João' });
    (client.debt.findMany as any).mockResolvedValue([debt]);
    (client.debt.count as any).mockResolvedValue(1);
    (client.paymentPromise.findFirst).mockResolvedValue(null);
    (client.paymentGatewayCharge.findFirst).mockResolvedValue(null);
    (client.debtEvent.findFirst).mockResolvedValue(null);

    const result = await service.listWithFilters(tenantId, { search: 'João' });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].debtorName).toBe('João');
    expect((client.debt.findMany as any)).toHaveBeenCalled();
  });

  it('deve filtrar por WhatsApp', async () => {
    (client.debt.findMany as any).mockResolvedValue([]);
    (client.debt.count as any).mockResolvedValue(0);

    await service.listWithFilters(tenantId, { search: '5511999' });

    const call = (client.debt.findMany as any as any).mock.calls[0][0];
    expect(call?.where).toMatchObject({
      OR: expect.arrayContaining([
        expect.objectContaining({ debtorWhatsapp: { contains: '5511999' } }),
      ]),
    });
  });

  it('deve filtrar por status', async () => {
    (client.debt.findMany as any).mockResolvedValue([]);
    (client.debt.count as any).mockResolvedValue(0);

    await service.listWithFilters(tenantId, { status: 'PAID' });

    const call = (client.debt.findMany as any as any).mock.calls[0][0];
    expect(call?.where).toMatchObject({ status: 'PAID' });
  });

  it('deve filtrar por originType MANUAL', async () => {
    (client.debt.findMany as any).mockResolvedValue([]);
    (client.debt.count as any).mockResolvedValue(0);

    await service.listWithFilters(tenantId, { originType: 'MANUAL' });

    const call = (client.debt.findMany as any as any).mock.calls[0][0];
    expect(call?.where).toMatchObject({ originType: 'MANUAL' });
  });

  it('deve filtrar por originType APPOINTMENT', async () => {
    (client.debt.findMany as any).mockResolvedValue([]);
    (client.debt.count as any).mockResolvedValue(0);

    await service.listWithFilters(tenantId, { originType: 'APPOINTMENT' });

    const call = (client.debt.findMany as any as any).mock.calls[0][0];
    expect(call?.where).toMatchObject({ originType: 'APPOINTMENT' });
  });

  it('deve retornar BigInt como string', async () => {
    const debt = mockDebt({
      originalAmountCents: 10000n,
      currentBalanceCents: 5000n,
    });
    (client.debt.findMany as any).mockResolvedValue([debt]);
    (client.debt.count as any).mockResolvedValue(1);
    (client.paymentPromise.findFirst).mockResolvedValue(null);
    (client.paymentGatewayCharge.findFirst).mockResolvedValue(null);
    (client.debtEvent.findFirst).mockResolvedValue(null);

    const result = await service.listWithFilters(tenantId, {});

    expect(result.items[0].originalAmountCents).toBe('10000');
    expect(result.items[0].currentBalanceCents).toBe('5000');
    expect(typeof result.items[0].originalAmountCents).toBe('string');
  });

  it('deve garantir tenant isolation na listagem', async () => {
    (client.debt.findMany as any).mockResolvedValue([]);
    (client.debt.count as any).mockResolvedValue(0);

    await service.listWithFilters(tenantId, {});

    const call = (client.debt.findMany as any as any).mock.calls[0][0];
    expect(call?.where).toMatchObject({ tenantId });
  });

  it('deve combinar múltiplos filtros', async () => {
    (client.debt.findMany as any).mockResolvedValue([]);
    (client.debt.count as any).mockResolvedValue(0);

    const dateFrom = new Date('2026-08-01');
    const dateTo = new Date('2026-08-31');

    const result = await service.listWithFilters(tenantId, {
      search: 'João',
      status: 'OPEN',
      originType: 'MANUAL',
      dateFrom,
      dateTo,
    });

    expect(result.items).toHaveLength(0);
    expect((client.debt.findMany as any)).toHaveBeenCalled();
  });
});

describe('DebtService.getSummary', () => {
  let client: PrismaClient;
  let service: DebtService;

  beforeEach(() => {
    client = mockClient();
    service = new DebtService(client);
  });

  it('deve retornar valores zerados quando não há dívidas', async () => {
    (client.debt.findMany as any).mockResolvedValue([]);
    (client.paymentPromise.findMany).mockResolvedValue([]);
    (client.collectionAttempt.findMany).mockResolvedValue([]);

    const result = await service.getSummary(tenantId);

    expect(result.openBalanceCents).toBe('0');
    expect(result.originalTotalCents).toBe('0');
    expect(result.receivedTotalCents).toBe('0');
    expect(result.activeCount).toBe(0);
    expect(result.paidCount).toBe(0);
  });

  it('deve calcular openBalanceCents apenas de dívidas OPEN/PROMISE_SCHEDULED', async () => {
    const debts = [
      mockDebt({ status: 'OPEN', currentBalanceCents: 5000n }),
      mockDebt({ status: 'PROMISE_SCHEDULED', currentBalanceCents: 3000n }),
      mockDebt({ status: 'PAID', currentBalanceCents: 0n }),
      mockDebt({ status: 'CANCELED', currentBalanceCents: 0n }),
    ];
    (client.debt.findMany as any).mockResolvedValue(debts);
    (client.paymentPromise.findMany).mockResolvedValue([]);
    (client.collectionAttempt.findMany).mockResolvedValue([]);

    const result = await service.getSummary(tenantId);

    // OPEN + PROMISE_SCHEDULED = 5000 + 3000 = 8000
    expect(result.openBalanceCents).toBe('8000');
  });

  it('deve calcular receivedTotalCents corretamente', async () => {
    // original 10000, saldo 5000 = recebido 5000
    const debts = [
      mockDebt({
        originalAmountCents: 10000n,
        currentBalanceCents: 5000n,
      }),
      mockDebt({
        originalAmountCents: 8000n,
        currentBalanceCents: 3000n,
      }),
    ];
    (client.debt.findMany as any).mockResolvedValue(debts);
    (client.paymentPromise.findMany).mockResolvedValue([]);
    (client.collectionAttempt.findMany).mockResolvedValue([]);

    const result = await service.getSummary(tenantId);

    // (10000 - 5000) + (8000 - 3000) = 5000 + 5000 = 10000
    expect(result.receivedTotalCents).toBe('10000');
  });

  it('deve contar promises ativas e atrasadas', async () => {
    const promises = [
      { status: 'ACTIVE' },
      { status: 'ACTIVE' },
      { status: 'OVERDUE' },
      { status: 'FULFILLED' },
    ];
    (client.debt.findMany as any).mockResolvedValue([]);
    (client.paymentPromise.findMany).mockResolvedValue(promises as any);
    (client.collectionAttempt.findMany).mockResolvedValue([]);

    const result = await service.getSummary(tenantId);

    expect(result.promiseActiveCount).toBe(2);
    expect(result.promiseOverdueCount).toBe(1);
  });

  it('deve garantir tenant isolation no summary', async () => {
    (client.debt.findMany as any).mockResolvedValue([]);
    (client.paymentPromise.findMany).mockResolvedValue([]);
    (client.collectionAttempt.findMany).mockResolvedValue([]);

    await service.getSummary(tenantId);

    const debtCall = (client.debt.findMany as any as any).mock.calls[0][0];
    expect(debtCall?.where).toMatchObject({ tenantId });

    const promiseCall = (client.paymentPromise.findMany as any).mock.calls[0][0];
    expect(promiseCall?.where).toMatchObject({ tenantId });
  });
});

describe('DebtService.resumeFromHumanSupport', () => {
  let client: PrismaClient;
  let service: DebtService;

  beforeEach(() => {
    client = mockClient();
    service = new DebtService(client);
  });

  it('deve transicionar HUMAN_SUPPORT para OPEN', async () => {
    const debt = mockDebt({ status: 'HUMAN_SUPPORT' });
    (client.debt.findFirst).mockResolvedValue(debt);
    (client.debt.update).mockResolvedValue(debt);

    await service.resumeFromHumanSupport(tenantId, 'debt-1', actor);

    expect((client.debt.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'OPEN', collectionPausedAt: null, collectionPausedReason: null },
      }),
    );
  });

  it('deve rejeitar se Debt não estiver em HUMAN_SUPPORT', async () => {
    const debt = mockDebt({ status: 'OPEN' });
    (client.debt.findFirst).mockResolvedValue(debt);

    expect(service.resumeFromHumanSupport(tenantId, 'debt-1', actor)).rejects.toThrow(
      expect.objectContaining({
        code: 'INVALID_DEBT_STATUS',
      }),
    );
  });

  it('deve registrar evento COLLECTION_RESUMED_FROM_HUMAN_SUPPORT', async () => {
    const debt = mockDebt({ id: 123n, status: 'HUMAN_SUPPORT' });
    (client.debt.findFirst).mockResolvedValue(debt);
    (client.debt.update).mockResolvedValue(debt);

    await service.resumeFromHumanSupport(tenantId, 'debt-1', actor);

    expect((client.debtEvent.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          debtId: 123n,
          eventType: 'COLLECTION_RESUMED_FROM_HUMAN_SUPPORT',
        }),
      }),
    );
  });
});

describe('DebtService - Tenant Isolation', () => {
  let client: PrismaClient;
  let service: DebtService;

  beforeEach(() => {
    client = mockClient();
    service = new DebtService(client);
  });

  it('findOwned deve rejeitar Debt de outro tenant', async () => {
    const debtOtherTenant = mockDebt({ tenantId: otherTenantId });
    (client.debt.findFirst).mockResolvedValue(null);

    expect(service.findOwned(tenantId, 'debt-other')).rejects.toThrow();
  });

  it('listWithFilters não retorna dívidas de outro tenant', async () => {
    (client.debt.findMany as any).mockResolvedValue([]);
    (client.debt.count as any).mockResolvedValue(0);

    await service.listWithFilters(otherTenantId, {});

    const call = (client.debt.findMany as any as any).mock.calls[0][0];
    expect(call?.where).toMatchObject({ tenantId: otherTenantId });
    expect(call?.where).not.toMatchObject({ tenantId });
  });

  it('getSummary não agrega dívidas de outro tenant', async () => {
    (client.debt.findMany as any).mockResolvedValue([]);
    (client.paymentPromise.findMany).mockResolvedValue([]);
    (client.collectionAttempt.findMany).mockResolvedValue([]);

    await service.getSummary(otherTenantId);

    const debtCall = (client.debt.findMany as any as any).mock.calls[0][0];
    expect(debtCall?.where).toMatchObject({ tenantId: otherTenantId });
  });
});

describe('DebtService.detailFull', () => {
  let client: PrismaClient;
  let service: DebtService;

  beforeEach(() => {
    client = mockClient();
    service = new DebtService(client);
  });

  it('deve retornar detalhes completos', async () => {
    const debt = mockDebt({ id: 1n });
    (client.debt.findFirst as any).mockResolvedValue(debt);
    (client.paymentPromise.findFirst as any).mockResolvedValue(null);
    (client.debtPaymentAllocation.findMany as any).mockResolvedValue([]);
    (client.paymentGatewayCharge.findMany as any).mockResolvedValue([]);
    (client.collectionAttempt.findMany as any).mockResolvedValue([]);
    (client.debtEvent.findMany as any).mockResolvedValue([]);

    const result = await service.detailFull(tenantId, 'debt-1');

    expect(result.debt).toBeDefined();
    expect(result.activePromise).toBeNull();
    expect(result.allocations).toEqual([]);
  });

  it('deve garantir tenant isolation no detail', async () => {
    const debt = mockDebt({ id: 1n, tenantId });
    (client.debt.findFirst as any).mockResolvedValue(debt);
    (client.paymentPromise.findFirst as any).mockResolvedValue(null);
    (client.debtPaymentAllocation.findMany as any).mockResolvedValue([]);
    (client.paymentGatewayCharge.findMany as any).mockResolvedValue([]);
    (client.collectionAttempt.findMany as any).mockResolvedValue([]);
    (client.debtEvent.findMany as any).mockResolvedValue([]);

    await service.detailFull(tenantId, 'debt-1');

    const call = (client.debt.findFirst as any).mock.calls[0][0];
    expect(call?.where).toMatchObject({ tenantId });
  });
});
