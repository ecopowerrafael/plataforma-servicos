import {
  StockMovementListResponseSchema,
  StockMovementPublicSchema,
  TransferStockResponseSchema,
  type CreateStockMovementRequest,
  type StockMovementQuery,
  type TransferStockRequest,
} from '@plataforma/shared';

import { type ProductRepository } from './product.repository.js';
import {
  InsufficientStockError,
  type StockMovementRepository,
} from './stock-movement.repository.js';
import { AppError } from '../../errors/AppError.js';
import { PlanEntitlementService } from '../tenants/plan-entitlement.service.js';

interface Actor {
  userId: bigint;
  sessionId: bigint;
}
const notFound = (code: string, message: string) =>
  new AppError({ code, message, statusCode: 404 });
export class StockMovementService {
  public constructor(
    private readonly repository: StockMovementRepository,
    private readonly products: ProductRepository,
  ) {}
  private assertEnabled(tenantId: bigint) { return new PlanEntitlementService().assertFeatureEnabledForTenant(this.products.client, tenantId, 'stock.enabled'); }
  private pub(row: {
    publicId: string;
    transferPublicId: string | null;
    type: string;
    quantity: number;
    previousQuantity: number;
    resultingQuantity: number;
    reason: string | null;
    createdAt: Date;
    product: { publicId: string; name: string };
    businessUnit: { publicId: string; name: string };
    relatedBusinessUnit: { publicId: string; name: string } | null;
    performedByUser: { publicId: string; name: string };
    saleItem?: { sale: { publicId: string; customer: { name: string } | null } } | null;
  }) {
    return StockMovementPublicSchema.parse({
      publicId: row.publicId,
      transferPublicId: row.transferPublicId,
      type: row.type,
      productPublicId: row.product.publicId,
      productName: row.product.name,
      unitPublicId: row.businessUnit.publicId,
      unitName: row.businessUnit.name,
      relatedUnitPublicId: row.relatedBusinessUnit?.publicId ?? null,
      relatedUnitName: row.relatedBusinessUnit?.name ?? null,
      quantity: row.quantity,
      previousQuantity: row.previousQuantity,
      resultingQuantity: row.resultingQuantity,
      reason: row.reason,
      responsibleUserPublicId: row.performedByUser.publicId,
      responsibleName: row.performedByUser.name,
      salePublicId: row.saleItem?.sale.publicId ?? null,
      saleCustomerName: row.saleItem?.sale.customer?.name ?? null,
      createdAt: row.createdAt.toISOString(),
    });
  }
  private async resolve(tenantId: bigint, productPublicId: string, unitPublicId: string) {
    const product = await this.products.product(tenantId, productPublicId);
    if (!product) throw notFound('PRODUCT_NOT_FOUND', 'Produto não encontrado.');
    const unit = await this.products.unit(tenantId, unitPublicId);
    if (!unit) throw notFound('BUSINESS_UNIT_NOT_FOUND', 'Unidade não encontrada.');
    return { product, unit };
  }
  public async list(tenantId: bigint, query: StockMovementQuery) {
    await this.assertEnabled(tenantId);
    const product = query.productPublicId
      ? await this.products.product(tenantId, query.productPublicId)
      : null;
    if (query.productPublicId && !product)
      throw notFound('PRODUCT_NOT_FOUND', 'Produto não encontrado.');
    const unit = query.unitPublicId
      ? await this.products.unit(tenantId, query.unitPublicId)
      : null;
    if (query.unitPublicId && !unit)
      throw notFound('BUSINESS_UNIT_NOT_FOUND', 'Unidade não encontrada.');
    const { total, items } = await this.repository.list(
      tenantId,
      {
        productId: product?.id,
        unitId: unit?.id,
        type: query.type,
        from: query.from === undefined ? undefined : new Date(query.from),
        to: query.to === undefined ? undefined : new Date(query.to),
      },
      query.page,
      query.limit,
    );
    return StockMovementListResponseSchema.parse({
      items: items.map((row) => this.pub(row)),
      page: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    });
  }
  public async create(tenantId: bigint, input: CreateStockMovementRequest, actor: Actor) {
    await this.assertEnabled(tenantId);
    const { product, unit } = await this.resolve(
      tenantId,
      input.productPublicId,
      input.unitPublicId,
    );
    try {
      return this.pub(
        await this.repository.move({
          tenantId,
          productId: product.id,
          unitId: unit.id,
          type: input.type,
          quantity: input.quantity,
          reason: input.reason ?? null,
          actor,
        }),
      );
    } catch (error) {
      this.stockError(error);
    }
  }
  public async transfer(tenantId: bigint, input: TransferStockRequest, actor: Actor) {
    await this.assertEnabled(tenantId);
    const { product, unit: source } = await this.resolve(
      tenantId,
      input.productPublicId,
      input.sourceUnitPublicId,
    );
    const destination = await this.products.unit(tenantId, input.destinationUnitPublicId);
    if (!destination)
      throw notFound('BUSINESS_UNIT_NOT_FOUND', 'Unidade de destino não encontrada.');
    try {
      const result = await this.repository.transfer({
        tenantId,
        productId: product.id,
        sourceUnitId: source.id,
        destinationUnitId: destination.id,
        quantity: input.quantity,
        reason: input.reason,
        actor,
      });
      return TransferStockResponseSchema.parse({
        transferPublicId: result.transferPublicId,
        movements: result.movements.map((row) => this.pub(row)),
      });
    } catch (error) {
      this.stockError(error);
    }
  }
  private stockError(error: unknown): never {
    if (error instanceof InsufficientStockError)
      throw new AppError({
        code: 'INSUFFICIENT_STOCK',
        message: 'O saldo disponível é insuficiente para esta movimentação.',
        statusCode: 409,
      });
    throw error;
  }
}
