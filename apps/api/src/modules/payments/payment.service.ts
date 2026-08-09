import { randomUUID } from 'node:crypto';

import {
  AppointmentPaymentsResponseSchema,
  PaymentPublicSchema,
  type CreatePaymentRequest,
} from '@plataforma/shared';

import { type CashRegisterService } from './cash-register.service.js';
import { type ProfessionalCommissionService } from './professional-commission.service.js';
import { type Payment, type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';

interface Actor {
  userId: bigint | null;
  sessionId: bigint | null;
}

type PaymentWithMethod = Payment & { paymentMethod: { publicId: string; name: string } };

const pub = (payment: PaymentWithMethod, appointmentPublicId: string) =>
  PaymentPublicSchema.parse({
    publicId: payment.publicId,
    appointmentPublicId,
    paymentMethodPublicId: payment.paymentMethod.publicId,
    paymentMethodName: payment.paymentMethod.name,
    kind: payment.kind,
    status: payment.status,
    amountCents: payment.amountCents.toString(),
    notes: payment.notes,
    canceledAt: payment.canceledAt?.toISOString() ?? null,
    canceledReason: payment.canceledReason,
    createdAt: payment.createdAt.toISOString(),
  });

export class PaymentService {
  public constructor(
    private readonly client: PrismaClient,
    private readonly cashRegisters?: CashRegisterService,
    private readonly commissions?: ProfessionalCommissionService,
  ) {}

  public async create(
    tenantId: bigint,
    appointmentPublicId: string,
    input: CreatePaymentRequest,
    actor: Actor,
  ) {
    const appointment = await this.client.appointment.findFirst({
      where: { tenantId, publicId: appointmentPublicId },
      select: {
        id: true,
        priceCents: true,
        status: true,
        unitId: true,
        professionalId: true,
        serviceId: true,
      },
    });
    if (appointment === null) throw this.appointmentNotFound();
    if (appointment.status === 'CANCELED')
      throw new AppError({
        code: 'PAYMENT_NOT_ALLOWED_FOR_CANCELED_APPOINTMENT',
        message: 'Não é possível registrar pagamento para um agendamento cancelado.',
        statusCode: 409,
      });

    const paymentMethod = await this.client.paymentMethod.findFirst({
      where: { tenantId, publicId: input.paymentMethodPublicId },
      select: { id: true, active: true },
    });
    if (paymentMethod === null)
      throw new AppError({
        code: 'PAYMENT_METHOD_NOT_FOUND',
        message: 'Forma de pagamento não encontrada.',
        statusCode: 404,
      });
    if (!paymentMethod.active)
      throw new AppError({
        code: 'PAYMENT_METHOD_INACTIVE',
        message: 'Esta forma de pagamento está inativa.',
        statusCode: 409,
      });

    const amountCents = BigInt(input.amountCents);
    if (amountCents <= 0n)
      throw new AppError({
        code: 'PAYMENT_AMOUNT_INVALID',
        message: 'O valor do pagamento deve ser maior que zero.',
        statusCode: 400,
      });

    const paid = await this.client.payment.aggregate({
      where: { tenantId, appointmentId: appointment.id, status: 'PAID' },
      _sum: { amountCents: true },
    });
    const totalPaid = paid._sum.amountCents ?? 0n;
    if (totalPaid + amountCents > appointment.priceCents)
      throw new AppError({
        code: 'PAYMENT_EXCEEDS_APPOINTMENT_PRICE',
        message: 'O valor informado excede o saldo em aberto do agendamento.',
        statusCode: 400,
      });

    const payment = await this.client.payment.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        appointmentId: appointment.id,
        paymentMethodId: paymentMethod.id,
        kind: input.kind,
        amountCents,
        notes: input.notes ?? null,
        userId: actor.userId,
        sessionId: actor.sessionId,
      },
      include: { paymentMethod: { select: { publicId: true, name: true } } },
    });
    await this.client.auditLog.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        userId: actor.userId,
        sessionId: actor.sessionId,
        action: input.kind === 'DEPOSIT' ? 'payment.deposit_registered' : 'payment.registered',
        targetType: 'payment',
        targetPublicId: payment.publicId,
      },
    });
    await this.cashRegisters?.recordPayment(
      tenantId,
      appointment.unitId,
      { id: payment.id, amountCents: payment.amountCents },
      actor,
    );
    await this.commissions?.recordForPayment(
      tenantId,
      { id: payment.id, amountCents: payment.amountCents },
      {
        id: appointment.id,
        professionalId: appointment.professionalId,
        serviceId: appointment.serviceId,
      },
      actor,
    );
    return pub(payment, appointmentPublicId);
  }

  public async cancel(
    tenantId: bigint,
    appointmentPublicId: string,
    paymentPublicId: string,
    reason: string,
    actor: Actor,
  ) {
    const payment = await this.client.payment.findFirst({
      where: {
        tenantId,
        publicId: paymentPublicId,
        appointment: { publicId: appointmentPublicId },
      },
      include: { paymentMethod: { select: { publicId: true, name: true } } },
    });
    if (payment === null)
      throw new AppError({
        code: 'PAYMENT_NOT_FOUND',
        message: 'Pagamento não encontrado.',
        statusCode: 404,
      });
    if (payment.status === 'CANCELED')
      throw new AppError({
        code: 'PAYMENT_ALREADY_CANCELED',
        message: 'O pagamento já está cancelado.',
        statusCode: 409,
      });

    const updated = await this.client.payment.update({
      where: { id: payment.id },
      data: { status: 'CANCELED', canceledAt: new Date(), canceledReason: reason },
      include: { paymentMethod: { select: { publicId: true, name: true } } },
    });
    await this.client.auditLog.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        userId: actor.userId,
        sessionId: actor.sessionId,
        action: 'payment.canceled',
        targetType: 'payment',
        targetPublicId: updated.publicId,
      },
    });
    await this.cashRegisters?.reversePayment(tenantId, updated.id, actor);
    await this.commissions?.cancelForPayment(tenantId, updated.id, reason, actor);
    return pub(updated, appointmentPublicId);
  }

  public async listForAppointment(tenantId: bigint, appointmentPublicId: string) {
    const appointment = await this.client.appointment.findFirst({
      where: { tenantId, publicId: appointmentPublicId },
      select: {
        id: true,
        priceCents: true,
        depositType: true,
        depositPercentage: true,
        depositAmountCents: true,
      },
    });
    if (appointment === null) throw this.appointmentNotFound();

    const items = await this.client.payment.findMany({
      where: { tenantId, appointmentId: appointment.id },
      orderBy: { createdAt: 'desc' },
      include: { paymentMethod: { select: { publicId: true, name: true } } },
    });
    const paidItems = items.filter((item) => item.status === 'PAID');
    const totalPaidCents = paidItems.reduce((total, item) => total + item.amountCents, 0n);
    const depositPaidCents = paidItems
      .filter((item) => item.kind === 'DEPOSIT')
      .reduce((total, item) => total + item.amountCents, 0n);
    const balanceCents =
      appointment.priceCents > totalPaidCents ? appointment.priceCents - totalPaidCents : 0n;

    return AppointmentPaymentsResponseSchema.parse({
      items: items.map((item) => pub(item, appointmentPublicId)),
      summary: {
        priceCents: appointment.priceCents.toString(),
        totalPaidCents: totalPaidCents.toString(),
        balanceCents: balanceCents.toString(),
        depositType: appointment.depositType,
        depositPercentage: appointment.depositPercentage,
        depositAmountCents: appointment.depositAmountCents?.toString() ?? null,
        depositPaidCents: depositPaidCents.toString(),
      },
    });
  }

  private appointmentNotFound() {
    return new AppError({
      code: 'APPOINTMENT_NOT_FOUND',
      message: 'Agendamento não encontrado.',
      statusCode: 404,
    });
  }
}
