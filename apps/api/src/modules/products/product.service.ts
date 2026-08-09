import { randomUUID } from 'node:crypto';

import {
  ProductCategoryListResponseSchema,
  ProductCategoryPublicSchema,
  ProductListResponseSchema,
  ProductPublicSchema,
  ProductStockListResponseSchema,
  ProductStockPublicSchema,
  type CreateProductCategoryRequest,
  type CreateProductRequest,
  type SetProductStockRequest,
} from '@plataforma/shared';

import { type ProductRepository } from './product.repository.js';
import { type StockMovementService } from './stock-movement.service.js';
import { Prisma } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';

interface Actor {
  userId: bigint;
  sessionId: bigint;
}
const missing = (code: string, message: string) => new AppError({ code, message, statusCode: 404 });
export class ProductCatalogService {
  public constructor(
    private readonly repository: ProductRepository,
    private readonly movements?: StockMovementService,
  ) {}
  private categoryPublic(row: {
    publicId: string;
    name: string;
    description: string | null;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return ProductCategoryPublicSchema.parse({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  }
  private productPublic(row: {
    publicId: string;
    name: string;
    description: string | null;
    sku: string | null;
    barcode: string | null;
    costPriceCents: bigint;
    salePriceCents: bigint;
    commissionType: 'PERCENTAGE' | 'FIXED' | null;
    commissionValue: number | null;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
    category: { publicId: string } | null;
  }) {
    return ProductPublicSchema.parse({
      ...row,
      categoryPublicId: row.category?.publicId ?? null,
      costPriceCents: String(row.costPriceCents),
      salePriceCents: String(row.salePriceCents),
      commissionType: row.commissionType,
      commissionValue: row.commissionValue,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  }
  private stockPublic(row: {
    publicId: string;
    quantity: number;
    minimumQuantity: number;
    createdAt: Date;
    updatedAt: Date;
    product: { publicId: string };
    businessUnit: { publicId: string };
  }) {
    return ProductStockPublicSchema.parse({
      publicId: row.publicId,
      productPublicId: row.product.publicId,
      unitPublicId: row.businessUnit.publicId,
      quantity: row.quantity,
      minimumQuantity: row.minimumQuantity,
      lowStock: row.quantity <= row.minimumQuantity,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  }
  public async listCategories(tenantId: bigint) {
    return ProductCategoryListResponseSchema.parse({
      items: (await this.repository.categories(tenantId)).map((x) => this.categoryPublic(x)),
    });
  }
  public async createCategory(tenantId: bigint, input: CreateProductCategoryRequest, actor: Actor) {
    try {
      const row = await this.repository.createCategory({
        publicId: randomUUID(),
        tenantId,
        ...input,
        description: input.description ?? null,
      });
      await this.record(
        tenantId,
        row.publicId,
        'product_category.created',
        'product_category',
        actor,
      );
      return this.categoryPublic(row);
    } catch (error) {
      this.conflict(error);
    }
  }
  public async updateCategory(
    tenantId: bigint,
    publicId: string,
    input: CreateProductCategoryRequest,
    actor: Actor,
  ) {
    const old = await this.repository.category(tenantId, publicId);
    if (!old) throw missing('PRODUCT_CATEGORY_NOT_FOUND', 'Categoria de produto não encontrada.');
    try {
      const row = await this.repository.updateCategory(old.id, {
        ...input,
        description: input.description ?? null,
      });
      await this.record(tenantId, publicId, 'product_category.updated', 'product_category', actor);
      return this.categoryPublic(row);
    } catch (error) {
      this.conflict(error);
    }
  }
  public async listProducts(tenantId: bigint) {
    return ProductListResponseSchema.parse({
      items: (await this.repository.products(tenantId)).map((x) => this.productPublic(x)),
    });
  }
  private async productData(tenantId: bigint, input: CreateProductRequest) {
    let categoryId: bigint | null = null;
    if (input.categoryPublicId) {
      const category = await this.repository.category(tenantId, input.categoryPublicId);
      if (!category)
        throw missing('PRODUCT_CATEGORY_NOT_FOUND', 'Categoria de produto não encontrada.');
      categoryId = category.id;
    }
    return {
      categoryId,
      name: input.name,
      description: input.description ?? null,
      sku: input.sku ?? null,
      barcode: input.barcode ?? null,
      costPriceCents: BigInt(input.costPriceCents),
      salePriceCents: BigInt(input.salePriceCents),
      commissionType: input.commissionType ?? null,
      commissionValue: input.commissionValue ?? null,
      active: input.active,
    };
  }
  public async createProduct(tenantId: bigint, input: CreateProductRequest, actor: Actor) {
    try {
      const row = await this.repository.createProduct({
        publicId: randomUUID(),
        tenantId,
        ...(await this.productData(tenantId, input)),
      });
      await this.record(tenantId, row.publicId, 'product.created', 'product', actor);
      return this.productPublic(row);
    } catch (error) {
      this.conflict(error);
    }
  }
  public async updateProduct(
    tenantId: bigint,
    publicId: string,
    input: CreateProductRequest,
    actor: Actor,
  ) {
    const old = await this.repository.product(tenantId, publicId);
    if (!old) throw missing('PRODUCT_NOT_FOUND', 'Produto não encontrado.');
    try {
      const row = await this.repository.updateProduct(
        old.id,
        await this.productData(tenantId, input),
      );
      await this.record(tenantId, publicId, 'product.updated', 'product', actor);
      return this.productPublic(row);
    } catch (error) {
      this.conflict(error);
    }
  }
  public async listStock(tenantId: bigint, productPublicId?: string, unitPublicId?: string) {
    const product = productPublicId
      ? await this.repository.product(tenantId, productPublicId)
      : null;
    if (productPublicId && !product) throw missing('PRODUCT_NOT_FOUND', 'Produto não encontrado.');
    const unit = unitPublicId ? await this.repository.unit(tenantId, unitPublicId) : null;
    if (unitPublicId && !unit) throw missing('BUSINESS_UNIT_NOT_FOUND', 'Unidade não encontrada.');
    return ProductStockListResponseSchema.parse({
      items: (await this.repository.stocks(tenantId, product?.id, unit?.id)).map((x) =>
        this.stockPublic(x),
      ),
    });
  }
  public async setStock(
    tenantId: bigint,
    productPublicId: string,
    unitPublicId: string,
    input: SetProductStockRequest,
    actor: Actor,
  ) {
    const product = await this.repository.product(tenantId, productPublicId);
    if (!product) throw missing('PRODUCT_NOT_FOUND', 'Produto não encontrado.');
    const unit = await this.repository.unit(tenantId, unitPublicId);
    if (!unit) throw missing('BUSINESS_UNIT_NOT_FOUND', 'Unidade não encontrada.');
    const current = (await this.repository.stocks(tenantId, product.id, unit.id))[0];
    if (this.movements !== undefined && input.quantity !== (current?.quantity ?? 0)) {
      const increases = input.quantity > (current?.quantity ?? 0);
      await this.movements.create(
        tenantId,
        {
          type: increases ? 'ENTRY' : 'NEGATIVE_ADJUSTMENT',
          productPublicId,
          unitPublicId,
          quantity: Math.abs(input.quantity - (current?.quantity ?? 0)),
          reason: 'Definição manual do saldo de estoque.',
        },
        actor,
      );
      const changed = (await this.repository.stocks(tenantId, product.id, unit.id))[0];
      if (changed === undefined) throw new Error('Saldo de estoque não encontrado após ajuste.');
      const row = await this.repository.setMinimumQuantity(changed.id, input.minimumQuantity);
      return this.stockPublic({ ...row, product, businessUnit: unit });
    }
    const row =
      current === undefined
        ? await this.repository.upsertStock({
            publicId: randomUUID(),
            tenantId,
            productId: product.id,
            businessUnitId: unit.id,
            ...input,
          })
        : await this.repository.setMinimumQuantity(current.id, input.minimumQuantity);
    await this.record(tenantId, row.publicId, 'product_stock.set', 'product_stock', actor);
    return this.stockPublic({ ...row, product, businessUnit: unit });
  }
  private conflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new AppError({
        code: 'PRODUCT_CONFLICT',
        message: 'Nome, SKU ou código de barras já cadastrado.',
        statusCode: 409,
        cause: error,
      });
    throw error;
  }
  private async record(
    tenantId: bigint,
    targetPublicId: string,
    action: string,
    targetType: string,
    actor: Actor,
  ) {
    await this.repository.audit({
      publicId: randomUUID(),
      tenantId,
      userId: actor.userId,
      sessionId: actor.sessionId,
      action,
      targetType,
      targetPublicId,
    });
  }
}
