import { randomUUID } from 'node:crypto';
import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { validatePaymentOrigin } from '../payments/payment-origin-validator.js';

interface Actor {
  userId: bigint;
  sessionId: bigint;
}

function chargeNotFound() {
  return new AppError({
    code: 'CUSTOMER_MEMBERSHIP_CHARGE_NOT_FOUND',
    message: 'Cobrança não encontrada.',
    statusCode: 404,
  });
}

function chargeAlreadyPaid() {
  return new AppError({
    code: 'CUSTOMER_MEMBERSHIP_CHARGE_ALREADY_PAID',
    message: 'Esta cobrança já foi paga.',
    statusCode: 409,
  });
}

export class CustomerMembershipPaymentService {
  public constructor(private readonly client: PrismaClient) {}

  public async createPayment(
    tenantId: bigint,
    chargePublicId: string,
    paymentMethodId: bigint,
    actor: Actor,
  ) {
    return this.client.$transaction(async (tx) => {
      const charge = await tx.customerMembershipCharge.findFirst({
        where: { tenantId, publicId: chargePublicId },
        include: { payments: true, membership: { include: { plan: true } } },
      });
      if (charge === null) throw chargeNotFound();
      if (charge.status === 'PAID') {
        const existingPayment = charge.payments.find((p) => p.originType === 'MEMBERSHIP_CHARGE');
        if (existingPayment !== undefined) return existingPayment;
        throw chargeAlreadyPaid();
      }

      const paidAt = new Date();
      const payment = await tx.payment.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          originType: 'MEMBERSHIP_CHARGE',
          appointmentId: null,
          membershipChargeId: charge.id,
          paymentMethodId,
          kind: 'PAYMENT',
          status: 'PAID',
          amountCents: charge.amountCents,
          userId: actor.userId,
          sessionId: actor.sessionId,
        },
      });
      validatePaymentOrigin(payment.originType, payment.appointmentId, payment.membershipChargeId);

      await tx.customerMembershipCharge.update({
        where: { id: charge.id },
        data: { status: 'PAID', paidAt },
      });

      const periodEnd = new Date(paidAt);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      await tx.customerMembership.update({
        where: { id: charge.membershipId },
        data: charge.membership.status === 'PENDING'
          ? { status: 'ACTIVE', startedAt: paidAt, currentPeriodStart: paidAt, currentPeriodEnd: periodEnd, nextBillingAt: periodEnd }
          : { status: 'ACTIVE', currentPeriodStart: charge.periodStart, currentPeriodEnd: periodEnd, nextBillingAt: periodEnd },
      });

      await tx.auditLog.create({
        data: {
          publicId: randomUUID(), tenantId, userId: actor.userId, sessionId: actor.sessionId,
          action: 'customer_membership_charge.payment', targetType: 'customer_membership_charge', targetPublicId: charge.publicId,
        },
      });
      return payment;
    });
  }
}
