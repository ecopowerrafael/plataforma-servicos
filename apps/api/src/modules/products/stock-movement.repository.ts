import { randomUUID } from 'node:crypto';

import { Prisma, type PrismaClient, type StockMovementType } from '../../database-client/client.js';

export class InsufficientStockError extends Error {}

interface Actor {
  userId: bigint;
  sessionId: bigint;
}
interface MovementInput {
  tenantId: bigint;
  productId: bigint;
  unitId: bigint;
  type: StockMovementType;
  quantity: number;
  reason: string | null;
  actor: Actor;
}

const movementInclude = {
  product: { select: { publicId: true, name: true } },
  businessUnit: { select: { publicId: true, name: true } },
  relatedBusinessUnit: { select: { publicId: true, name: true } },
  performedByUser: { select: { publicId: true, name: true } },
  saleItem: {
    select: {
      sale: { select: { publicId: true, customer: { select: { name: true } } } },
    },
  },
} as const;

export interface StockMovementFilter {
  productId?: bigint | undefined;
  unitId?: bigint | undefined;
  type?: StockMovementType | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
}

export class StockMovementRepository {
  public constructor(private readonly client: PrismaClient) {}

  private where(tenantId: bigint, filter: StockMovementFilter): Prisma.StockMovementWhereInput {
    return {
      tenantId,
      ...(filter.productId === undefined ? {} : { productId: filter.productId }),
      ...(filter.unitId === undefined ? {} : { businessUnitId: filter.unitId }),
      ...(filter.type === undefined ? {} : { type: filter.type }),
      ...(filter.from === undefined && filter.to === undefined
        ? {}
        : {
            createdAt: {
              ...(filter.from === undefined ? {} : { gte: filter.from }),
              ...(filter.to === undefined ? {} : { lte: filter.to }),
            },
          }),
    };
  }

  public async list(
    tenantId: bigint,
    filter: StockMovementFilter,
    page: number,
    limit: number,
  ) {
    const where = this.where(tenantId, filter);
    const [total, items] = await Promise.all([
      this.client.stockMovement.count({ where }),
      this.client.stockMovement.findMany({
        where,
        include: movementInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { total, items };
  }

  public move(input: MovementInput) {
    return this.client.$transaction(
      async (tx) => {
        const stock = await this.lockStock(tx, input.tenantId, input.productId, input.unitId);
        const increases = input.type === 'ENTRY' || input.type === 'POSITIVE_ADJUSTMENT';
        const resultingQuantity = increases
          ? stock.quantity + input.quantity
          : stock.quantity - input.quantity;
        if (resultingQuantity < 0) throw new InsufficientStockError();
        await tx.productStock.update({
          where: { id: stock.id },
          data: { quantity: resultingQuantity },
        });
        const movement = await tx.stockMovement.create({
          data: {
            publicId: randomUUID(),
            tenantId: input.tenantId,
            productId: input.productId,
            businessUnitId: input.unitId,
            type: input.type,
            quantity: input.quantity,
            previousQuantity: stock.quantity,
            resultingQuantity,
            reason: input.reason,
            performedByUserId: input.actor.userId,
          },
          include: movementInclude,
        });
        await this.audit(
          tx,
          input.tenantId,
          movement.publicId,
          'stock.movement.created',
          input.actor,
        );
        return movement;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  public transfer(
    input: Omit<MovementInput, 'unitId' | 'type'> & {
      sourceUnitId: bigint;
      destinationUnitId: bigint;
    },
  ) {
    return this.client.$transaction(
      async (tx) => {
        await this.ensureStock(tx, input.tenantId, input.productId, input.sourceUnitId);
        await this.ensureStock(tx, input.tenantId, input.productId, input.destinationUnitId);
        const ordered = [input.sourceUnitId, input.destinationUnitId].sort((a, b) =>
          a < b ? -1 : 1,
        );
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM product_stocks WHERE product_id = ${input.productId} AND business_unit_id IN (${Prisma.join(ordered)}) FOR UPDATE`,
        );
        const stocks = await tx.productStock.findMany({
          where: { productId: input.productId, businessUnitId: { in: ordered } },
        });
        const source = stocks.find((stock) => stock.businessUnitId === input.sourceUnitId);
        const destination = stocks.find(
          (stock) => stock.businessUnitId === input.destinationUnitId,
        );
        if (!source || !destination)
          throw new Error('Falha ao bloquear os saldos da transferência.');
        if (source.quantity < input.quantity) throw new InsufficientStockError();
        const transferPublicId = randomUUID();
        const sourceResult = source.quantity - input.quantity;
        const destinationResult = destination.quantity + input.quantity;
        await tx.productStock.update({
          where: { id: source.id },
          data: { quantity: sourceResult },
        });
        await tx.productStock.update({
          where: { id: destination.id },
          data: { quantity: destinationResult },
        });
        const out = await tx.stockMovement.create({
          data: {
            publicId: randomUUID(),
            transferPublicId,
            tenantId: input.tenantId,
            productId: input.productId,
            businessUnitId: input.sourceUnitId,
            relatedBusinessUnitId: input.destinationUnitId,
            type: 'TRANSFER_OUT',
            quantity: input.quantity,
            previousQuantity: source.quantity,
            resultingQuantity: sourceResult,
            reason: input.reason,
            performedByUserId: input.actor.userId,
          },
          include: movementInclude,
        });
        const incoming = await tx.stockMovement.create({
          data: {
            publicId: randomUUID(),
            transferPublicId,
            tenantId: input.tenantId,
            productId: input.productId,
            businessUnitId: input.destinationUnitId,
            relatedBusinessUnitId: input.sourceUnitId,
            type: 'TRANSFER_IN',
            quantity: input.quantity,
            previousQuantity: destination.quantity,
            resultingQuantity: destinationResult,
            reason: input.reason,
            performedByUserId: input.actor.userId,
          },
          include: movementInclude,
        });
        await this.audit(
          tx,
          input.tenantId,
          transferPublicId,
          'stock.transfer.created',
          input.actor,
        );
        return { transferPublicId, movements: [out, incoming] as const };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async ensureStock(
    tx: Prisma.TransactionClient,
    tenantId: bigint,
    productId: bigint,
    unitId: bigint,
  ) {
    await tx.productStock.upsert({
      where: { productId_businessUnitId: { productId, businessUnitId: unitId } },
      create: {
        publicId: randomUUID(),
        tenantId,
        productId,
        businessUnitId: unitId,
        quantity: 0,
        minimumQuantity: 0,
      },
      update: {},
    });
  }
  private async lockStock(
    tx: Prisma.TransactionClient,
    tenantId: bigint,
    productId: bigint,
    unitId: bigint,
  ) {
    await this.ensureStock(tx, tenantId, productId, unitId);
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM product_stocks WHERE product_id = ${productId} AND business_unit_id = ${unitId} FOR UPDATE`,
    );
    const stock = await tx.productStock.findUnique({
      where: { productId_businessUnitId: { productId, businessUnitId: unitId } },
    });
    if (!stock) throw new Error('Falha ao bloquear o saldo de estoque.');
    return stock;
  }
  private async audit(
    tx: Prisma.TransactionClient,
    tenantId: bigint,
    targetPublicId: string,
    action: string,
    actor: Actor,
  ) {
    await tx.auditLog.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        userId: actor.userId,
        sessionId: actor.sessionId,
        action,
        targetType: 'stock_movement',
        targetPublicId,
      },
    });
  }
}
