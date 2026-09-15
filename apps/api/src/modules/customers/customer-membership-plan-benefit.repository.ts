import { Prisma, type PrismaClient } from '../../database-client/client.js';

export class CustomerMembershipPlanBenefitRepository {
  public constructor(private readonly client: PrismaClient) {}

  public list(planId: bigint) {
    return this.client.customerMembershipPlanBenefit.findMany({
      where: { planId },
      include: { service: { select: { publicId: true, name: true } } },
    });
  }

  public find(planId: bigint, publicId: string) {
    return this.client.customerMembershipPlanBenefit.findFirst({
      where: { planId, publicId },
      include: { service: { select: { publicId: true, name: true } } },
    });
  }

  public findPlan(tenantId: bigint, planPublicId: string) {
    return this.client.customerMembershipPlan.findFirst({
      where: { tenantId, publicId: planPublicId },
      select: { id: true },
    });
  }

  public findService(tenantId: bigint, servicePublicId: string) {
    return this.client.service.findFirst({
      where: { tenantId, publicId: servicePublicId },
      select: { id: true },
    });
  }

  public create(data: Prisma.CustomerMembershipPlanBenefitUncheckedCreateInput) {
    return this.client.customerMembershipPlanBenefit.create({
      data,
      include: { service: { select: { publicId: true, name: true } } },
    });
  }

  public update(id: bigint, data: Prisma.CustomerMembershipPlanBenefitUpdateInput) {
    return this.client.customerMembershipPlanBenefit.update({
      where: { id },
      data,
      include: { service: { select: { publicId: true, name: true } } },
    });
  }

  public delete(id: bigint) {
    return this.client.customerMembershipPlanBenefit.delete({
      where: { id },
    });
  }

  public async audit(
    publicId: string,
    tenantId: bigint,
    userId: bigint | null,
    sessionId: bigint | null,
    action: string,
  ) {
    await this.client.auditLog.create({
      data: {
        publicId,
        tenantId,
        userId,
        sessionId,
        action,
        targetType: 'customer_membership_plan_benefit',
        targetPublicId: publicId,
      },
    });
  }
}
