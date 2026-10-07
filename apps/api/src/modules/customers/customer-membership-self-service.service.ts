import { CustomerMembershipPublicSchema, type CustomerMembershipPublic } from '@plataforma/shared';

import { type PrismaClient } from '../../database-client/client.js';
import { CustomerMembershipChargeRepository } from './customer-membership-charge.repository.js';
import { CustomerMembershipChargeService } from './customer-membership-charge.service.js';
import { CustomerMembershipPlanRepository } from './customer-membership-plan.repository.js';
import { CustomerMembershipPlanService } from './customer-membership-plan.service.js';
import { CustomerMembershipRepository } from './customer-membership.repository.js';
import { CustomerMembershipService } from './customer-membership.service.js';

export class CustomerMembershipSelfService {
  private readonly plans: CustomerMembershipPlanService;
  private readonly memberships: CustomerMembershipService;

  public constructor(client: PrismaClient) {
    this.plans = new CustomerMembershipPlanService(new CustomerMembershipPlanRepository(client));
    this.memberships = new CustomerMembershipService(
      new CustomerMembershipRepository(client),
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
}
