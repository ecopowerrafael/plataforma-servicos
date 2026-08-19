import { Prisma, type PrismaClient } from '../../database-client/client.js';

export class CustomerMembershipRepository {
  public constructor(private readonly client: PrismaClient) {}

  public list(tenantId: bigint, customerId: bigint) {
    return this.client.customerMembership.findMany({
      where: { tenantId, customerId },
      include: { plan: true },
    });
  }

  public find(tenantId: bigint, publicId: string) {
    return this.client.customerMembership.findFirst({
      where: { tenantId, publicId },
      include: { plan: true, charges: true },
    });
  }

  public findByCustomer(tenantId: bigint, customerId: bigint) {
    return this.client.customerMembership.findFirst({
      where: { tenantId, customerId },
      include: { plan: true, charges: true },
    });
  }

  public findById(id: bigint) {
    return this.client.customerMembership.findFirst({
      where: { id },
      include: { plan: { include: { benefits: true } } },
    });
  }

  public findPlan(tenantId: bigint, planPublicId: string) {
    return this.client.customerMembershipPlan.findFirst({
      where: { tenantId, publicId: planPublicId },
      include: { benefits: true },
    });
  }

  public findCustomer(tenantId: bigint, customerId: string) {
    return this.client.customer.findFirst({
      where: { tenantId, publicId: customerId },
      select: { id: true },
    });
  }

  public create(data: Prisma.CustomerMembershipUncheckedCreateInput) {
    return this.client.customerMembership.create({
      data,
      include: { plan: true },
    });
  }

  public update(id: bigint, data: Prisma.CustomerMembershipUpdateInput) {
    return this.client.customerMembership.update({
      where: { id },
      data,
      include: { plan: true },
    });
  }

  public delete(id: bigint) {
    return this.client.customerMembership.delete({
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
        targetType: 'customer_membership',
        targetPublicId: publicId,
      },
    });
  }
}
