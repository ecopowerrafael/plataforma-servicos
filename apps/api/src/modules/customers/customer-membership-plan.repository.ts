import { Prisma, type PrismaClient } from '../../database-client/client.js';

export class CustomerMembershipPlanRepository {
  public constructor(private readonly client: PrismaClient) {}

  public list(tenantId: bigint) {
    return this.client.customerMembershipPlan.findMany({
      where: { tenantId },
      include: { benefits: { include: { service: { select: { publicId: true, name: true } } } } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  public find(tenantId: bigint, publicId: string) {
    return this.client.customerMembershipPlan.findFirst({
      where: { tenantId, publicId },
      include: { benefits: { include: { service: { select: { publicId: true, name: true } } } } },
    });
  }

  public create(data: Prisma.CustomerMembershipPlanUncheckedCreateInput) {
    return this.client.customerMembershipPlan.create({
      data,
      include: { benefits: { include: { service: { select: { publicId: true, name: true } } } } },
    });
  }

  public update(id: bigint, data: Prisma.CustomerMembershipPlanUpdateInput) {
    return this.client.customerMembershipPlan.update({
      where: { id },
      data,
      include: { benefits: { include: { service: { select: { publicId: true, name: true } } } } },
    });
  }

  public delete(id: bigint) {
    return this.client.customerMembershipPlan.delete({
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
        targetType: 'customer_membership_plan',
        targetPublicId: publicId,
      },
    });
  }
}
