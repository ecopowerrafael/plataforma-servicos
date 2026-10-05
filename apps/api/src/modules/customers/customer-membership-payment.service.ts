import { randomUUID } from 'node:crypto';
import { Prisma, type Payment, type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { validatePaymentOrigin } from '../payments/payment-origin-validator.js';

interface Actor { userId: bigint | null; sessionId: bigint | null }

function chargeNotFound() {
  return new AppError({ code: 'CUSTOMER_MEMBERSHIP_CHARGE_NOT_FOUND', message: 'Cobrança não encontrada.', statusCode: 404 });
}

export class CustomerMembershipPaymentService {
  public constructor(private readonly client: PrismaClient) {}

  public async recordLatePaidMembershipChargeWithinTransaction(
    tx: Prisma.TransactionClient,
    tenantId: bigint,
    chargePublicId: string,
    paymentMethodId: bigint,
    actor: Actor,
  ): Promise<Payment> {
    const locked = await tx.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
      SELECT id FROM customer_membership_charges
      WHERE tenant_id = ${tenantId} AND public_id = ${chargePublicId}
      FOR UPDATE
    `);
    if (locked.length === 0) throw chargeNotFound();

    const charge = await tx.customerMembershipCharge.findFirst({ where: { tenantId, publicId: chargePublicId } });
    if (charge === null) throw chargeNotFound();
    const existing = await tx.payment.findFirst({
      where: { tenantId, membershipChargeId: charge.id, originType: 'MEMBERSHIP_CHARGE', status: 'PAID' },
    });
    if (existing !== null) return existing;

    const payment = await tx.payment.create({ data: {
      publicId: randomUUID(), tenantId, originType: 'MEMBERSHIP_CHARGE', appointmentId: null,
      membershipChargeId: charge.id, paymentMethodId, kind: 'PAYMENT', status: 'PAID',
      amountCents: charge.amountCents, userId: actor.userId, sessionId: actor.sessionId,
    } });
    validatePaymentOrigin(payment.originType, payment.appointmentId, payment.membershipChargeId, payment.debtId);
    const paidAt = new Date();
    await tx.customerMembershipCharge.update({ where: { id: charge.id }, data: { status: 'PAID', paidAt } });
    await tx.auditLog.create({ data: {
      publicId: randomUUID(), tenantId, userId: actor.userId, sessionId: actor.sessionId,
      action: 'customer_membership_charge.payment_late_after_cancel', targetType: 'customer_membership_charge', targetPublicId: charge.publicId,
    } });
    return payment;
  }

  public async confirmMembershipChargePaymentWithinTransaction(
    tx: Prisma.TransactionClient,
    tenantId: bigint,
    chargePublicId: string,
    paymentMethodId: bigint,
    actor: Actor,
  ): Promise<Payment> {
    const locked = await tx.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
      SELECT id FROM customer_membership_charges
      WHERE tenant_id = ${tenantId} AND public_id = ${chargePublicId}
      FOR UPDATE
    `);
    if (locked.length === 0) throw chargeNotFound();

    const charge = await tx.customerMembershipCharge.findFirst({
      where: { tenantId, publicId: chargePublicId },
      include: { membership: { include: { plan: true } } },
    });
    if (charge === null) throw chargeNotFound();

    if (charge.status === 'PAID') {
      const existing = await tx.payment.findFirst({
        where: { tenantId, membershipChargeId: charge.id, originType: 'MEMBERSHIP_CHARGE', status: 'PAID' },
      });
      if (existing !== null) return existing;
      throw new AppError({ code: 'CUSTOMER_MEMBERSHIP_CHARGE_INCONSISTENT', message: 'A cobrança marcada como paga não possui recebimento correspondente.', statusCode: 409 });
    }
    if (!['PENDING', 'FAILED'].includes(charge.status)) {
      throw new AppError({ code: 'CUSTOMER_MEMBERSHIP_CHARGE_NOT_PAYABLE', message: 'Esta cobrança não pode ser confirmada neste estado.', statusCode: 409 });
    }

    const paidAt = new Date();
    const payment = await tx.payment.create({ data: {
      publicId: randomUUID(), tenantId, originType: 'MEMBERSHIP_CHARGE', appointmentId: null,
      membershipChargeId: charge.id, paymentMethodId, kind: 'PAYMENT', status: 'PAID',
      amountCents: charge.amountCents, userId: actor.userId, sessionId: actor.sessionId,
    } });
    validatePaymentOrigin(payment.originType, payment.appointmentId, payment.membershipChargeId, payment.debtId);
    await tx.customerMembershipCharge.update({ where: { id: charge.id }, data: { status: 'PAID', paidAt } });

    const periodEnd = charge.periodEnd;
    await tx.customerMembership.update({
      where: { id: charge.membershipId },
      data: charge.membership.status === 'PENDING'
        ? { status: 'ACTIVE', startedAt: paidAt, currentPeriodStart: charge.periodStart, currentPeriodEnd: periodEnd, nextBillingAt: periodEnd }
      : ['CANCELED', 'PAUSED', 'EXPIRED'].includes(charge.membership.status)
          ? { }
          : { status: 'ACTIVE', currentPeriodStart: charge.periodStart, currentPeriodEnd: periodEnd, nextBillingAt: periodEnd },
    });
    if (['ACTIVE', 'PAST_DUE'].includes(charge.membership.status)) {
      await tx.auditLog.create({ data: {
        publicId: randomUUID(), tenantId, userId: actor.userId, sessionId: actor.sessionId,
        action: 'customer_membership.renewed', targetType: 'customer_membership',
        targetPublicId: charge.membership.publicId,
        metadata: { chargePublicId: charge.publicId, periodStart: charge.periodStart.toISOString(), periodEnd: charge.periodEnd.toISOString() },
      } });
    }
    await tx.auditLog.create({ data: {
      publicId: randomUUID(), tenantId, userId: actor.userId, sessionId: actor.sessionId,
      action: 'customer_membership_charge.payment', targetType: 'customer_membership_charge', targetPublicId: charge.publicId,
    } });
    return payment;
  }

  public async createPayment(tenantId: bigint, chargePublicId: string, paymentMethodId: bigint, actor: Actor) {
    return this.client.$transaction((tx) => this.confirmMembershipChargePaymentWithinTransaction(tx, tenantId, chargePublicId, paymentMethodId, actor));
  }
}
