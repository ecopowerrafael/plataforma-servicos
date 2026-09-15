import { randomUUID } from 'node:crypto';

import { CreateStockMovementRequestSchema, TransferStockRequestSchema } from '@plataforma/shared';
import { describe, expect, it, vi } from 'vitest';

import { type ProductRepository } from '../src/modules/products/product.repository.js';
import {
  InsufficientStockError,
  type StockMovementRepository,
} from '../src/modules/products/stock-movement.repository.js';
import { StockMovementService } from '../src/modules/products/stock-movement.service.js';

vi.mock('../src/modules/tenants/plan-entitlement.service.js', () => ({
  PlanEntitlementService: class {
    public assertFeatureEnabledForTenant() {
      return Promise.resolve();
    }
  },
}));

const tenantId = 1n;
const productPublicId = '11111111-1111-4111-8111-111111111111';
const sourceUnitPublicId = '22222222-2222-4222-8222-222222222222';
const destinationUnitPublicId = '33333333-3333-4333-8333-333333333333';
const userPublicId = '44444444-4444-4444-8444-444444444444';
const actor = { userId: 9n, sessionId: 10n };

function fixture() {
  const products = {
    product: vi.fn().mockResolvedValue({ id: 2n, publicId: productPublicId, name: 'Pomada' }),
    unit: vi
      .fn()
      .mockImplementation((_tenantId: bigint, publicId: string) =>
        Promise.resolve({ id: publicId === sourceUnitPublicId ? 3n : 4n, publicId }),
      ),
  };
  const row = {
    publicId: randomUUID(),
    transferPublicId: null,
    type: 'ENTRY',
    quantity: 5,
    previousQuantity: 2,
    resultingQuantity: 7,
    reason: null,
    createdAt: new Date(),
    product: { publicId: productPublicId, name: 'Pomada' },
    businessUnit: { publicId: sourceUnitPublicId, name: 'Centro' },
    relatedBusinessUnit: null,
    performedByUser: { publicId: userPublicId, name: 'Rafael' },
    saleItem: null,
  };
  const movements = {
    list: vi.fn().mockResolvedValue({ total: 1, items: [row] }),
    move: vi.fn().mockResolvedValue(row),
    transfer: vi.fn(),
  };
  const service = new StockMovementService(
    movements as unknown as StockMovementRepository,
    products as unknown as ProductRepository,
  );
  return { service, movements, products, row };
}

describe('movimentações de estoque', () => {
  it('exige motivo para saídas e ajustes, e bloqueia transferência para a mesma unidade', () => {
    expect(() =>
      CreateStockMovementRequestSchema.parse({
        type: 'MANUAL_EXIT',
        productPublicId,
        unitPublicId: sourceUnitPublicId,
        quantity: 1,
      }),
    ).toThrow();
    expect(() =>
      TransferStockRequestSchema.parse({
        productPublicId,
        sourceUnitPublicId,
        destinationUnitPublicId: sourceUnitPublicId,
        quantity: 1,
        reason: 'Reposição',
      }),
    ).toThrow();
  });

  it('mantém saldo anterior/posterior, responsável e data no histórico', async () => {
    const { service } = fixture();
    const result = await service.list(tenantId, {
      page: 1,
      limit: 20,
      productPublicId,
      unitPublicId: sourceUnitPublicId,
    });
    expect(result.items[0]).toMatchObject({
      previousQuantity: 2,
      resultingQuantity: 7,
      responsibleUserPublicId: userPublicId,
      responsibleName: 'Rafael',
      unitName: 'Centro',
    });
    expect(result.page).toMatchObject({ total: 1, totalPages: 1 });
  });

  it('converte tentativa de saldo negativo em conflito operacional', async () => {
    const { service, movements } = fixture();
    movements.move.mockRejectedValue(new InsufficientStockError());
    await expect(
      service.create(
        tenantId,
        {
          type: 'MANUAL_EXIT',
          productPublicId,
          unitPublicId: sourceUnitPublicId,
          quantity: 99,
          reason: 'Perda identificada',
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK', statusCode: 409 });
  });

  it('registra transferência como duas pernas vinculadas', async () => {
    const { service, movements, row } = fixture();
    const transferPublicId = randomUUID();
    movements.transfer.mockResolvedValue({
      transferPublicId,
      movements: [
        {
          ...row,
          transferPublicId,
          type: 'TRANSFER_OUT',
          resultingQuantity: 1,
          relatedBusinessUnit: { publicId: destinationUnitPublicId, name: 'Zona Sul' },
        },
        {
          ...row,
          publicId: randomUUID(),
          transferPublicId,
          type: 'TRANSFER_IN',
          previousQuantity: 0,
          resultingQuantity: 1,
          businessUnit: { publicId: destinationUnitPublicId, name: 'Zona Sul' },
          relatedBusinessUnit: { publicId: sourceUnitPublicId, name: 'Centro' },
        },
      ],
    });
    const result = await service.transfer(
      tenantId,
      {
        productPublicId,
        sourceUnitPublicId,
        destinationUnitPublicId,
        quantity: 1,
        reason: 'Reposição interna',
      },
      actor,
    );
    expect(result.movements.map((item) => item.type)).toEqual(['TRANSFER_OUT', 'TRANSFER_IN']);
    expect(result.transferPublicId).toBe(transferPublicId);
  });
});
