import { describe, expect, it, vi } from 'vitest';

import { CashRegisterService } from './cash-register.service.js';

import type { PrismaClient } from '../../database-client/client.js';

const register = (overrides: Record<string, unknown> = {}) => ({
  id: 1n,
  publicId: '00000000-0000-4000-8000-000000000001',
  tenantId: 1n,
  unitId: null,
  status: 'OPEN' as const,
  openingBalanceCents: 20_000n,
  closingBalanceCents: null,
  openedAt: new Date('2026-08-15T11:12:00.000Z'),
  closedAt: null,
  notes: null,
  unit: null,
  openedByUser: { email: 'rafael@exemplo.com' },
  closedByUser: null,
  ...overrides,
});

const movement = (overrides: Record<string, unknown> = {}) => ({
  publicId: '00000000-0000-4000-8000-00000000000a',
  type: 'MANUAL' as const,
  direction: 'IN' as const,
  amountCents: 5000n,
  reason: 'Suprimento',
  createdAt: new Date('2026-08-15T12:00:00.000Z'),
  payment: null,
  user: { email: 'rafael@exemplo.com' },
  ...overrides,
});

const paymentMovement = (amountCents: bigint) =>
  movement({
    publicId: '00000000-0000-4000-8000-00000000000b',
    type: 'PAYMENT',
    direction: 'IN',
    amountCents,
    reason: null,
    payment: {
      publicId: '00000000-0000-4000-8000-00000000000c',
      paymentMethod: { name: 'PIX' },
      appointment: {
        publicId: '00000000-0000-4000-8000-00000000000d',
        customer: { name: 'João Silva' },
        service: { name: 'Corte' },
      },
    },
  });

function service(movements: ReturnType<typeof movement>[], registerOverrides = {}) {
  const registerFindFirst = vi.fn().mockResolvedValue(register(registerOverrides));
  const movementFindMany = vi.fn().mockResolvedValue(movements);
  const client = {
    cashRegister: { findFirst: registerFindFirst, findMany: vi.fn().mockResolvedValue([]) },
    cashMovement: { findMany: movementFindMany },
    businessUnit: { findFirst: vi.fn().mockResolvedValue({ id: 9n }) },
  } as unknown as PrismaClient;
  return { service: new CashRegisterService(client), registerFindFirst, movementFindMany };
}

describe('caixa aberto', () => {
  it('calcula saldo esperado a partir da abertura, entradas e saídas', async () => {
    const result = await service([
      movement({ direction: 'IN', amountCents: 5000n }),
      movement({ publicId: '00000000-0000-4000-8000-00000000000e', direction: 'OUT', amountCents: 3000n }),
    ]).service.getOpen(1n, null);
    // 200,00 + 50,00 − 30,00 = 220,00
    expect(result?.register.balanceCents).toBe('22000');
    expect(result?.register.totalInCents).toBe('5000');
    expect(result?.register.totalOutCents).toBe('3000');
  });

  it('separa a parte que veio de pagamento: caixa reflete recebimento, não soma receita nova', async () => {
    const result = await service([
      paymentMovement(7000n),
      movement({ direction: 'IN', amountCents: 5000n }),
    ]).service.getOpen(1n, null);
    expect(result?.register.totalInCents).toBe('12000');
    expect(result?.register.paymentInCents).toBe('7000');
    // O movimento de pagamento carrega o contexto do atendimento, sem consulta extra.
    const payment = result?.movements.find((item) => item.type === 'PAYMENT');
    expect(payment).toMatchObject({
      paymentMethodName: 'PIX',
      customerName: 'João Silva',
      serviceName: 'Corte',
    });
  });

  it('expõe o responsável pela abertura', async () => {
    const result = await service([]).service.getOpen(1n, null);
    expect(result?.register.openedByEmail).toBe('rafael@exemplo.com');
    expect(result?.register.paymentInCents).toBe('0');
  });

  it('consulta somente o caixa do tenant e da unidade informados', async () => {
    const built = service([]);
    await built.service.getOpen(7n, '00000000-0000-4000-8000-0000000000ff');
    expect(built.registerFindFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { tenantId: 7n, unitId: 9n, status: 'OPEN' },
    });
  });
});
