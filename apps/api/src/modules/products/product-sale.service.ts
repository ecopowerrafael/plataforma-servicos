import {
  ProductSaleListResponseSchema,
  ProductSalePublicSchema,
  type CreateProductSaleRequest,
} from '@plataforma/shared';

import { type ProductSaleRepository } from './product-sale.repository.js';
import { type ProductRepository } from './product.repository.js';
import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
interface Actor {
  userId: bigint;
  sessionId: bigint;
}
export class ProductSaleService {
  public constructor(
    private readonly client: PrismaClient,
    private readonly repo: ProductSaleRepository,
    private readonly products: ProductRepository,
  ) {}
  private pub(row: Awaited<ReturnType<ProductSaleRepository['list']>>[number]) {
    return ProductSalePublicSchema.parse({
      publicId: row.publicId,
      unitPublicId: row.unit.publicId,
      customerPublicId: row.customer?.publicId ?? null,
      professionalPublicId: row.professional?.publicId ?? null,
      paymentMethodPublicId: row.paymentMethod.publicId,
      totalCents: row.totalCents.toString(),
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      items: row.items.map((item) => ({
        publicId: item.publicId,
        productPublicId: item.product.publicId,
        productName: item.product.name,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents.toString(),
        totalCents: item.totalCents.toString(),
        commissionAmountCents: item.commissionAmountCents.toString(),
        stockMovementPublicId: item.stockMovement.publicId,
      })),
    });
  }
  public async list(
    t: bigint,
    q: {
      unitPublicId?: string | undefined;
      customerPublicId?: string | undefined;
      professionalPublicId?: string | undefined;
      from?: string | undefined;
      to?: string | undefined;
    },
  ) {
    return ProductSaleListResponseSchema.parse({
      items: (
        await this.repo.list(t, {
          ...(q.unitPublicId === undefined ? {} : { unit: { publicId: q.unitPublicId } }),
          ...(q.customerPublicId === undefined
            ? {}
            : { customer: { publicId: q.customerPublicId } }),
          ...(q.professionalPublicId === undefined
            ? {}
            : { professional: { publicId: q.professionalPublicId } }),
          ...(q.from === undefined && q.to === undefined
            ? {}
            : {
                createdAt: {
                  ...(q.from === undefined ? {} : { gte: new Date(q.from) }),
                  ...(q.to === undefined ? {} : { lte: new Date(q.to) }),
                },
              }),
        })
      ).map((row) => this.pub(row)),
    });
  }
  public async create(t: bigint, input: CreateProductSaleRequest, actor: Actor) {
    const [unit, customer, professional, paymentMethod] = await Promise.all([
      this.products.unit(t, input.unitPublicId),
      input.customerPublicId == null
        ? null
        : this.client.customer.findFirst({
            where: { tenantId: t, publicId: input.customerPublicId, status: 'ACTIVE' },
          }),
      input.professionalPublicId == null
        ? null
        : this.client.professional.findFirst({
            where: { tenantId: t, publicId: input.professionalPublicId, active: true },
          }),
      this.client.paymentMethod.findFirst({
        where: { tenantId: t, publicId: input.paymentMethodPublicId, active: true },
      }),
    ]);
    if (
      unit === null ||
      paymentMethod === null ||
      (input.customerPublicId != null && customer === null) ||
      (input.professionalPublicId != null && professional === null)
    )
      throw new AppError({
        code: 'PRODUCT_SALE_RESOURCE_NOT_FOUND',
        message: 'Unidade, cliente, profissional ou forma de pagamento inválido.',
        statusCode: 404,
      });
    const products = await Promise.all(
      input.items.map((item) => this.products.product(t, item.productPublicId)),
    );
    if (products.some((product) => product === null))
      throw new AppError({
        code: 'PRODUCT_NOT_FOUND',
        message: 'Produto não encontrado.',
        statusCode: 404,
      });
    const result = await this.repo.create({
      tenantId: t,
      unitId: unit.id,
      customerId: customer?.id ?? null,
      professionalId: professional?.id ?? null,
      paymentMethodId: paymentMethod.id,
      notes: input.notes ?? null,
      actor,
      items: input.items.map((item, index) => ({
        productId: products[index]?.id ?? 0n,
        quantity: item.quantity,
      })),
    });
    if (result === null)
      throw new AppError({
        code: 'PRODUCT_SALE_BUSY',
        message: 'Outra venda está sendo processada.',
        statusCode: 409,
      });
    if (result === 'PRODUCT_NOT_FOUND')
      throw new AppError({
        code: result,
        message: 'Produto inativo ou não encontrado.',
        statusCode: 404,
      });
    if (result === 'INSUFFICIENT_STOCK')
      throw new AppError({
        code: result,
        message: 'Estoque insuficiente para concluir a venda.',
        statusCode: 409,
      });
    return this.pub(result);
  }
}
