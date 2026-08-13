import { randomUUID } from 'node:crypto';

import {
  ProductCatalogSummaryResponseSchema,
  ProductCategoryListResponseSchema,
  ProductCategoryPublicSchema,
  ProductListResponseSchema,
  ProductPublicSchema,
  ProductStockListResponseSchema,
  ProductStockPublicSchema,
  type CreateProductCategoryRequest,
  type CreateProductRequest,
  type ProductQuery,
  type ProductStockStatus,
  type SetMinimumStockRequest,
  type SetProductStockRequest,
} from '@plataforma/shared';

import { type ProductRepository, type StockAggregate } from './product.repository.js';
import { type StockMovementService } from './stock-movement.service.js';
import { Prisma } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { type ServiceImageStorage } from '../services/service-image.storage.js';
import { PlanEntitlementService } from '../tenants/plan-entitlement.service.js';

interface Actor {
  userId: bigint;
  sessionId: bigint;
}
interface ProductRow {
  publicId: string;
  name: string;
  description: string | null;
  sku: string | null;
  barcode: string | null;
  imagePath: string | null;
  imageAlt: string | null;
  costPriceCents: bigint;
  salePriceCents: bigint;
  commissionType: 'PERCENTAGE' | 'FIXED' | null;
  commissionValue: number | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  category: { publicId: string; name: string } | null;
}
const missing = (code: string, message: string) => new AppError({ code, message, statusCode: 404 });
const emptyStock: Omit<StockAggregate, 'productId'> = {
  quantity: 0,
  minimumQuantity: 0,
  unitCount: 0,
};
export function stockStatus(quantity: number, minimumQuantity: number): ProductStockStatus {
  if (quantity <= 0) return 'OUT_OF_STOCK';
  return quantity <= minimumQuantity ? 'LOW_STOCK' : 'IN_STOCK';
}
export class ProductCatalogService {
  public constructor(
    private readonly repository: ProductRepository,
    private readonly movements?: StockMovementService,
    private readonly images?: ServiceImageStorage,
  ) {}
  private assertEnabled(tenantId: bigint, key: 'products.enabled' | 'stock.enabled') {
    return new PlanEntitlementService().assertFeatureEnabledForTenant(
      this.repository.client,
      tenantId,
      key,
    );
  }
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
  private productPublic(row: ProductRow, stock: Omit<StockAggregate, 'productId'> = emptyStock) {
    return ProductPublicSchema.parse({
      publicId: row.publicId,
      name: row.name,
      description: row.description,
      sku: row.sku,
      barcode: row.barcode,
      categoryPublicId: row.category?.publicId ?? null,
      categoryName: row.category?.name ?? null,
      imageUrl: row.imagePath === null ? null : `/tenant/products/${row.publicId}/image`,
      imageAlt: row.imageAlt,
      costPriceCents: String(row.costPriceCents),
      salePriceCents: String(row.salePriceCents),
      commissionType: row.commissionType,
      commissionValue: row.commissionValue,
      active: row.active,
      stockQuantity: stock.quantity,
      stockMinimumQuantity: stock.minimumQuantity,
      stockStatus: stockStatus(stock.quantity, stock.minimumQuantity),
      stockUnitCount: stock.unitCount,
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
    product: { publicId: string; name: string };
    businessUnit: { publicId: string; name: string };
  }) {
    return ProductStockPublicSchema.parse({
      publicId: row.publicId,
      productPublicId: row.product.publicId,
      productName: row.product.name,
      unitPublicId: row.businessUnit.publicId,
      unitName: row.businessUnit.name,
      quantity: row.quantity,
      minimumQuantity: row.minimumQuantity,
      lowStock: row.quantity <= row.minimumQuantity,
      status: stockStatus(row.quantity, row.minimumQuantity),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  }
  public async listCategories(tenantId: bigint) {
    await this.assertEnabled(tenantId, 'products.enabled');
    return ProductCategoryListResponseSchema.parse({
      items: (await this.repository.categories(tenantId)).map((x) => this.categoryPublic(x)),
    });
  }
  public async createCategory(tenantId: bigint, input: CreateProductCategoryRequest, actor: Actor) {
    await this.assertEnabled(tenantId, 'products.enabled');
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
    await this.assertEnabled(tenantId, 'products.enabled');
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
  public async listProducts(tenantId: bigint, query: ProductQuery) {
    await this.assertEnabled(tenantId, 'products.enabled');
    const unit =
      query.unitPublicId === undefined
        ? undefined
        : await this.repository.unit(tenantId, query.unitPublicId);
    if (query.unitPublicId !== undefined && !unit)
      throw missing('BUSINESS_UNIT_NOT_FOUND', 'Unidade não encontrada.');
    const where: Prisma.ProductWhereInput = {
      tenantId,
      ...(query.search === undefined
        ? {}
        : {
            OR: [
              { name: { contains: query.search } },
              { sku: { contains: query.search } },
              { barcode: { contains: query.search } },
            ],
          }),
      ...(query.active === undefined ? {} : { active: query.active === 'true' }),
      ...(query.categoryPublicId === undefined
        ? {}
        : { category: { publicId: query.categoryPublicId } }),
    };
    const skip = (query.page - 1) * query.limit;
    if (query.stock === undefined) {
      const [total, rows] = await Promise.all([
        this.repository.countProducts(where),
        this.repository.listProducts(where, skip, query.limit),
      ]);
      const stocks = await this.repository.stockAggregates(
        tenantId,
        rows.map((row) => row.id),
        unit?.id,
      );
      return this.page(rows, stocks, total, query);
    }
    // Stock buckets live in another table, so the filter is resolved over the whole
    // tenant scope (two grouped queries) before the page is materialised.
    const [candidates, aggregates] = await Promise.all([
      this.repository.productIds(where),
      this.repository.stockAggregates(tenantId, undefined, unit?.id),
    ]);
    const byProduct = new Map(aggregates.map((row) => [row.productId, row]));
    const matching = candidates
      .map((row) => ({ id: row.id, stock: byProduct.get(row.id) ?? emptyStock }))
      .filter(({ stock }) => {
        const status = stockStatus(stock.quantity, stock.minimumQuantity);
        if (query.stock === 'out') return status === 'OUT_OF_STOCK';
        if (query.stock === 'low') return status === 'LOW_STOCK';
        return status === 'IN_STOCK';
      });
    const pageIds = matching.slice(skip, skip + query.limit).map((row) => row.id);
    const rows =
      pageIds.length === 0
        ? []
        : await this.repository.listProducts({ tenantId, id: { in: pageIds } }, 0, pageIds.length);
    return this.page(rows, aggregates, matching.length, query);
  }
  private page(
    rows: (ProductRow & { id: bigint })[],
    stocks: StockAggregate[],
    total: number,
    query: ProductQuery,
  ) {
    const byProduct = new Map(stocks.map((row) => [row.productId, row]));
    return ProductListResponseSchema.parse({
      items: rows.map((row) => this.productPublic(row, byProduct.get(row.id) ?? emptyStock)),
      page: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    });
  }
  public async getProduct(tenantId: bigint, publicId: string, unitPublicId?: string) {
    await this.assertEnabled(tenantId, 'products.enabled');
    const product = await this.repository.product(tenantId, publicId);
    if (!product) throw missing('PRODUCT_NOT_FOUND', 'Produto não encontrado.');
    const unit =
      unitPublicId === undefined ? undefined : await this.repository.unit(tenantId, unitPublicId);
    if (unitPublicId !== undefined && !unit)
      throw missing('BUSINESS_UNIT_NOT_FOUND', 'Unidade não encontrada.');
    const [stock] = await this.repository.stockAggregates(tenantId, [product.id], unit?.id);
    return this.productPublic(product, stock ?? emptyStock);
  }
  public async summary(tenantId: bigint, unitPublicId?: string) {
    await this.assertEnabled(tenantId, 'products.enabled');
    const unit =
      unitPublicId === undefined ? undefined : await this.repository.unit(tenantId, unitPublicId);
    if (unitPublicId !== undefined && !unit)
      throw missing('BUSINESS_UNIT_NOT_FOUND', 'Unidade não encontrada.');
    const [products, aggregates] = await Promise.all([
      this.repository.productCosts(tenantId),
      this.repository.stockAggregates(tenantId, undefined, unit?.id),
    ]);
    const byProduct = new Map(aggregates.map((row) => [row.productId, row]));
    let activeCount = 0;
    let inactiveCount = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let stockValueCents = 0n;
    let reliable = true;
    for (const product of products) {
      if (product.active) activeCount += 1;
      else inactiveCount += 1;
      const stock = byProduct.get(product.id) ?? emptyStock;
      if (!product.active) continue;
      const status = stockStatus(stock.quantity, stock.minimumQuantity);
      if (status === 'OUT_OF_STOCK') outOfStockCount += 1;
      if (status === 'LOW_STOCK') lowStockCount += 1;
      if (stock.quantity > 0) {
        if (product.costPriceCents <= 0n) reliable = false;
        stockValueCents += product.costPriceCents * BigInt(stock.quantity);
      }
    }
    return ProductCatalogSummaryResponseSchema.parse({
      activeCount,
      inactiveCount,
      lowStockCount,
      outOfStockCount,
      stockValueCents: stockValueCents.toString(),
      stockValueReliable: reliable,
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
      imageAlt: input.imageAlt ?? null,
      costPriceCents: BigInt(input.costPriceCents),
      salePriceCents: BigInt(input.salePriceCents),
      commissionType: input.commissionType ?? null,
      commissionValue: input.commissionValue ?? null,
      active: input.active,
    };
  }
  public async createProduct(tenantId: bigint, input: CreateProductRequest, actor: Actor) {
    await this.assertEnabled(tenantId, 'products.enabled');
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
    await this.assertEnabled(tenantId, 'products.enabled');
    const old = await this.repository.product(tenantId, publicId);
    if (!old) throw missing('PRODUCT_NOT_FOUND', 'Produto não encontrado.');
    try {
      const row = await this.repository.updateProduct(
        old.id,
        await this.productData(tenantId, input),
      );
      await this.record(tenantId, publicId, 'product.updated', 'product', actor);
      const [stock] = await this.repository.stockAggregates(tenantId, [row.id]);
      return this.productPublic(row, stock ?? emptyStock);
    } catch (error) {
      this.conflict(error);
    }
  }
  public async setProductActive(
    tenantId: bigint,
    publicId: string,
    active: boolean,
    actor: Actor,
  ) {
    await this.assertEnabled(tenantId, 'products.enabled');
    const old = await this.repository.product(tenantId, publicId);
    if (!old) throw missing('PRODUCT_NOT_FOUND', 'Produto não encontrado.');
    await this.repository.updateProduct(old.id, { active });
    await this.record(
      tenantId,
      publicId,
      active ? 'product.activated' : 'product.deactivated',
      'product',
      actor,
    );
  }
  private storage() {
    if (this.images === undefined)
      throw new AppError({
        code: 'PRODUCT_IMAGE_UNAVAILABLE',
        message: 'O armazenamento de imagens não está disponível.',
        statusCode: 503,
      });
    return this.images;
  }
  public async replaceImage(tenantId: bigint, publicId: string, image: Buffer, actor: Actor) {
    await this.assertEnabled(tenantId, 'products.enabled');
    const storage = this.storage();
    const product = await this.repository.productWithTenant(tenantId, publicId);
    if (!product) throw missing('PRODUCT_NOT_FOUND', 'Produto não encontrado.');
    const stored = await storage.save(product.tenant.publicId, product.publicId, image);
    try {
      const updated = await this.repository.updateProduct(product.id, { imagePath: stored.key });
      if (product.imagePath !== null) await storage.remove(product.imagePath);
      await this.record(tenantId, publicId, 'product.image_replaced', 'product', actor);
      const [stock] = await this.repository.stockAggregates(tenantId, [updated.id]);
      return this.productPublic(updated, stock ?? emptyStock);
    } catch (error) {
      await storage.remove(stored.key);
      throw error;
    }
  }
  public async removeImage(tenantId: bigint, publicId: string, actor: Actor) {
    await this.assertEnabled(tenantId, 'products.enabled');
    const storage = this.storage();
    const product = await this.repository.product(tenantId, publicId);
    if (!product) throw missing('PRODUCT_NOT_FOUND', 'Produto não encontrado.');
    const [stock] = await this.repository.stockAggregates(tenantId, [product.id]);
    if (product.imagePath === null) return this.productPublic(product, stock ?? emptyStock);
    const updated = await this.repository.updateProduct(product.id, { imagePath: null });
    await storage.remove(product.imagePath);
    await this.record(tenantId, publicId, 'product.image_removed', 'product', actor);
    return this.productPublic(updated, stock ?? emptyStock);
  }
  public async getImage(
    tenantId: bigint,
    publicId: string,
    variant: 'original' | 'thumbnail' = 'original',
  ) {
    const product = await this.repository.product(tenantId, publicId);
    const imagePath = product?.imagePath;
    if (imagePath === null || imagePath === undefined)
      throw missing('PRODUCT_IMAGE_NOT_FOUND', 'Imagem do produto não encontrada.');
    return this.storage().read(imagePath, variant);
  }
  public async listStock(tenantId: bigint, productPublicId?: string, unitPublicId?: string) {
    await this.assertEnabled(tenantId, 'stock.enabled');
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
  public async setMinimumStock(
    tenantId: bigint,
    productPublicId: string,
    unitPublicId: string,
    input: SetMinimumStockRequest,
    actor: Actor,
  ) {
    await this.assertEnabled(tenantId, 'stock.enabled');
    const product = await this.repository.product(tenantId, productPublicId);
    if (!product) throw missing('PRODUCT_NOT_FOUND', 'Produto não encontrado.');
    const unit = await this.repository.unit(tenantId, unitPublicId);
    if (!unit) throw missing('BUSINESS_UNIT_NOT_FOUND', 'Unidade não encontrada.');
    const row = await this.repository.upsertMinimumQuantity({
      publicId: randomUUID(),
      tenantId,
      productId: product.id,
      businessUnitId: unit.id,
      minimumQuantity: input.minimumQuantity,
    });
    await this.record(tenantId, row.publicId, 'product_stock.minimum_set', 'product_stock', actor);
    return this.stockPublic(row);
  }
  public async setStock(
    tenantId: bigint,
    productPublicId: string,
    unitPublicId: string,
    input: SetProductStockRequest,
    actor: Actor,
  ) {
    await this.assertEnabled(tenantId, 'stock.enabled');
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
