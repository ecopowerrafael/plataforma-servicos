import { randomUUID } from 'node:crypto';
import { Prisma } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { CustomerMembershipRepository } from './customer-membership.repository.js';
import { type CustomerMembershipChargeService } from './customer-membership-charge.service.js';

interface Actor {
  userId: bigint;
  sessionId: bigint;
}

function planNotFound() {
  return new AppError({
    code: 'CUSTOMER_MEMBERSHIP_PLAN_NOT_FOUND',
    message: 'Plano de assinatura não encontrado.',
    statusCode: 404,
  });
}

function customerNotFound() {
  return new AppError({
    code: 'CUSTOMER_NOT_FOUND',
    message: 'Cliente não encontrado.',
    statusCode: 404,
  });
}

function membershipExists() {
  return new AppError({
    code: 'CUSTOMER_MEMBERSHIP_EXISTS',
    message: 'Cliente já possui uma assinatura ativa neste tenant.',
    statusCode: 409,
  });
}

function membershipNotFoundErr() {
  return new AppError({
    code: 'CUSTOMER_MEMBERSHIP_NOT_FOUND',
    message: 'Assinatura não encontrada.',
    statusCode: 404,
  });
}

export class CustomerMembershipService {
  public constructor(
    private readonly repository: CustomerMembershipRepository,
    private readonly chargeService?: CustomerMembershipChargeService,
  ) {}

  public async create(tenantId: bigint, customerId: string, planPublicId: string, actor: Actor) {
    const plan = await this.repository.findPlan(tenantId, planPublicId);
    if (plan === null) throw planNotFound();

    const customer = await this.repository.findCustomer(tenantId, customerId);
    if (customer === null) throw customerNotFound();

    const existing = await this.repository.findByCustomer(tenantId, customer.id);
    if (existing !== null) throw membershipExists();

    try {
      const publicId = randomUUID();
      const activeKey = `${tenantId}:${customer.id}`;
      const item = await this.repository.create({
        publicId,
        tenantId,
        customerId: customer.id,
        planId: plan.id,
        status: 'PENDING',
        activeKey,
        startedAt: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        nextBillingAt: null,
        cancelAtPeriodEnd: false,
      });

      // Generate FIRST charge immediately (status PENDING, awaiting payment)
      if (this.chargeService && plan.priceCents > 0n) {
        const now = new Date();
        const periodEnd = this.calculatePeriodEnd(now, plan);

        // Capture immutable plan configuration for this charge/cycle. BigInt
        // identifiers are serialized as decimal strings to avoid precision loss.
        const planSnapshot = {
          planPublicId: plan.publicId,
          planName: plan.name,
          priceCents: Number(plan.priceCents),
          billingInterval: plan.billingInterval,
          benefits: plan.benefits.map((b) => ({
            serviceId: b.serviceId.toString(),
            type: b.type,
            quantityPerCycle: b.quantityPerCycle,
            discountPercent: b.discountPercent,
          })),
        };

        await this.chargeService.generateCharge(
          tenantId,
          item.id,
          now,
          periodEnd,
          plan.priceCents,
          actor,
          planSnapshot,
        );
      }

      await this.repository.audit(publicId, tenantId, actor.userId, actor.sessionId, 'create');
      return item;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new AppError({
          code: 'CUSTOMER_MEMBERSHIP_EXISTS',
          message: 'Cliente já possui uma assinatura ativa neste tenant.',
          statusCode: 409,
          cause: error,
        });
      throw error;
    }
  }

  public async getForCustomer(tenantId: bigint, customerId: bigint) {
    return this.repository.findByCustomer(tenantId, customerId);
  }

  public async activateMembership(
    membershipId: bigint,
    paidAt: Date,
    publicId: string,
    tenantId: bigint,
    actor: Actor,
  ) {
    const membership = await this.repository.findById(membershipId);
    if (!membership) throw membershipNotFoundErr();

    const periodStart = paidAt;
    const periodEnd = this.calculatePeriodEnd(periodStart, membership.plan);
    const nextBilling = periodEnd;

    const updated = await this.repository.update(membershipId, {
      status: 'ACTIVE',
      startedAt: paidAt,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      nextBillingAt: nextBilling,
    });

    await this.repository.audit(publicId, tenantId, actor.userId, actor.sessionId, 'activate');
    return updated;
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
