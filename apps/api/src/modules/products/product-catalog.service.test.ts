import { describe, expect, it, vi } from 'vitest';

import { ProductCatalogService, stockStatus } from './product.service.js';

import type { ProductRepository } from './product.repository.js';

vi.mock('../tenants/plan-entitlement.service.js', () => ({
  PlanEntitlementService: class {
    public assertFeatureEnabledForTenant() {
      return Promise.resolve();
    }
  },
}));

const tenantId = 1n;
const unitPublicId = '22222222-2222-4222-8222-222222222222';

function product(id: bigint, name: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    publicId: `00000000-0000-4000-8000-00000000000${id.toString()}`,
    name,
    description: null,
    sku: null,
    barcode: null,
    imagePath: null,
    imageAlt: null,
    costPriceCents: 1_000n,
    salePriceCents: 3_990n,
    commissionType: null,
    commissionValue: null,
    active: true,
    createdAt: new Date('2026-01-01T12:00:00.000Z'),
    updatedAt: new Date('2026-01-02T12:00:00.000Z'),
    category: { publicId: '33333333-3333-4333-8333-333333333333', name: 'Cabelo' },
    ...overrides,
  };
}

function repository(overrides: Record<string, unknown> = {}) {
  return {
    client: {},
    countProducts: vi.fn().mockResolvedValue(1),
    listProducts: vi.fn().mockResolvedValue([product(1n, 'Pomada')]),
    productIds: vi.fn().mockResolvedValue([{ id: 1n }, { id: 2n }]),
    stockAggregates: vi
      .fn()
      .mockResolvedValue([{ productId: 1n, quantity: 4, minimumQuantity: 5, unitCount: 1 }]),
    product: vi.fn().mockResolvedValue(product(1n, 'Pomada')),
    productCosts: vi.fn().mockResolvedValue([
      { id: 1n, active: true, costPriceCents: 1_000n },
      { id: 2n, active: true, costPriceCents: 0n },
    ]),
    unit: vi.fn().mockResolvedValue({ id: 9n, publicId: unitPublicId, name: 'Centro' }),
    upsertMinimumQuantity: vi.fn(),
    audit: vi.fn(),
    ...overrides,
  } as unknown as ProductRepository;
}

describe('catálogo de produtos', () => {
  it('classifica situação de estoque a partir do saldo e do mínimo', () => {
    expect(stockStatus(0, 5)).toBe('OUT_OF_STOCK');
    expect(stockStatus(4, 5)).toBe('LOW_STOCK');
    expect(stockStatus(9, 5)).toBe('IN_STOCK');
  });

  it('agrega o estoque da listagem em uma única consulta, sem N+1 por produto', async () => {
    const stockAggregates = vi
      .fn()
      .mockResolvedValue([{ productId: 1n, quantity: 4, minimumQuantity: 5, unitCount: 1 }]);
    const repo = repository({ stockAggregates });
    const result = await new ProductCatalogService(repo).listProducts(tenantId, {
      page: 1,
      limit: 20,
    });
    expect(result.items[0]).toMatchObject({
      name: 'Pomada',
      categoryName: 'Cabelo',
      stockQuantity: 4,
      stockStatus: 'LOW_STOCK',
    });
    expect(result.page).toMatchObject({ page: 1, total: 1, totalPages: 1 });
    expect(stockAggregates).toHaveBeenCalledOnce();
  });

  it('filtra por situação de estoque em todo o tenant, e não apenas na página atual', async () => {
    const listProducts = vi.fn().mockResolvedValue([product(2n, 'Shampoo')]);
    const repo = repository({ listProducts });
    const result = await new ProductCatalogService(repo).listProducts(tenantId, {
      page: 1,
      limit: 20,
      stock: 'out',
    });
    // O produto 1 tem saldo 4; apenas o produto 2 (sem saldo) é "sem estoque".
    expect(result.page.total).toBe(1);
    expect(listProducts).toHaveBeenCalledWith({ tenantId, id: { in: [2n] } }, 0, 1);
  });

  it('marca o valor em estoque como não confiável quando falta preço de custo', async () => {
    const repo = repository({
      stockAggregates: vi.fn().mockResolvedValue([
        { productId: 1n, quantity: 2, minimumQuantity: 0, unitCount: 1 },
        { productId: 2n, quantity: 3, minimumQuantity: 0, unitCount: 1 },
      ]),
    });
    const summary = await new ProductCatalogService(repo).summary(tenantId);
    expect(summary).toMatchObject({
      activeCount: 2,
      stockValueCents: '2000',
      stockValueReliable: false,
    });
  });

  it('mantém o isolamento por tenant ao buscar o detalhe', async () => {
    const find = vi.fn().mockResolvedValue(null);
    await expect(
      new ProductCatalogService(repository({ product: find })).getProduct(
        tenantId,
        '00000000-0000-4000-8000-000000000009',
      ),
    ).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND', statusCode: 404 });
    expect(find).toHaveBeenCalledWith(tenantId, '00000000-0000-4000-8000-000000000009');
  });

  it('grava estoque mínimo sem alterar o saldo', async () => {
    const upsertMinimumQuantity = vi.fn().mockResolvedValue({
      publicId: '44444444-4444-4444-8444-444444444444',
      quantity: 7,
      minimumQuantity: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
      product: { publicId: '00000000-0000-4000-8000-000000000001', name: 'Pomada' },
      businessUnit: { publicId: unitPublicId, name: 'Centro' },
    });
    const repo = repository({ upsertMinimumQuantity });
    const result = await new ProductCatalogService(repo).setMinimumStock(
      tenantId,
      '00000000-0000-4000-8000-000000000001',
      unitPublicId,
      { minimumQuantity: 3 },
      { userId: 1n, sessionId: 2n },
    );
    expect(result).toMatchObject({ quantity: 7, minimumQuantity: 3, status: 'IN_STOCK' });
    expect(upsertMinimumQuantity).toHaveBeenCalledWith(
      expect.objectContaining({ minimumQuantity: 3, tenantId }),
    );
  });
});
