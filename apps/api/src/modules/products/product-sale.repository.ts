import { randomUUID } from 'node:crypto';

import { Prisma, type PrismaClient } from '../../database-client/client.js';

interface Actor {
  userId: bigint;
  sessionId: bigint;
}
interface SaleInput {
  tenantId: bigint;
  unitId: bigint;
  customerId: bigint | null;
  professionalId: bigint | null;
  paymentMethodId: bigint;
  notes: string | null;
  actor: Actor;
  items: { productId: bigint; quantity: number }[];
}
const include = {
  unit: { select: { publicId: true } },
  customer: { select: { publicId: true } },
  professional: { select: { publicId: true } },
  paymentMethod: { select: { publicId: true } },
  items: {
    include: {
      product: { select: { publicId: true, name: true } },
      stockMovement: { select: { publicId: true } },
    },
  },
} as const;
export class ProductSaleRepository {
  public constructor(private readonly client: PrismaClient) {}
  public list(tenantId: bigint, where: Prisma.ProductSaleWhereInput) {
    return this.client.productSale.findMany({
      where: { tenantId, ...where },
      orderBy: { createdAt: 'desc' },
      include,
    });
  }
  public async create(input: SaleInput) {
    return this.client.$transaction(
      async (tx) => {
        const lockName = `product-sale:${input.tenantId.toString()}:${input.unitId.toString()}`;
        const lock = await tx.$queryRaw<
          { acquired: number | bigint | null }[]
        >`SELECT GET_LOCK(${lockName}, 5) AS acquired`;
        if (lock[0]?.acquired !== 1 && lock[0]?.acquired !== 1n) return null;
        try {
          const products = await tx.product.findMany({
            where: {
              tenantId: input.tenantId,
              id: { in: input.items.map((item) => item.productId) },
              active: true,
            },
          });
          if (products.length !== input.items.length) return 'PRODUCT_NOT_FOUND' as const;
          await tx.$queryRaw(
            Prisma.sql`SELECT id FROM product_stocks WHERE tenant_id = ${input.tenantId} AND business_unit_id = ${input.unitId} AND product_id IN (${Prisma.join(input.items.map((item) => item.productId))}) FOR UPDATE`,
          );
          const stocks = await tx.productStock.findMany({
            where: {
              tenantId: input.tenantId,
              businessUnitId: input.unitId,
              productId: { in: input.items.map((item) => item.productId) },
            },
          });
          if (
            stocks.length !== input.items.length ||
            input.items.some(
              (item) =>
                (stocks.find((stock) => stock.productId === item.productId)?.quantity ?? 0) <
                item.quantity,
            )
          )
            return 'INSUFFICIENT_STOCK' as const;
          const totalCents = input.items.reduce(
            (sum, item) =>
              sum +
              (products.find((product) => product.id === item.productId)?.salePriceCents ?? 0n) *
                BigInt(item.quantity),
            0n,
          );
          const sale = await tx.productSale.create({
            data: {
              publicId: randomUUID(),
              tenantId: input.tenantId,
              unitId: input.unitId,
              customerId: input.customerId,
              professionalId: input.professionalId,
              paymentMethodId: input.paymentMethodId,
              totalCents,
              notes: input.notes,
              userId: input.actor.userId,
              sessionId: input.actor.sessionId,
            },
          });
          for (const item of input.items) {
            const product = products.find((candidate) => candidate.id === item.productId);
            const stock = stocks.find((candidate) => candidate.productId === item.productId);
            if (product === undefined || stock === undefined)
              throw new Error('Produto ou saldo não encontrado durante a venda.');
            const resultingQuantity = stock.quantity - item.quantity;
            await tx.productStock.update({
              where: { id: stock.id },
              data: { quantity: resultingQuantity },
            });
            const movement = await tx.stockMovement.create({
              data: {
                publicId: randomUUID(),
                tenantId: input.tenantId,
                productId: product.id,
                businessUnitId: input.unitId,
                type: 'MANUAL_EXIT',
                quantity: item.quantity,
                previousQuantity: stock.quantity,
                resultingQuantity,
                reason: `Venda ${sale.publicId}`,
                performedByUserId: input.actor.userId,
              },
            });
            const itemTotal = product.salePriceCents * BigInt(item.quantity);
            const commission =
              product.commissionType === 'PERCENTAGE' && product.commissionValue !== null
                ? (itemTotal * BigInt(product.commissionValue)) / 100n
                : product.commissionType === 'FIXED' && product.commissionValue !== null
                  ? BigInt(product.commissionValue) * BigInt(item.quantity)
                  : 0n;
            await tx.productSaleItem.create({
              data: {
                publicId: randomUUID(),
                tenantId: input.tenantId,
                saleId: sale.id,
                productId: product.id,
                quantity: item.quantity,
                unitPriceCents: product.salePriceCents,
                totalCents: itemTotal,
                commissionType: product.commissionType,
                commissionValue: product.commissionValue,
                commissionAmountCents: input.professionalId === null ? 0n : commission,
                stockMovementId: movement.id,
              },
            });
          }
          const register = await tx.cashRegister.findFirst({
            where: { tenantId: input.tenantId, unitId: input.unitId, status: 'OPEN' },
          });
          if (register !== null) {
            const cash = await tx.cashMovement.create({
              data: {
                publicId: randomUUID(),
                tenantId: input.tenantId,
                cashRegisterId: register.id,
                type: 'PAYMENT',
                direction: 'IN',
                amountCents: totalCents,
                reason: `Venda de produtos ${sale.publicId}`,
                userId: input.actor.userId,
                sessionId: input.actor.sessionId,
              },
            });
            await tx.productSale.update({
              where: { id: sale.id },
              data: { cashMovementId: cash.id },
            });
          }
          await tx.auditLog.create({
            data: {
              publicId: randomUUID(),
              tenantId: input.tenantId,
              userId: input.actor.userId,
              sessionId: input.actor.sessionId,
              action: 'product_sale.created',
              targetType: 'product_sale',
              targetPublicId: sale.publicId,
            },
          });
          return await tx.productSale.findUniqueOrThrow({ where: { id: sale.id }, include });
        } finally {
          await tx.$queryRaw`SELECT RELEASE_LOCK(${lockName})`;
        }
      },
      { isolationLevel: 'Serializable', maxWait: 10_000, timeout: 20_000 },
    );
  }
}
