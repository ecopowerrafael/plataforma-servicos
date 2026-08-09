import {
  StockMovementListResponseSchema,
  StockMovementPublicSchema,
  TransferStockResponseSchema,
  type CreateStockMovementRequest,
  type TransferStockRequest,
} from '@plataforma/shared';

import { type ProductRepository } from './product.repository.js';
import {
  InsufficientStockError,
  type StockMovementRepository,
} from './stock-movement.repository.js';
import { AppError } from '../../errors/AppError.js';

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
  private pub(row: {
    publicId: string;
    transferPublicId: string | null;
    type: string;
    quantity: number;
    previousQuantity: number;
    resultingQuantity: number;
    reason: string | null;
    createdAt: Date;
    product: { publicId: string };
    businessUnit: { publicId: string };
    relatedBusinessUnit: { publicId: string } | null;
    performedByUser: { publicId: string };
  }) {
    return StockMovementPublicSchema.parse({
      publicId: row.publicId,
      transferPublicId: row.transferPublicId,
      type: row.type,
      productPublicId: row.product.publicId,
      unitPublicId: row.businessUnit.publicId,
      relatedUnitPublicId: row.relatedBusinessUnit?.publicId ?? null,
      quantity: row.quantity,
      previousQuantity: row.previousQuantity,
      resultingQuantity: row.resultingQuantity,
      reason: row.reason,
      responsibleUserPublicId: row.performedByUser.publicId,
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
  public async list(tenantId: bigint, productPublicId?: string, unitPublicId?: string) {
    const product = productPublicId ? await this.products.product(tenantId, productPublicId) : null;
    if (productPublicId && !product) throw notFound('PRODUCT_NOT_FOUND', 'Produto não encontrado.');
    const unit = unitPublicId ? await this.products.unit(tenantId, unitPublicId) : null;
    if (unitPublicId && !unit) throw notFound('BUSINESS_UNIT_NOT_FOUND', 'Unidade não encontrada.');
    return StockMovementListResponseSchema.parse({
      items: (await this.repository.list(tenantId, product?.id, unit?.id)).map((row) =>
        this.pub(row),
      ),
    });
  }
  public async create(tenantId: bigint, input: CreateStockMovementRequest, actor: Actor) {
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
