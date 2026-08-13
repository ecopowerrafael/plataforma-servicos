import { type Prisma, type PrismaClient } from '../../database-client/client.js';

export interface StockAggregate {
  productId: bigint;
  quantity: number;
  minimumQuantity: number;
  unitCount: number;
}

export class ProductRepository {
  public constructor(public readonly client: PrismaClient) {}
  public categories(tenantId: bigint) {
    return this.client.productCategory.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
  }
  public category(tenantId: bigint, publicId: string) {
    return this.client.productCategory.findFirst({ where: { tenantId, publicId } });
  }
  public createCategory(data: Prisma.ProductCategoryUncheckedCreateInput) {
    return this.client.productCategory.create({ data });
  }
  public updateCategory(id: bigint, data: Prisma.ProductCategoryUncheckedUpdateInput) {
    return this.client.productCategory.update({ where: { id }, data });
  }
  public categoryProductCounts(tenantId: bigint) {
    return this.client.product.groupBy({
      by: ['categoryId'],
      where: { tenantId, categoryId: { not: null } },
      _count: { _all: true },
    });
  }
  public products(tenantId: bigint) {
    return this.client.product.findMany({
      where: { tenantId },
      include: { category: true },
      orderBy: { name: 'asc' },
    });
  }
  public countProducts(where: Prisma.ProductWhereInput) {
    return this.client.product.count({ where });
  }
  public productIds(where: Prisma.ProductWhereInput) {
    return this.client.product.findMany({ where, select: { id: true }, orderBy: { name: 'asc' } });
  }
  public listProducts(where: Prisma.ProductWhereInput, skip: number, take: number) {
    return this.client.product.findMany({
      where,
      include: { category: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip,
      take,
    });
  }
  /** One grouped query for every product in scope, so listings never read stock product by product. */
  public async stockAggregates(
    tenantId: bigint,
    productIds?: bigint[],
    unitId?: bigint,
  ): Promise<StockAggregate[]> {
    if (productIds?.length === 0) return [];
    const rows = await this.client.productStock.groupBy({
      by: ['productId'],
      where: {
        tenantId,
        ...(productIds === undefined ? {} : { productId: { in: productIds } }),
        ...(unitId === undefined ? {} : { businessUnitId: unitId }),
      },
      _sum: { quantity: true, minimumQuantity: true },
      _count: { _all: true },
    });
    return rows.map((row) => ({
      productId: row.productId,
      quantity: row._sum.quantity ?? 0,
      minimumQuantity: row._sum.minimumQuantity ?? 0,
      unitCount: row._count._all,
    }));
  }
  public product(tenantId: bigint, publicId: string) {
    return this.client.product.findFirst({
      where: { tenantId, publicId },
      include: { category: true },
    });
  }
  public productWithTenant(tenantId: bigint, publicId: string) {
    return this.client.product.findFirst({
      where: { tenantId, publicId },
      include: { category: true, tenant: { select: { publicId: true } } },
    });
  }
  public createProduct(data: Prisma.ProductUncheckedCreateInput) {
    return this.client.product.create({ data, include: { category: true } });
  }
  public updateProduct(id: bigint, data: Prisma.ProductUncheckedUpdateInput) {
    return this.client.product.update({ where: { id }, data, include: { category: true } });
  }
  public unit(tenantId: bigint, publicId: string) {
    return this.client.businessUnit.findFirst({ where: { tenantId, publicId } });
  }
  public units(tenantId: bigint) {
    return this.client.businessUnit.findMany({
      where: { tenantId, active: true },
      orderBy: { name: 'asc' },
    });
  }
  public stocks(tenantId: bigint, productId?: bigint, unitId?: bigint) {
    return this.client.productStock.findMany({
      where: {
        tenantId,
        ...(productId === undefined ? {} : { productId }),
        ...(unitId === undefined ? {} : { businessUnitId: unitId }),
      },
      include: { product: true, businessUnit: true },
      orderBy: { updatedAt: 'desc' },
    });
  }
  public productCosts(tenantId: bigint, active?: boolean) {
    return this.client.product.findMany({
      where: { tenantId, ...(active === undefined ? {} : { active }) },
      select: { id: true, active: true, costPriceCents: true },
    });
  }
  public upsertStock(data: {
    publicId: string;
    tenantId: bigint;
    productId: bigint;
    businessUnitId: bigint;
    quantity: number;
    minimumQuantity: number;
  }) {
    return this.client.productStock.upsert({
      where: {
        productId_businessUnitId: {
          productId: data.productId,
          businessUnitId: data.businessUnitId,
        },
      },
      create: data,
      update: { quantity: data.quantity, minimumQuantity: data.minimumQuantity },
      include: { product: true, businessUnit: true },
    });
  }
  /** Minimum-only write: never touches the balance, so it cannot race with movements. */
  public upsertMinimumQuantity(data: {
    publicId: string;
    tenantId: bigint;
    productId: bigint;
    businessUnitId: bigint;
    minimumQuantity: number;
  }) {
    return this.client.productStock.upsert({
      where: {
        productId_businessUnitId: {
          productId: data.productId,
          businessUnitId: data.businessUnitId,
        },
      },
      create: { ...data, quantity: 0 },
      update: { minimumQuantity: data.minimumQuantity },
      include: { product: true, businessUnit: true },
    });
  }
  public setMinimumQuantity(id: bigint, minimumQuantity: number) {
    return this.client.productStock.update({ where: { id }, data: { minimumQuantity } });
  }
  public async audit(data: Prisma.AuditLogUncheckedCreateInput) {
    await this.client.auditLog.create({ data });
  }
}
