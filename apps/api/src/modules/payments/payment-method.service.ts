import { randomUUID } from 'node:crypto';

import {
  PaymentMethodListResponseSchema,
  PaymentMethodPublicSchema,
  type CreatePaymentMethodRequest,
  type UpdatePaymentMethodRequest,
} from '@plataforma/shared';

import { Prisma, type PaymentMethod, type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';

const DEFAULT_METHODS: { name: string; type: PaymentMethod['type']; sortOrder: number }[] = [
  { name: 'Dinheiro', type: 'CASH', sortOrder: 0 },
  { name: 'Pix', type: 'PIX', sortOrder: 1 },
  { name: 'Cartão de débito', type: 'DEBIT_CARD', sortOrder: 2 },
  { name: 'Cartão de crédito', type: 'CREDIT_CARD', sortOrder: 3 },
];

const pub = (item: PaymentMethod) =>
  PaymentMethodPublicSchema.parse({
    publicId: item.publicId,
    name: item.name,
    type: item.type,
    sortOrder: item.sortOrder,
    active: item.active,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  });

export class PaymentMethodService {
  public constructor(private readonly client: PrismaClient) {}

  /**
   * Lista as formas de pagamento do tenant, provisionando um conjunto
   * padrão (dinheiro, pix, débito, crédito) na primeira consulta se o
   * tenant ainda não tiver nenhuma configurada — garante que o registro de
   * pagamentos nunca fique sem nenhuma forma disponível, sem exigir uma
   * etapa de configuração manual obrigatória antes do primeiro uso.
   */
  public async list(tenantId: bigint) {
    let items = await this.client.paymentMethod.findMany({
      where: { tenantId },
      orderBy: { sortOrder: 'asc' },
    });
    if (items.length === 0) {
      await this.client.paymentMethod
        .createMany({
          data: DEFAULT_METHODS.map((method) => ({
            publicId: randomUUID(),
            tenantId,
            name: method.name,
            type: method.type,
            sortOrder: method.sortOrder,
            active: true,
          })),
        })
        .catch((error: unknown) => {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
            return;
          throw error;
        });
      items = await this.client.paymentMethod.findMany({
        where: { tenantId },
        orderBy: { sortOrder: 'asc' },
      });
    }
    return PaymentMethodListResponseSchema.parse({ items: items.map(pub) });
  }

  public async create(tenantId: bigint, input: CreatePaymentMethodRequest) {
    try {
      const created = await this.client.paymentMethod.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: input.name,
          type: input.type,
          sortOrder: input.sortOrder,
          active: input.active,
        },
      });
      return pub(created);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new AppError({
          code: 'PAYMENT_METHOD_NAME_CONFLICT',
          message: 'Já existe uma forma de pagamento com este nome.',
          statusCode: 409,
        });
      throw error;
    }
  }

  public async update(tenantId: bigint, publicId: string, input: UpdatePaymentMethodRequest) {
    const existing = await this.client.paymentMethod.findFirst({
      where: { tenantId, publicId },
      select: { id: true },
    });
    if (existing === null)
      throw new AppError({
        code: 'PAYMENT_METHOD_NOT_FOUND',
        message: 'Forma de pagamento não encontrada.',
        statusCode: 404,
      });
    try {
      const updated = await this.client.paymentMethod.update({
        where: { id: existing.id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.type === undefined ? {} : { type: input.type }),
          ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
          ...(input.active === undefined ? {} : { active: input.active }),
        },
      });
      return pub(updated);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new AppError({
          code: 'PAYMENT_METHOD_NAME_CONFLICT',
          message: 'Já existe uma forma de pagamento com este nome.',
          statusCode: 409,
        });
      throw error;
    }
  }
}
