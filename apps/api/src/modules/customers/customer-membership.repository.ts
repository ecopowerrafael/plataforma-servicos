import { Prisma, type PrismaClient } from '../../database-client/client.js';

export class CustomerMembershipRepository {
  public constructor(private readonly client: PrismaClient) {}

  public list(tenantId: bigint, customerId: bigint) {
    return this.client.customerMembership.findMany({
      where: { tenantId, customerId },
      include: { plan: true },
    });
  }

  public async listByTenant(
    tenantId: bigint,
    options: {
      page: number;
      limit: number;
      search?: string;
      planPublicId?: string;
      status?: string;
    },
  ) {
    const skip = (options.page - 1) * options.limit;
    const where: Prisma.CustomerMembershipWhereInput = {
      tenantId,
    };

    if (options.search) {
      where.customer = {
        OR: [
          { name: { contains: options.search } },
          { email: { contains: options.search } },
        ],
      };
    }

    if (options.planPublicId) {
      where.plan = { publicId: options.planPublicId };
    }

    if (options.status) {
      where.status = options.status as any;
    }

    const [items, total] = await Promise.all([
      this.client.customerMembership.findMany({
        where,
        include: {
          customer: { select: { publicId: true, name: true, email: true, avatar: true } },
          plan: { select: { publicId: true, name: true, priceCents: true } },
        },
        skip,
        take: options.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.client.customerMembership.count({ where }),
    ]);

    return { items, total, page: options.page, limit: options.limit };
  }

  public find(tenantId: bigint, publicId: string) {
    return this.client.customerMembership.findFirst({
      where: { tenantId, publicId },
      include: { plan: true, charges: true },
    });
  }

  public findByCustomer(tenantId: bigint, customerId: bigint) {
    return this.client.customerMembership.findFirst({
      where: {
        tenantId,
        customerId,
        status: { in: ['PENDING', 'ACTIVE', 'PAST_DUE', 'PAUSED'] },
      },
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
      where: { tenantId, publicId: planPublicId, active: true },
      include: {
        benefits: {
          include: { service: { select: { publicId: true } } },
        },
      },
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
