import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { CustomerMembershipChargeRepository } from './customer-membership-charge.repository.js';
import { CustomerMembershipRepository } from './customer-membership.repository.js';

function chargeNotFound() {
  return new AppError({
    code: 'CUSTOMER_MEMBERSHIP_CHARGE_NOT_FOUND',
    message: 'Cobrança não encontrada.',
    statusCode: 404,
  });
}

function membershipNotFound() {
  return new AppError({
    code: 'CUSTOMER_MEMBERSHIP_NOT_FOUND',
    message: 'Assinatura não encontrada.',
    statusCode: 404,
  });
}

export class CustomerMembershipPaymentSyncService {
  private readonly chargeRepository: CustomerMembershipChargeRepository;
  private readonly membershipRepository: CustomerMembershipRepository;

  public constructor(client: PrismaClient) {
    this.chargeRepository = new CustomerMembershipChargeRepository(client);
    this.membershipRepository = new CustomerMembershipRepository(client);
  }

  public async syncMembershipFromPayment(
    chargeId: bigint,
    paidAt: Date,
    actor: { userId: bigint; sessionId: bigint },
  ) {
    // Mark charge as PAID
    const charge = await this.chargeRepository.update(chargeId, {
      status: 'PAID',
      paidAt,
    });

    if (charge === null) throw chargeNotFound();

    // Fetch membership
    const membership = await this.membershipRepository.findById(charge.membershipId);
    if (membership === null) throw membershipNotFound();

    // If PENDING, activate; if ACTIVE, renew
    if (membership.status === 'PENDING') {
      return this.activateFirstTime(charge, paidAt, actor);
    } else if (membership.status === 'ACTIVE' || membership.status === 'PAST_DUE') {
      return this.renewMembership(charge, paidAt, actor);
    }

    // For other statuses, no-op
    return { success: true };
  }

  private async activateFirstTime(
    charge: any,
    paidAt: Date,
    actor: { userId: bigint; sessionId: bigint },
  ) {
    const membership = await this.membershipRepository.findById(charge.membershipId);
    if (!membership) throw membershipNotFound();

    const periodEnd = this.calculatePeriodEnd(paidAt, membership.plan);

    await this.membershipRepository.update(charge.membershipId, {
      status: 'ACTIVE',
      startedAt: paidAt,
      currentPeriodStart: paidAt,
      currentPeriodEnd: periodEnd,
      nextBillingAt: periodEnd,
    });

    await this.membershipRepository.audit(
      membership.publicId,
      charge.tenantId,
      actor.userId,
      actor.sessionId,
      'activate_from_payment',
    );

    return { success: true };
  }

  private async renewMembership(
    charge: any,
    _paidAt: Date,
    actor: { userId: bigint; sessionId: bigint },
  ) {
    const membership = await this.membershipRepository.findById(charge.membershipId);
    if (!membership) throw membershipNotFound();

    const periodEnd = this.calculatePeriodEnd(charge.periodStart, membership.plan);

    await this.membershipRepository.update(charge.membershipId, {
      status: 'ACTIVE',
      currentPeriodStart: charge.periodStart,
      currentPeriodEnd: periodEnd,
      nextBillingAt: periodEnd,
    });

    await this.membershipRepository.audit(
      membership.publicId,
      charge.tenantId,
      actor.userId,
      actor.sessionId,
      'renew_from_payment',
    );

    return { success: true };
  }

  private calculatePeriodEnd(start: Date, plan: { billingInterval?: string }): Date {
    const end = new Date(start);
    const interval = plan.billingInterval || 'MONTHLY';

    switch (interval) {
      case 'MONTHLY':
        end.setMonth(end.getMonth() + 1);
        break;
      case 'QUARTERLY':
        end.setMonth(end.getMonth() + 3);
        break;
      case 'SEMIANNUAL':
        end.setMonth(end.getMonth() + 6);
        break;
      case 'ANNUAL':
        end.setFullYear(end.getFullYear() + 1);
        break;
    }

    return end;
  }
}
