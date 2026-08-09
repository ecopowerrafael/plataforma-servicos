import { type Prisma, type PrismaClient } from '../../database-client/client.js';

export class ProductRepository {
  public constructor(private readonly client: PrismaClient) {}
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
  public products(tenantId: bigint) {
    return this.client.product.findMany({
      where: { tenantId },
      include: { category: true },
      orderBy: { name: 'asc' },
    });
  }
  public product(tenantId: bigint, publicId: string) {
    return this.client.product.findFirst({
      where: { tenantId, publicId },
      include: { category: true },
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
  public setMinimumQuantity(id: bigint, minimumQuantity: number) {
    return this.client.productStock.update({ where: { id }, data: { minimumQuantity } });
  }
  public async audit(data: Prisma.AuditLogUncheckedCreateInput) {
    await this.client.auditLog.create({ data });
  }
}
