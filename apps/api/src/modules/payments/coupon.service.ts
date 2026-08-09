import { randomUUID } from 'node:crypto';

import {
  CouponListResponseSchema,
  CouponPublicSchema,
  CouponRedemptionListResponseSchema,
  CouponRedemptionPublicSchema,
  type CreateCouponRequest,
  type UpdateCouponRequest,
} from '@plataforma/shared';

import { type Coupon, type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';

interface Actor {
  userId: bigint | null;
  sessionId: bigint | null;
}

const pubCoupon = (coupon: Coupon, usageCount: number) =>
  CouponPublicSchema.parse({
    publicId: coupon.publicId,
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    active: coupon.active,
    validFrom: coupon.validFrom?.toISOString() ?? null,
    validUntil: coupon.validUntil?.toISOString() ?? null,
    maxUses: coupon.maxUses,
    maxUsesPerCustomer: coupon.maxUsesPerCustomer,
    usageCount,
    createdAt: coupon.createdAt.toISOString(),
    updatedAt: coupon.updatedAt.toISOString(),
  });

const pubRedemption = (redemption: {
  publicId: string;
  discountAmountCents: bigint;
  canceledAt: Date | null;
  canceledReason: string | null;
  createdAt: Date;
  coupon: { code: string };
  appointment: { publicId: string };
}) =>
  CouponRedemptionPublicSchema.parse({
    publicId: redemption.publicId,
    couponCode: redemption.coupon.code,
    appointmentPublicId: redemption.appointment.publicId,
    discountAmountCents: redemption.discountAmountCents.toString(),
    canceledAt: redemption.canceledAt?.toISOString() ?? null,
    canceledReason: redemption.canceledReason,
    createdAt: redemption.createdAt.toISOString(),
  });

export class CouponService {
  public constructor(private readonly client: PrismaClient) {}

  public async list(tenantId: bigint) {
    const coupons = await this.client.coupon.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { redemptions: { where: { canceledAt: null } } } } },
    });
    return CouponListResponseSchema.parse({
      items: coupons.map((coupon) => pubCoupon(coupon, coupon._count.redemptions)),
    });
  }

  public async create(tenantId: bigint, input: CreateCouponRequest, actor: Actor) {
    const existing = await this.client.coupon.findFirst({
      where: { tenantId, code: input.code },
      select: { id: true },
    });
    if (existing !== null)
      throw new AppError({
        code: 'COUPON_CODE_CONFLICT',
        message: 'Já existe um cupom com este código.',
        statusCode: 409,
      });

    const coupon = await this.client.coupon.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        code: input.code,
        discountType: input.discountType,
        discountValue: input.discountValue,
        active: input.active,
        validFrom: input.validFrom === undefined ? null : (input.validFrom ?? null),
        validUntil: input.validUntil === undefined ? null : (input.validUntil ?? null),
        maxUses: input.maxUses === undefined ? null : input.maxUses,
        maxUsesPerCustomer:
          input.maxUsesPerCustomer === undefined ? null : input.maxUsesPerCustomer,
      },
    });
    await this.client.auditLog.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        userId: actor.userId,
        sessionId: actor.sessionId,
        action: 'coupon.created',
        targetType: 'coupon',
        targetPublicId: coupon.publicId,
      },
    });
    return pubCoupon(coupon, 0);
  }

  public async update(
    tenantId: bigint,
    couponPublicId: string,
    input: UpdateCouponRequest,
    actor: Actor,
  ) {
    const existing = await this.client.coupon.findFirst({
      where: { tenantId, publicId: couponPublicId },
    });
    if (existing === null) throw this.couponNotFound();

    const coupon = await this.client.coupon.update({
      where: { id: existing.id },
      data: {
        discountType: input.discountType,
        discountValue: input.discountValue,
        active: input.active,
        validFrom: input.validFrom === undefined ? null : (input.validFrom ?? null),
        validUntil: input.validUntil === undefined ? null : (input.validUntil ?? null),
        maxUses: input.maxUses === undefined ? null : input.maxUses,
        maxUsesPerCustomer:
          input.maxUsesPerCustomer === undefined ? null : input.maxUsesPerCustomer,
      },
    });
    const usageCount = await this.client.couponRedemption.count({
      where: { couponId: coupon.id, canceledAt: null },
    });
    await this.client.auditLog.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        userId: actor.userId,
        sessionId: actor.sessionId,
        action: 'coupon.updated',
        targetType: 'coupon',
        targetPublicId: coupon.publicId,
      },
    });
    return pubCoupon(coupon, usageCount);
  }

  /**
   * Aplica um cupom a um agendamento, reduzindo o saldo em aberto — nenhum movimento
   * financeiro é criado (nenhum Payment, nenhum CashMovement); PaymentService.listForAppointment()
   * já subtrai o total de descontos ativos do preço ao calcular balanceCents, então o desconto
   * se reflete automaticamente em todo o fluxo de pagamento já existente.
   */
  public async redeem(tenantId: bigint, appointmentPublicId: string, code: string, actor: Actor) {
    const appointment = await this.client.appointment.findFirst({
      where: { tenantId, publicId: appointmentPublicId },
      select: { id: true, publicId: true, customerId: true, priceCents: true, status: true },
    });
    if (appointment === null)
      throw new AppError({
        code: 'APPOINTMENT_NOT_FOUND',
        message: 'Agendamento não encontrado.',
        statusCode: 404,
      });
    if (appointment.status === 'CANCELED')
      throw new AppError({
        code: 'COUPON_NOT_ALLOWED_FOR_CANCELED_APPOINTMENT',
        message: 'Não é possível aplicar cupom a um agendamento cancelado.',
        statusCode: 409,
      });

    const coupon = await this.client.coupon.findFirst({ where: { tenantId, code } });
    if (!coupon?.active)
      throw new AppError({
        code: 'COUPON_NOT_FOUND',
        message: 'Cupom não encontrado ou inativo.',
        statusCode: 404,
      });

    const now = new Date();
    if (coupon.validFrom !== null && now < coupon.validFrom)
      throw new AppError({
        code: 'COUPON_NOT_YET_VALID',
        message: 'Este cupom ainda não está válido.',
        statusCode: 409,
      });
    if (coupon.validUntil !== null && now > coupon.validUntil)
      throw new AppError({
        code: 'COUPON_EXPIRED',
        message: 'Este cupom expirou.',
        statusCode: 409,
      });

    const existingRedemption = await this.client.couponRedemption.findFirst({
      where: { couponId: coupon.id, appointmentId: appointment.id },
    });
    if (existingRedemption !== null)
      throw new AppError({
        code: 'COUPON_ALREADY_REDEEMED_FOR_APPOINTMENT',
        message: 'Este cupom já foi aplicado a este agendamento.',
        statusCode: 409,
      });

    if (coupon.maxUses !== null) {
      const totalUses = await this.client.couponRedemption.count({
        where: { couponId: coupon.id, canceledAt: null },
      });
      if (totalUses >= coupon.maxUses)
        throw new AppError({
          code: 'COUPON_USAGE_LIMIT_REACHED',
          message: 'Este cupom atingiu o limite máximo de usos.',
          statusCode: 409,
        });
    }
    if (coupon.maxUsesPerCustomer !== null) {
      const customerUses = await this.client.couponRedemption.count({
        where: {
          couponId: coupon.id,
          customerId: appointment.customerId,
          canceledAt: null,
        },
      });
      if (customerUses >= coupon.maxUsesPerCustomer)
        throw new AppError({
          code: 'COUPON_CUSTOMER_USAGE_LIMIT_REACHED',
          message: 'Este cliente já atingiu o limite de uso deste cupom.',
          statusCode: 409,
        });
    }

    const currentDiscount = await this.discountForAppointment(tenantId, appointment.id);
    const remainingCents = appointment.priceCents - currentDiscount;
    if (remainingCents <= 0n)
      throw new AppError({
        code: 'COUPON_NO_BALANCE_TO_DISCOUNT',
        message: 'O agendamento não possui saldo para aplicar desconto.',
        statusCode: 409,
      });

    const discountAmountCents =
      coupon.discountType === 'FIXED'
        ? BigInt(coupon.discountValue) > remainingCents
          ? remainingCents
          : BigInt(coupon.discountValue)
        : (remainingCents * BigInt(coupon.discountValue)) / 100n;

    const redemption = await this.client.couponRedemption.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        couponId: coupon.id,
        appointmentId: appointment.id,
        customerId: appointment.customerId,
        discountAmountCents,
      },
      include: {
        coupon: { select: { code: true } },
        appointment: { select: { publicId: true } },
      },
    });
    await this.client.auditLog.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        userId: actor.userId,
        sessionId: actor.sessionId,
        action: 'coupon.redeemed',
        targetType: 'coupon_redemption',
        targetPublicId: redemption.publicId,
      },
    });
    return pubRedemption(redemption);
  }

  public async cancelRedemption(
    tenantId: bigint,
    appointmentPublicId: string,
    redemptionPublicId: string,
    reason: string,
    actor: Actor,
  ) {
    const redemption = await this.client.couponRedemption.findFirst({
      where: {
        tenantId,
        publicId: redemptionPublicId,
        appointment: { publicId: appointmentPublicId },
      },
      include: {
        coupon: { select: { code: true } },
        appointment: { select: { publicId: true } },
      },
    });
    if (redemption === null)
      throw new AppError({
        code: 'COUPON_REDEMPTION_NOT_FOUND',
        message: 'Aplicação de cupom não encontrada.',
        statusCode: 404,
      });
    if (redemption.canceledAt !== null)
      throw new AppError({
        code: 'COUPON_REDEMPTION_ALREADY_CANCELED',
        message: 'Esta aplicação de cupom já foi cancelada.',
        statusCode: 409,
      });

    const updated = await this.client.couponRedemption.update({
      where: { id: redemption.id },
      data: { canceledAt: new Date(), canceledReason: reason },
      include: {
        coupon: { select: { code: true } },
        appointment: { select: { publicId: true } },
      },
    });
    await this.client.auditLog.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        userId: actor.userId,
        sessionId: actor.sessionId,
        action: 'coupon.redemption_canceled',
        targetType: 'coupon_redemption',
        targetPublicId: updated.publicId,
      },
    });
    return pubRedemption(updated);
  }

  public async listRedemptions(tenantId: bigint, appointmentPublicId: string) {
    const items = await this.client.couponRedemption.findMany({
      where: { tenantId, appointment: { publicId: appointmentPublicId } },
      orderBy: { createdAt: 'desc' },
      include: {
        coupon: { select: { code: true } },
        appointment: { select: { publicId: true } },
      },
    });
    return CouponRedemptionListResponseSchema.parse({ items: items.map(pubRedemption) });
  }

  /** Soma dos descontos ativos (não cancelados) de um agendamento — usado por PaymentService. */
  public async discountForAppointment(tenantId: bigint, appointmentId: bigint): Promise<bigint> {
    const result = await this.client.couponRedemption.aggregate({
      where: { tenantId, appointmentId, canceledAt: null },
      _sum: { discountAmountCents: true },
    });
    return result._sum.discountAmountCents ?? 0n;
  }

  private couponNotFound() {
    return new AppError({
      code: 'COUPON_NOT_FOUND',
      message: 'Cupom não encontrado.',
      statusCode: 404,
    });
  }
}
