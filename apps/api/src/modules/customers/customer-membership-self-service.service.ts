import {
  CustomerMembershipActionResponseSchema,
  CustomerMembershipPublicSchema,
  type CustomerMembershipActionResponse,
  type CustomerMembershipPublic,
} from '@plataforma/shared';

import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { CustomerMembershipChargeRepository } from './customer-membership-charge.repository.js';
import { CustomerMembershipChargeService } from './customer-membership-charge.service.js';
import { CustomerMembershipPlanRepository } from './customer-membership-plan.repository.js';
import { CustomerMembershipPlanService } from './customer-membership-plan.service.js';
import { CustomerMembershipRepository } from './customer-membership.repository.js';
import { CustomerMembershipService } from './customer-membership.service.js';

export class CustomerMembershipSelfService {
  private readonly plans: CustomerMembershipPlanService;
  private readonly memberships: CustomerMembershipService;
  private readonly repository: CustomerMembershipRepository;

  public constructor(client: PrismaClient) {
    this.repository = new CustomerMembershipRepository(client);
    this.plans = new CustomerMembershipPlanService(new CustomerMembershipPlanRepository(client));
    this.memberships = new CustomerMembershipService(
      this.repository,
      new CustomerMembershipChargeService(new CustomerMembershipChargeRepository(client)),
    );
  }

  public listAvailablePlans(tenantId: bigint) {
    return this.plans.listAvailableForCustomer(tenantId);
  }

  public async create(
    tenantId: bigint,
    customerPublicId: string,
    planPublicId: string,
    sessionId: bigint,
  ): Promise<CustomerMembershipPublic> {
    const membership = await this.memberships.create(tenantId, customerPublicId, planPublicId, {
      userId: null,
      sessionId,
    });

    return CustomerMembershipPublicSchema.parse({
      publicId: membership.publicId,
      customerPublicId,
      planPublicId: membership.plan.publicId,
      planName: membership.plan.name,
      status: membership.status,
      startedAt: membership.startedAt?.toISOString() ?? null,
      currentPeriodStart: membership.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: membership.currentPeriodEnd?.toISOString() ?? null,
      nextBillingAt: membership.nextBillingAt?.toISOString() ?? null,
      cancelAtPeriodEnd: membership.cancelAtPeriodEnd,
      canceledAt: membership.canceledAt?.toISOString() ?? null,
      priceCents: Number(membership.plan.priceCents),
      createdAt: membership.createdAt.toISOString(),
      updatedAt: membership.updatedAt.toISOString(),
    });
  }

  public async cancel(
    tenantId: bigint,
    customerId: bigint,
    sessionId: bigint,
  ): Promise<CustomerMembershipActionResponse> {
    const membership = await this.currentMembership(tenantId, customerId);
    const updated = await this.memberships.cancel(tenantId, membership.publicId, {
      userId: null,
      sessionId,
    });
    if (updated === null) throw this.membershipNotFound();
    return this.serializeAction(updated);
  }

  public async scheduleCancelAtPeriodEnd(
    tenantId: bigint,
    customerId: bigint,
    sessionId: bigint,
  ): Promise<CustomerMembershipActionResponse> {
    const membership = await this.currentMembership(tenantId, customerId);
    const updated = await this.memberships.scheduleCancelAtPeriodEnd(
      tenantId,
      membership.publicId,
      { userId: null, sessionId },
    );
    return this.serializeAction(updated);
  }

  public async revokeCancelAtPeriodEnd(
    tenantId: bigint,
    customerId: bigint,
    sessionId: bigint,
  ): Promise<CustomerMembershipActionResponse> {
    const membership = await this.currentMembership(tenantId, customerId);
    const updated = await this.memberships.revokeCancelAtPeriodEnd(tenantId, membership.publicId, {
      userId: null,
      sessionId,
    });
    return this.serializeAction(updated);
  }

  private async currentMembership(tenantId: bigint, customerId: bigint) {
    const membership = await this.repository.findByCustomer(tenantId, customerId);
    if (membership === null) throw this.membershipNotFound();
    return membership;
  }

  private serializeAction(membership: {
    publicId: string;
    status: string;
    canceledAt: Date | null;
    nextBillingAt: Date | null;
    cancelAtPeriodEnd: boolean;
  }): CustomerMembershipActionResponse {
    return CustomerMembershipActionResponseSchema.parse({
      publicId: membership.publicId,
      status: membership.status,
      canceledAt: membership.canceledAt?.toISOString() ?? null,
      nextBillingAt: membership.nextBillingAt?.toISOString() ?? null,
      cancelAtPeriodEnd: membership.cancelAtPeriodEnd,
    });
  }

  private membershipNotFound() {
    return new AppError({
      code: 'CUSTOMER_MEMBERSHIP_NOT_FOUND',
      message: 'Mensalidade não encontrada.',
      statusCode: 404,
    });
  }
}
