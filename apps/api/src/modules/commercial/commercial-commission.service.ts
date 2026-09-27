import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../database-client/client.js';

interface CommissionDistribution {
  managerId: bigint;
  managerAmountCents: bigint;
  representativeId?: bigint;
  representativeAmountCents?: bigint;
  sellerId?: bigint;
  sellerAmountCents?: bigint;
}

export class CommercialCommissionService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Calculate commission percentage for an account
   * Priority: plan-specific rule > general rule > defaultCommissionBps
   */
  async resolveCommissionBps(
    commercialAccountId: bigint,
    planId?: bigint,
  ): Promise<number> {
    const now = new Date();

    // 1. Try plan-specific rule
    if (planId) {
      const planRule = await this.prisma.commercialCommissionRule.findFirst({
        where: {
          commercialAccountId,
          planId,
          active: true,
          effectiveFrom: { lte: now },
          OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }],
        },
        orderBy: { effectiveFrom: 'desc' },
      });

      if (planRule) {
        return planRule.percentageBps;
      }
    }

    // 2. Try general rule (planId = null)
    const generalRule = await this.prisma.commercialCommissionRule.findFirst({
      where: {
        commercialAccountId,
        planId: null,
        active: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    if (generalRule) {
      return generalRule.percentageBps;
    }

    // 3. Default
    const account = await this.prisma.commercialAccount.findUniqueOrThrow({
      where: { id: commercialAccountId },
      select: { defaultCommissionBps: true },
    });

    return account.defaultCommissionBps;
  }

  /**
   * Calculate commission distribution for a subscription
   * Respects hierarchy: MANAGER -> REPRESENTATIVE -> SELLER
   */
  async calculateDistribution(
    subscriptionAmountCents: bigint,
    assignment: {
      managerId?: bigint;
      representativeId?: bigint;
      sellerId?: bigint;
    },
    planId?: bigint,
  ): Promise<CommissionDistribution | null> {
    if (!assignment.managerId) {
      return null; // No manager assigned, no commission
    }

    const managerBps = await this.resolveCommissionBps(
      assignment.managerId,
      planId,
    );

    const distribution: CommissionDistribution = {
      managerId: assignment.managerId,
      managerAmountCents: (subscriptionAmountCents * BigInt(managerBps)) / 10000n,
    };

    // If no seller, manager gets full commission
    if (!assignment.sellerId) {
      return distribution;
    }

    // With seller, distribute commission
    const sellerBps = await this.resolveCommissionBps(
      assignment.sellerId,
      planId,
    );

    distribution.sellerAmountCents =
      (subscriptionAmountCents * BigInt(sellerBps)) / 10000n;

    // If representative, deduct from manager's share
    if (assignment.representativeId) {
      const representativeBps = await this.resolveCommissionBps(
        assignment.representativeId,
        planId,
      );

      distribution.representativeAmountCents =
        (subscriptionAmountCents * BigInt(representativeBps)) / 10000n;

      distribution.managerAmountCents -= distribution.representativeAmountCents;
    }

    // Manager's residual after seller (and optionally representative)
    distribution.managerAmountCents -= distribution.sellerAmountCents;

    return distribution;
  }

  /**
   * Create commissions from subscription
   * Idempotent: uses unique constraint on (account, subscription, created_at)
   */
  async createFromSubscription(
    subscriptionId: bigint,
    tenantId: bigint,
    subscriptionAmountCents: bigint,
    planId: bigint,
    assignment: {
      managerId?: bigint;
      representativeId?: bigint;
      sellerId?: bigint;
    },
  ) {
    const distribution = await this.calculateDistribution(
      subscriptionAmountCents,
      assignment,
      planId,
    );

    if (!distribution) {
      return [];
    }

    const commissions = [];

    // Create commission for seller (if exists)
    if (distribution.sellerId && (distribution.sellerAmountCents ?? 0n) > 0n) {
      const sellerBps = await this.resolveCommissionBps(
        distribution.sellerId,
        planId,
      );
      commissions.push({
        publicId: randomUUID(),
        commercialAccountId: distribution.sellerId,
        tenantId,
        subscriptionId,
        baseAmountCents: subscriptionAmountCents,
        percentageBpsSnapshot: sellerBps,
        commissionAmountCents: distribution.sellerAmountCents ?? 0n,
        roleSnapshot: 'SELLER',
      });
    }

    // Create commission for representative (if exists)
    if (
      distribution.representativeId &&
      distribution.representativeAmountCents &&
      distribution.representativeAmountCents > 0n
    ) {
      const representativeBps = await this.resolveCommissionBps(
        distribution.representativeId,
        planId,
      );
      commissions.push({
        publicId: randomUUID(),
        commercialAccountId: distribution.representativeId,
        tenantId,
        subscriptionId,
        baseAmountCents: subscriptionAmountCents,
        percentageBpsSnapshot: representativeBps,
        commissionAmountCents: distribution.representativeAmountCents,
        roleSnapshot: 'REPRESENTATIVE',
      });
    }

    // Create commission for manager
    if (distribution.managerAmountCents > 0n) {
      const managerBps = await this.resolveCommissionBps(
        distribution.managerId,
        planId,
      );
      commissions.push({
        publicId: randomUUID(),
        commercialAccountId: distribution.managerId,
        tenantId,
        subscriptionId,
        baseAmountCents: subscriptionAmountCents,
        percentageBpsSnapshot: managerBps,
        commissionAmountCents: distribution.managerAmountCents,
        roleSnapshot: 'MANAGER',
      });
    }

    return this.prisma.$transaction(
      commissions.map(c =>
        this.prisma.commercialCommission.create({
          data: {
            ...c,
            status: 'AVAILABLE',
          },
        }),
      ),
    );
  }

  /**
   * Create commission for a specific subordinate (used for manual wallet payments with anti-cycle)
   * Manager who paid does NOT receive commission
   */
  async createFromSubscriptionWithExclusion(
    subordinateAccountId: bigint,
    subscriptionId: bigint,
    planId: bigint,
  ) {
    const subscription = await this.prisma.tenantSubscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });

    if (!subscription || !subscription.plan) {
      return null;
    }

    const subordinateCommissionBps = await this.resolveCommissionBps(
      subordinateAccountId,
      planId,
    );

    const commissionAmountCents =
      (subscription.plan.priceCents * BigInt(subordinateCommissionBps)) / 10000n;

    if (commissionAmountCents <= 0n) {
      return null; // No commission if percentage is 0
    }

    const commission = await this.prisma.commercialCommission.create({
      data: {
        publicId: randomUUID(),
        commercialAccountId: subordinateAccountId,
        tenantId: subscription.tenantId,
        subscriptionId,
        baseAmountCents: subscription.plan.priceCents,
        percentageBpsSnapshot: subordinateCommissionBps,
        commissionAmountCents,
        roleSnapshot: 'SELLER', // Default to SELLER, actual role determined by hierarchy
        status: 'AVAILABLE',
      },
    });

    return commission;
  }

  /**
   * Mark commissions as available (usually called after subscription confirmation)
   */
  async markAvailable(
    commercialAccountId: bigint,
    subscriptionId: bigint,
  ) {
    return this.prisma.commercialCommission.updateMany({
      where: {
        commercialAccountId,
        subscriptionId,
        status: 'PENDING',
      },
      data: {
        status: 'AVAILABLE',
      },
    });
  }

  /**
   * Reverse commissions and create reversal entries in wallet
   */
  async reverse(
    commercialAccountId: bigint,
    subscriptionId: bigint,
  ) {
    const now = new Date();

    return this.prisma.commercialCommission.updateMany({
      where: {
        commercialAccountId,
        subscriptionId,
        status: { in: ['PENDING', 'AVAILABLE'] },
      },
      data: {
        status: 'REVERSED',
        reversedAt: now,
      },
    });
  }

  /**
   * Get commissions for an account
   */
  async getCommissions(
    commercialAccountId: bigint,
    limit: number = 50,
    offset: number = 0,
  ) {
    const commissions = await this.prisma.commercialCommission.findMany({
      where: { commercialAccountId },
      include: {
        tenant: { select: { publicId: true, displayName: true } },
        subscription: { select: { publicId: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const total = await this.prisma.commercialCommission.count({
      where: { commercialAccountId },
    });

    return { commissions, total };
  }

  /**
   * Get team commissions (for manager viewing subordinates)
   */
  async getTeamCommissions(managerId: bigint) {
    const subordinates = await this.prisma.commercialAccount.findMany({
      where: { parentId: managerId },
      select: { id: true },
    });

    const subordinateIds = subordinates.map(s => s.id);

    const commissions = await this.prisma.commercialCommission.findMany({
      where: {
        commercialAccountId: { in: subordinateIds },
        status: { in: ['AVAILABLE', 'PENDING'] },
      },
      include: {
        commercialAccount: { select: { publicId: true, user: { select: { email: true } } } },
        tenant: { select: { publicId: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return commissions;
  }
}
