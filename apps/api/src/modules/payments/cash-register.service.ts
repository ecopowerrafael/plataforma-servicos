import { randomUUID } from 'node:crypto';

import {
  CashRegisterDetailResponseSchema,
  CashRegisterListResponseSchema,
  CashRegisterPublicSchema,
  type CloseCashRegisterRequest,
  type CreateCashMovementRequest,
  type OpenCashRegisterRequest,
} from '@plataforma/shared';

import {
  type CashMovement,
  type CashRegister,
  type PrismaClient,
} from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';

interface Actor {
  userId: bigint | null;
  sessionId: bigint | null;
}

type RegisterWithUnit = CashRegister & {
  unit: { publicId: string } | null;
  openedByUser?: { email: string } | null;
  closedByUser?: { email: string } | null;
};

type MovementWithContext = CashMovement & {
  payment: {
    publicId: string;
    paymentMethod: { name: string };
    appointment: {
      publicId: string;
      customer: { name: string };
      service: { name: string };
    };
  } | null;
  user?: { email: string } | null;
};

/** Include unico do caixa: responsavel e contexto do pagamento sem consulta extra. */
const registerInclude = {
  unit: { select: { publicId: true } },
  openedByUser: { select: { email: true } },
  closedByUser: { select: { email: true } },
} as const;

const movementInclude = {
  user: { select: { email: true } },
  payment: {
    select: {
      publicId: true,
      paymentMethod: { select: { name: true } },
      appointment: {
        select: {
          publicId: true,
          customer: { select: { name: true } },
          service: { select: { name: true } },
        },
      },
    },
  },
} as const;

function balanceOf(register: CashRegister, movements: CashMovement[]): bigint {
  return movements.reduce(
    (total, movement) =>
      movement.direction === 'IN' ? total + movement.amountCents : total - movement.amountCents,
    register.openingBalanceCents,
  );
}

const pubRegister = (
  register: RegisterWithUnit,
  balanceCents: bigint,
  movements: CashMovement[] = [],
) =>
  CashRegisterPublicSchema.parse({
    openedByEmail: register.openedByUser?.email ?? null,
    closedByEmail: register.closedByUser?.email ?? null,
    totalInCents: movements
      .filter((item) => item.direction === 'IN')
      .reduce((total, item) => total + item.amountCents, 0n)
      .toString(),
    totalOutCents: movements
      .filter((item) => item.direction === 'OUT')
      .reduce((total, item) => total + item.amountCents, 0n)
      .toString(),
    // Parte das entradas que apenas reflete pagamentos: nao e receita extra do caixa.
    paymentInCents: movements
      .filter((item) => item.direction === 'IN' && item.type === 'PAYMENT')
      .reduce((total, item) => total + item.amountCents, 0n)
      .toString(),
    publicId: register.publicId,
    unitPublicId: register.unit?.publicId ?? null,
    status: register.status,
    openingBalanceCents: register.openingBalanceCents.toString(),
    closingBalanceCents: register.closingBalanceCents?.toString() ?? null,
    balanceCents: balanceCents.toString(),
    openedAt: register.openedAt.toISOString(),
    closedAt: register.closedAt?.toISOString() ?? null,
    notes: register.notes,
  });

const pubMovement = (movement: MovementWithContext) =>
  ({
    publicId: movement.publicId,
    type: movement.type,
    direction: movement.direction,
    amountCents: movement.amountCents.toString(),
    reason: movement.reason,
    paymentPublicId: movement.payment?.publicId ?? null,
    createdAt: movement.createdAt.toISOString(),
    userEmail: movement.user?.email ?? null,
    paymentMethodName: movement.payment?.paymentMethod.name ?? null,
    customerName: movement.payment?.appointment.customer.name ?? null,
    serviceName: movement.payment?.appointment.service.name ?? null,
    appointmentPublicId: movement.payment?.appointment.publicId ?? null,
  }) as const;

export class CashRegisterService {
  public constructor(private readonly client: PrismaClient) {}

  private async resolveUnitId(
    tenantId: bigint,
    unitPublicId: string | null | undefined,
  ): Promise<bigint | null> {
    if (unitPublicId === undefined || unitPublicId === null) return null;
    const unit = await this.client.businessUnit.findFirst({
      where: { tenantId, publicId: unitPublicId },
      select: { id: true },
    });
    if (unit === null)
      throw new AppError({
        code: 'BUSINESS_UNIT_NOT_FOUND',
        message: 'Unidade não encontrada.',
        statusCode: 404,
      });
    return unit.id;
  }

  public async open(tenantId: bigint, input: OpenCashRegisterRequest, actor: Actor) {
    const unitId = await this.resolveUnitId(tenantId, input.unitPublicId);
    const existing = await this.client.cashRegister.findFirst({
      where: { tenantId, unitId, status: 'OPEN' },
      select: { id: true },
    });
    if (existing !== null)
      throw new AppError({
        code: 'CASH_REGISTER_ALREADY_OPEN',
        message: 'Já existe um caixa aberto para esta unidade.',
        statusCode: 409,
      });

    const register = await this.client.cashRegister.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        unitId,
        openingBalanceCents: BigInt(input.openingBalanceCents),
        openedByUserId: actor.userId,
        openedBySessionId: actor.sessionId,
      },
      include: registerInclude,
    });
    await this.client.auditLog.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        userId: actor.userId,
        sessionId: actor.sessionId,
        action: 'cash_register.opened',
        targetType: 'cash_register',
        targetPublicId: register.publicId,
      },
    });
    return pubRegister(register, register.openingBalanceCents);
  }

  public async close(
    tenantId: bigint,
    registerPublicId: string,
    input: CloseCashRegisterRequest,
    actor: Actor,
  ) {
    const register = await this.findRegisterOrThrow(tenantId, registerPublicId);
    if (register.status !== 'OPEN')
      throw new AppError({
        code: 'CASH_REGISTER_NOT_OPEN',
        message: 'Este caixa já está fechado.',
        statusCode: 409,
      });

    const movements = await this.client.cashMovement.findMany({
      where: { tenantId, cashRegisterId: register.id },
    });
    const closingBalanceCents = balanceOf(register, movements);

    const updated = await this.client.cashRegister.update({
      where: { id: register.id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closingBalanceCents,
        closedByUserId: actor.userId,
        closedBySessionId: actor.sessionId,
        notes: input.notes ?? register.notes,
      },
      include: registerInclude,
    });
    await this.client.auditLog.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        userId: actor.userId,
        sessionId: actor.sessionId,
        action: 'cash_register.closed',
        targetType: 'cash_register',
        targetPublicId: updated.publicId,
      },
    });
    return pubRegister(updated, closingBalanceCents);
  }

  public async addMovement(
    tenantId: bigint,
    registerPublicId: string,
    input: CreateCashMovementRequest,
    actor: Actor,
  ) {
    const register = await this.findRegisterOrThrow(tenantId, registerPublicId);
    if (register.status !== 'OPEN')
      throw new AppError({
        code: 'CASH_REGISTER_NOT_OPEN',
        message: 'Não é possível registrar movimentações em um caixa fechado.',
        statusCode: 409,
      });

    const amountCents = BigInt(input.amountCents);
    if (amountCents <= 0n)
      throw new AppError({
        code: 'CASH_MOVEMENT_AMOUNT_INVALID',
        message: 'O valor da movimentação deve ser maior que zero.',
        statusCode: 400,
      });

    const movement = await this.client.cashMovement.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        cashRegisterId: register.id,
        type: 'MANUAL',
        direction: input.direction,
        amountCents,
        reason: input.reason,
        userId: actor.userId,
        sessionId: actor.sessionId,
      },
      include: movementInclude,
    });
    await this.client.auditLog.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        userId: actor.userId,
        sessionId: actor.sessionId,
        action:
          input.direction === 'IN'
            ? 'cash_register.movement.manual_in'
            : 'cash_register.movement.manual_out',
        targetType: 'cash_movement',
        targetPublicId: movement.publicId,
      },
    });
    return pubMovement(movement);
  }

  public async get(tenantId: bigint, registerPublicId: string) {
    const register = await this.findRegisterOrThrow(tenantId, registerPublicId);
    const movements = await this.client.cashMovement.findMany({
      where: { tenantId, cashRegisterId: register.id },
      orderBy: { createdAt: 'desc' },
      include: movementInclude,
    });
    const balanceCents = balanceOf(register, movements);
    return CashRegisterDetailResponseSchema.parse({
      register: pubRegister(
        register,
        register.status === 'CLOSED' && register.closingBalanceCents !== null
          ? register.closingBalanceCents
          : balanceCents,
        movements,
      ),
      movements: movements.map(pubMovement),
    });
  }

  public async getOpen(tenantId: bigint, unitPublicId: string | null | undefined) {
    const unitId = await this.resolveUnitId(tenantId, unitPublicId);
    const register = await this.client.cashRegister.findFirst({
      where: { tenantId, unitId, status: 'OPEN' },
      include: registerInclude,
    });
    if (register === null) return null;
    const movements = await this.client.cashMovement.findMany({
      where: { tenantId, cashRegisterId: register.id },
      orderBy: { createdAt: 'desc' },
      include: movementInclude,
    });
    return CashRegisterDetailResponseSchema.parse({
      register: pubRegister(register, balanceOf(register, movements), movements),
      movements: movements.map(pubMovement),
    });
  }

  public async list(tenantId: bigint) {
    const registers = await this.client.cashRegister.findMany({
      where: { tenantId },
      orderBy: { openedAt: 'desc' },
      include: registerInclude,
    });
    const items = await Promise.all(
      registers.map(async (register) => {
        if (register.status === 'CLOSED' && register.closingBalanceCents !== null)
          return pubRegister(register, register.closingBalanceCents);
        const movements = await this.client.cashMovement.findMany({
          where: { tenantId, cashRegisterId: register.id },
        });
        return pubRegister(register, balanceOf(register, movements), movements);
      }),
    );
    return CashRegisterListResponseSchema.parse({ items });
  }

  /** Reflete um pagamento real de agendamento no caixa aberto correspondente, quando houver. */
  public async recordPayment(
    tenantId: bigint,
    unitId: bigint | null,
    payment: { id: bigint; amountCents: bigint },
    actor: Actor,
  ) {
    const register = await this.client.cashRegister.findFirst({
      where: { tenantId, unitId, status: 'OPEN' },
      select: { id: true },
    });
    if (register === null) return;
    await this.client.cashMovement.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        cashRegisterId: register.id,
        type: 'PAYMENT',
        direction: 'IN',
        amountCents: payment.amountCents,
        paymentId: payment.id,
        userId: actor.userId,
        sessionId: actor.sessionId,
      },
    });
  }

  /** Estorna, no caixa (se ainda aberto), um pagamento cancelado que havia sido refletido nele. */
  public async reversePayment(tenantId: bigint, paymentId: bigint, actor: Actor) {
    const movement = await this.client.cashMovement.findFirst({
      where: { tenantId, paymentId },
      include: { cashRegister: { select: { id: true, status: true } } },
    });
    if (movement?.cashRegister.status !== 'OPEN') return;
    await this.client.cashMovement.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        cashRegisterId: movement.cashRegister.id,
        type: 'PAYMENT',
        direction: 'OUT',
        amountCents: movement.amountCents,
        reason: 'Estorno de pagamento cancelado.',
        userId: actor.userId,
        sessionId: actor.sessionId,
      },
    });
  }

  private async findRegisterOrThrow(tenantId: bigint, registerPublicId: string) {
    const register = await this.client.cashRegister.findFirst({
      where: { tenantId, publicId: registerPublicId },
      include: registerInclude,
    });
    if (register === null)
      throw new AppError({
        code: 'CASH_REGISTER_NOT_FOUND',
        message: 'Caixa não encontrado.',
        statusCode: 404,
      });
    return register;
  }
}
