import { randomUUID } from 'node:crypto';
import { AppError } from '../../errors/AppError.js';
import type { PrismaClient } from '../../database-client/client.js';

export class CommercialCommissionRuleService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Create a commission rule
   */
  async createRule(
    commercialAccountId: bigint,
    planId: bigint | null,
    percentageBps: number,
    effectiveFrom: Date,
  ) {
    // Validate percentageBps: 0-10000 = 0-100%
    if (percentageBps < 0 || percentageBps > 10000) {
      throw new AppError({
        code: 'INVALID_COMMISSION_PERCENTAGE',
        message: 'Commission percentage must be between 0 and 10000 basis points',
        statusCode: 400,
      });
    }

    return this.prisma.commercialCommissionRule.create({
      data: {
        publicId: randomUUID(),
        commercialAccountId,
        planId,
        percentageBps,
        effectiveFrom,
        active: true,
      },
    });
  }

  /**
   * Update commission rule
   */
  async updateRule(
    ruleId: bigint,
    data: {
      percentageBps?: number;
      effectiveUntil?: Date;
      active?: boolean;
    },
  ) {
    if (data.percentageBps !== undefined) {
      if (data.percentageBps < 0 || data.percentageBps > 10000) {
        throw new AppError({
          code: 'INVALID_COMMISSION_PERCENTAGE',
          message: 'Commission percentage must be between 0 and 10000 basis points',
          statusCode: 400,
        });
      }
    }

    return this.prisma.commercialCommissionRule.update({
      where: { id: ruleId },
      data,
    });
  }

  /**
   * Deactivate rule
   */
  async deactivateRule(ruleId: bigint) {
    return this.updateRule(ruleId, { active: false });
  }

  /**
   * Get active rules for an account
   */
  async getRules(commercialAccountId: bigint, planId?: bigint) {
    return this.prisma.commercialCommissionRule.findMany({
      where: {
        commercialAccountId,
        ...(planId && { planId }),
        active: true,
      },
      include: {
        plan: { select: { publicId: true, name: true } },
      },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  /**
   * Validate subordinate commission doesn't exceed parent
   */
  async validateSubordinateCommissionLimit(
    parentAccountId: bigint,
    planId?: bigint,
  ): Promise<{ valid: boolean; message?: string }> {
    const now = new Date();

    // Get parent commission
    let parentRule = await this.prisma.commercialCommissionRule.findFirst({
      where: {
        commercialAccountId: parentAccountId,
        ...(planId && { planId }),
        active: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    const parentBps =
      parentRule?.percentageBps ??
      (
        await this.prisma.commercialAccount.findUniqueOrThrow({
          where: { id: parentAccountId },
          select: { defaultCommissionBps: true },
        })
      ).defaultCommissionBps;

    // Get all subordinates of parent
    const subordinates = await this.prisma.commercialAccount.findMany({
      where: { parentId: parentAccountId },
      select: { id: true },
    });

    // Sum subordinates' commissions
    const rules = await this.prisma.commercialCommissionRule.findMany({
      where: {
        commercialAccountId: { in: subordinates.map(s => s.id) },
        ...(planId && { planId }),
        active: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }],
      },
    });

    const totalSubordinateBps = rules.reduce((sum, rule) => sum + rule.percentageBps, 0);

    if (totalSubordinateBps > parentBps) {
      return {
        valid: false,
        message: `Subordinate commissions (${(totalSubordinateBps / 100).toFixed(2)}%) cannot exceed parent commission (${(parentBps / 100).toFixed(2)}%)`,
      };
    }

    return { valid: true };
  }

  /**
   * Get all rules under a manager (team perspective)
   */
  async getTeamRules(managerId: bigint) {
    const subordinates = await this.prisma.commercialAccount.findMany({
      where: { parentId: managerId },
      select: { id: true, publicId: true, user: { select: { email: true } } },
    });

    const rules = await this.prisma.commercialCommissionRule.findMany({
      where: {
        commercialAccountId: { in: subordinates.map(s => s.id) },
        active: true,
      },
      include: {
        plan: { select: { publicId: true, name: true } },
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    return {
      subordinates,
      rules,
    };
  }
}
