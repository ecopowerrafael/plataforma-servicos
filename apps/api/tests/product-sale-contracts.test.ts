import { CreateProductRequestSchema, CreateProductSaleRequestSchema } from '@plataforma/shared';
import { describe, expect, it } from 'vitest';
const id = (digit: string) =>
  `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
describe('contratos de venda de produtos', () => {
  it('aceita comissão configurada no produto', () => {
    expect(
      CreateProductRequestSchema.safeParse({
        name: 'Produto',
        costPriceCents: '100',
        salePriceCents: '200',
        commissionType: 'PERCENTAGE',
        commissionValue: 10,
      }).success,
    ).toBe(true);
  });
  it('aceita venda vinculada à infraestrutura real', () => {
    expect(
      CreateProductSaleRequestSchema.safeParse({
        unitPublicId: id('1'),
        paymentMethodPublicId: id('2'),
        professionalPublicId: id('3'),
        items: [{ productPublicId: id('4'), quantity: 2 }],
      }).success,
    ).toBe(true);
  });
  it('rejeita produto duplicado na venda', () => {
    expect(
      CreateProductSaleRequestSchema.safeParse({
        unitPublicId: id('1'),
        paymentMethodPublicId: id('2'),
        items: [
          { productPublicId: id('4'), quantity: 1 },
          { productPublicId: id('4'), quantity: 2 },
        ],
      }).success,
    ).toBe(false);
  });
});
