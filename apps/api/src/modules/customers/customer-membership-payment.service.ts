import { randomUUID } from 'node:crypto';
import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { validatePaymentOrigin } from '../payments/payment-origin-validator.js';
import { CustomerMembershipChargeRepository } from './customer-membership-charge.repository.js';
import { CustomerMembershipPaymentSyncService } from './customer-membership-payment-sync.service.js';

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
  private readonly chargeRepository: CustomerMembershipChargeRepository;
  private readonly syncService: CustomerMembershipPaymentSyncService;

  public constructor(private readonly client: PrismaClient) {
    this.chargeRepository = new CustomerMembershipChargeRepository(client);
    this.syncService = new CustomerMembershipPaymentSyncService(client);
  }

  public async createPayment(
    tenantId: bigint,
    chargePublicId: string,
    paymentMethodId: bigint,
    actor: Actor,
  ) {
    // Fetch charge
    const charge = await this.chargeRepository.find(tenantId, chargePublicId);
    if (charge === null) throw chargeNotFound();

    // Prevent double payment
    if (charge.status === 'PAID') throw chargeAlreadyPaid();

    // Check for existing payment to prevent duplicates
    const existingPayment = charge.payments?.find(
      (p) => p.originType === 'MEMBERSHIP_CHARGE',
    );

    if (existingPayment) {
      return existingPayment;
    }

    // Create new Payment (PAY_LOCAL starts as PAID immediately)
    const publicId = randomUUID();
    const payment = await this.client.payment.create({
      data: {
        publicId,
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

    // Validate invariant
    validatePaymentOrigin(payment.originType, payment.appointmentId, payment.membershipChargeId);

    // Sync membership on payment creation (activate or renew)
    await this.syncService.syncMembershipFromPayment(charge.id, new Date(), actor);

    return payment;
  }
}
