import { z } from 'zod';

import { type PrismaClient } from '../../database-client/client.js';
import { type CustomerMembershipAccountResponse } from '@plataforma/shared';

const PlanSnapshotBenefitSchema = z.object({
  serviceId: z.string(),
  type: z.enum(['QUANTITY', 'UNLIMITED', 'DISCOUNT']),
  quantityPerCycle: z.number().int().nullable(),
  discountPercent: z.number().int().nullable(),
});

const PlanSnapshotSchema = z.object({ benefits: z.array(PlanSnapshotBenefitSchema) });

const CURRENT_STATUS_PRIORITY = ['ACTIVE', 'PAST_DUE', 'PENDING', 'PAUSED'] as const;

type AccountMembership = Awaited<
  ReturnType<CustomerMembershipAccountService['listMemberships']>
>[number];

export class CustomerMembershipAccountService {
  public constructor(private readonly client: PrismaClient) {}

  public async getForCustomer(
    tenantId: bigint,
    customerId: bigint,
  ): Promise<CustomerMembershipAccountResponse> {
    const memberships = await this.listMemberships(tenantId, customerId);
    const current = this.selectCurrent(memberships);
    const history = memberships.filter((item) => item.id !== current?.id);

    return {
      current: current === undefined ? null : await this.serialize(current, tenantId, true),
      history: await Promise.all(history.map((item) => this.serialize(item, tenantId, false))),
    };
  }

  private listMemberships(tenantId: bigint, customerId: bigint) {
    return this.client.customerMembership.findMany({
      where: { tenantId, customerId },
      include: {
        plan: {
          include: {
            benefits: { include: { service: { select: { name: true } } } },
          },
        },
        charges: {
          orderBy: { periodStart: 'desc' },
          select: {
            id: true,
            periodStart: true,
            periodEnd: true,
            amountCents: true,
            status: true,
            dueAt: true,
            paidAt: true,
            planSnapshot: true,
            financialReversals: { select: { type: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private selectCurrent(memberships: AccountMembership[]) {
    return memberships
      .filter((item) =>
        CURRENT_STATUS_PRIORITY.includes(item.status as (typeof CURRENT_STATUS_PRIORITY)[number]),
      )
      .sort((left, right) => {
        const statusOrder =
          CURRENT_STATUS_PRIORITY.indexOf(left.status as (typeof CURRENT_STATUS_PRIORITY)[number]) -
          CURRENT_STATUS_PRIORITY.indexOf(right.status as (typeof CURRENT_STATUS_PRIORITY)[number]);
        return statusOrder === 0
          ? right.createdAt.getTime() - left.createdAt.getTime()
          : statusOrder;
      })[0];
  }

  private async serialize(
    membership: AccountMembership,
    tenantId: bigint,
    includeBenefits: boolean,
  ): Promise<CustomerMembershipAccountResponse['current'] & object> {
    const charges = membership.charges.map((charge) => ({
      periodStart: charge.periodStart.toISOString(),
      periodEnd: charge.periodEnd.toISOString(),
      amountCents: Number(charge.amountCents),
      status: charge.financialReversals.length > 0 ? ('REFUNDED' as const) : charge.status,
      dueAt: charge.dueAt.toISOString(),
      paidAt: charge.paidAt?.toISOString() ?? null,
    }));
    const activeBenefits =
      includeBenefits && membership.status === 'ACTIVE'
        ? await this.balanceForActiveMembership(membership, tenantId)
        : [];

    return {
      publicId: membership.publicId,
      status: membership.status,
      planName: membership.plan.name,
      planDescription: membership.plan.description,
      priceCents: Number(membership.plan.priceCents),
      billingInterval: membership.plan.billingInterval,
      startedAt: membership.startedAt?.toISOString() ?? null,
      currentPeriodStart: membership.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: membership.currentPeriodEnd?.toISOString() ?? null,
      nextBillingAt: membership.nextBillingAt?.toISOString() ?? null,
      canceledAt: membership.canceledAt?.toISOString() ?? null,
      cancelAtPeriodEnd: membership.cancelAtPeriodEnd,
      charges,
      benefits: activeBenefits,
      benefitsAvailable: membership.status === 'ACTIVE',
    };
  }

  private async balanceForActiveMembership(membership: AccountMembership, tenantId: bigint) {
    const now = new Date();
    const charge = membership.charges.find(
      (item) =>
        item.status === 'PAID' &&
        item.financialReversals.length === 0 &&
        item.periodStart <= now &&
        item.periodEnd > now,
    );
    if (charge === undefined) return [];

    const snapshot = PlanSnapshotSchema.safeParse(charge.planSnapshot);
    const benefits = snapshot.success
      ? snapshot.data.benefits
      : membership.plan.benefits.map((benefit) => ({
          serviceId: benefit.serviceId.toString(),
          type: benefit.type,
          quantityPerCycle: benefit.quantityPerCycle,
          discountPercent: benefit.discountPercent,
        }));
    const serviceNames = new Map(
      membership.plan.benefits.map((benefit) => [
        benefit.serviceId.toString(),
        benefit.service.name,
      ]),
    );
    const usage = await this.client.customerMembershipUsage.groupBy({
      by: ['serviceId', 'status'],
      where: {
        tenantId,
        membershipId: membership.id,
        membershipChargeId: charge.id,
        status: { in: ['RESERVED', 'CONSUMED', 'RELEASED'] },
      },
      _count: true,
    });

    return benefits.flatMap((benefit) => {
      const serviceName = serviceNames.get(benefit.serviceId);
      if (serviceName === undefined) return [];
      const serviceUsage = usage.filter((item) => item.serviceId.toString() === benefit.serviceId);
      const reserved = serviceUsage.find((item) => item.status === 'RESERVED')?._count ?? 0;
      const consumed = serviceUsage.find((item) => item.status === 'CONSUMED')?._count ?? 0;
      if (benefit.type === 'QUANTITY') {
        const limit = benefit.quantityPerCycle ?? 0;
        return [
          {
            serviceName,
            type: benefit.type,
            limit,
            reserved,
            consumed,
            available: Math.max(0, limit - reserved - consumed),
            discountPercent: null,
          },
        ];
      }
      return [
        {
          serviceName,
          type: benefit.type,
          limit: null,
          reserved: null,
          consumed: null,
          available: null,
          discountPercent: benefit.type === 'DISCOUNT' ? (benefit.discountPercent ?? 0) : null,
        },
      ];
    });
  }
}
