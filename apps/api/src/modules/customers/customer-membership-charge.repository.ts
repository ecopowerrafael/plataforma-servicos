import { Prisma, type PrismaClient } from '../../database-client/client.js';

export class CustomerMembershipChargeRepository {
  public constructor(private readonly client: PrismaClient) {}

  public list(tenantId: bigint, membershipId: bigint) {
    return this.client.customerMembershipCharge.findMany({
      where: { tenantId, membershipId },
      include: { payments: true },
      orderBy: { periodStart: 'desc' },
    });
  }

  public find(tenantId: bigint, publicId: string) {
    return this.client.customerMembershipCharge.findFirst({
      where: { tenantId, publicId },
      include: { payments: true },
    });
  }

  public findByMembership(membershipId: bigint, periodStart: Date, periodEnd: Date) {
    return this.client.customerMembershipCharge.findFirst({
      where: {
        membershipId,
        periodStart: { lte: periodEnd },
        periodEnd: { gte: periodStart },
      },
      include: { payments: true },
    });
  }

  public findMembership(tenantId: bigint, membershipPublicId: string) {
    return this.client.customerMembership.findFirst({
      where: { tenantId, publicId: membershipPublicId },
      select: { id: true },
    });
  }

  public create(data: Prisma.CustomerMembershipChargeUncheckedCreateInput) {
    return this.client.customerMembershipCharge.create({
      data,
      include: { payments: true },
    });
  }

  public update(id: bigint, data: Prisma.CustomerMembershipChargeUpdateInput) {
    return this.client.customerMembershipCharge.update({
      where: { id },
      data,
      include: { payments: true },
    });
  }

  public delete(id: bigint) {
    return this.client.customerMembershipCharge.delete({
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
        targetType: 'customer_membership_charge',
        targetPublicId: publicId,
      },
    });
  }
}
