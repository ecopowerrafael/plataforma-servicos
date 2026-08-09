import {
  CreateProductCategoryRequestSchema,
  CreateProductRequestSchema,
  PermissionCodeSchema,
  ProductStockPublicSchema,
  SetProductStockRequestSchema,
} from '@plataforma/shared';
import { describe, expect, it } from 'vitest';

describe('contratos da fundação de produtos e estoque', () => {
  it('valida categorias de produtos sem aceitar campos internos', () => {
    expect(CreateProductCategoryRequestSchema.parse({ name: 'Shampoos' }).active).toBe(true);
    expect(() => CreateProductCategoryRequestSchema.parse({ name: 'A', tenantId: '1' })).toThrow();
  });

  it('normaliza valores monetários e valida identificação do produto', () => {
    const product = CreateProductRequestSchema.parse({
      name: 'Shampoo neutro',
      sku: 'SH-001',
      costPriceCents: 1200,
      salePriceCents: 2500,
    });
    expect(product.costPriceCents).toBe('1200');
    expect(product.salePriceCents).toBe('2500');
    expect(PermissionCodeSchema.parse('product.manage')).toBe('product.manage');
  });

  it('impede saldo negativo e expõe alerta calculado por unidade', () => {
    expect(() => SetProductStockRequestSchema.parse({ quantity: -1 })).toThrow();
    const stock = ProductStockPublicSchema.parse({
      publicId: '11111111-1111-4111-8111-111111111111',
      productPublicId: '22222222-2222-4222-8222-222222222222',
      unitPublicId: '33333333-3333-4333-8333-333333333333',
      quantity: 2,
      minimumQuantity: 3,
      lowStock: true,
      createdAt: '2026-08-09T12:00:00.000Z',
      updatedAt: '2026-08-09T12:00:00.000Z',
    });
    expect(stock.lowStock).toBe(true);
    expect(PermissionCodeSchema.parse('stock.manage')).toBe('stock.manage');
  });
});
