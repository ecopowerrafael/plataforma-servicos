import { randomUUID } from 'node:crypto';
import { Prisma } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { CustomerMembershipChargeRepository } from './customer-membership-charge.repository.js';

interface Actor {
  userId: bigint;
  sessionId: bigint;
}

function membershipNotFound() {
  return new AppError({
    code: 'CUSTOMER_MEMBERSHIP_NOT_FOUND',
    message: 'Assinatura não encontrada.',
    statusCode: 404,
  });
}

function chargeNotFound() {
  return new AppError({
    code: 'CUSTOMER_MEMBERSHIP_CHARGE_NOT_FOUND',
    message: 'Cobrança não encontrada.',
    statusCode: 404,
  });
}

function chargeAlreadyExists() {
  return new AppError({
    code: 'CUSTOMER_MEMBERSHIP_CHARGE_EXISTS',
    message: 'Já existe uma cobrança para este período.',
    statusCode: 409,
  });
}

export class CustomerMembershipChargeService {
  public constructor(private readonly repository: CustomerMembershipChargeRepository) {}

  public async list(tenantId: bigint, membershipPublicId: string) {
    const membership = await this.repository.findMembership(tenantId, membershipPublicId);
    if (membership === null) throw membershipNotFound();

    return this.repository.list(tenantId, membership.id);
  }

  public async get(tenantId: bigint, publicId: string) {
    const charge = await this.repository.find(tenantId, publicId);
    if (charge === null) throw chargeNotFound();

    return charge;
  }

  public async generateCharge(
    tenantId: bigint,
    membershipId: bigint,
    periodStart: Date,
    periodEnd: Date,
    amountCents: bigint,
    actor: Actor,
    planSnapshot?: object,
  ) {
    // Check if charge already exists for this period
    const existing = await this.repository.findByMembership(membershipId, periodStart, periodEnd);
    if (existing !== null) throw chargeAlreadyExists();

    try {
      const publicId = randomUUID();
      const dueAt = new Date(periodEnd);
      dueAt.setDate(dueAt.getDate() + 3); // 3 days grace period

      const createData: any = {
        publicId,
        tenantId,
        membershipId,
        periodStart,
        periodEnd,
        amountCents,
        status: 'PENDING',
        dueAt,
        paidAt: null,
      };

      if (planSnapshot) {
        createData.planSnapshot = planSnapshot;
      }

      const charge = await this.repository.create(createData);

      await this.repository.audit(publicId, tenantId, actor.userId, actor.sessionId, 'generate');
      return charge;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw chargeAlreadyExists();
      throw error;
    }
  }

  public async recordPayment(
    chargeId: bigint,
    paymentId: bigint,
    paidAt: Date,
    tenantId: bigint,
    publicId: string,
    actor: Actor,
  ) {
    const charge = await this.repository.update(chargeId, {
      status: 'PAID',
      paidAt,
      payments: { connect: { id: paymentId } },
    });

    await this.repository.audit(publicId, tenantId, actor.userId, actor.sessionId, 'payment');
    return charge;
  }

  public async failCharge(
    chargeId: bigint,
    tenantId: bigint,
    publicId: string,
    actor: Actor,
  ) {
    const charge = await this.repository.update(chargeId, {
      status: 'FAILED',
    });

    await this.repository.audit(publicId, tenantId, actor.userId, actor.sessionId, 'failed');
    return charge;
  }
}
