import { randomUUID } from 'node:crypto';
import { type PrismaClient, type CustomerMembershipUsage } from '../../database-client/client.js';

export class CustomerMembershipUsageRepository {
  public constructor(private readonly client: PrismaClient) {}

  public async list(tenantId: bigint, membershipId: bigint) {
    return this.client.customerMembershipUsage.findMany({
      where: { tenantId, membershipId },
      orderBy: { createdAt: 'desc' },
    });
  }

  public async find(tenantId: bigint, publicId: string) {
    return this.client.customerMembershipUsage.findFirst({
      where: { tenantId, publicId },
    });
  }

  public async create(data: {
    tenantId: bigint;
    membershipId: bigint;
    membershipChargeId: bigint;
    appointmentId: bigint | null;
    serviceId: bigint;
    quantity: number;
    status: 'RESERVED' | 'CONSUMED' | 'RELEASED' | 'REVERSED';
  }): Promise<CustomerMembershipUsage> {
    return this.client.customerMembershipUsage.create({
      data: {
        publicId: randomUUID(),
        tenantId: data.tenantId,
        membershipId: data.membershipId,
        membershipChargeId: data.membershipChargeId,
        appointmentId: data.appointmentId,
        serviceId: data.serviceId,
        quantity: data.quantity,
        status: data.status,
      },
    });
  }

  public async update(
    id: bigint,
    data: Partial<{
      status: 'RESERVED' | 'CONSUMED' | 'RELEASED' | 'REVERSED';
    }>,
  ): Promise<CustomerMembershipUsage | null> {
    return this.client.customerMembershipUsage.update({
      where: { id },
      data,
    });
  }

  public async countByChargeAndService(chargeId: bigint, serviceId: bigint) {
    const result = await this.client.customerMembershipUsage.groupBy({
      by: ['status'],
      where: {
        membershipChargeId: chargeId,
        serviceId,
        status: { in: ['RESERVED', 'CONSUMED', 'RELEASED'] },
      },
      _count: true,
    });

    const consumed = result.find((r) => r.status === 'CONSUMED')?._count ?? 0;
    const reserved = result.find((r) => r.status === 'RESERVED')?._count ?? 0;
    const released = result.find((r) => r.status === 'RELEASED')?._count ?? 0;

    return { consumed, reserved, released };
  }

  public async findByAppointment(appointmentId: bigint) {
    return this.client.customerMembershipUsage.findFirst({
      where: { appointmentId },
    });
  }

  public async findForTransition(chargeId: bigint, appointmentId: bigint, serviceId: bigint) {
    return this.client.customerMembershipUsage.findFirst({
      where: {
        membershipChargeId: chargeId,
        appointmentId,
        serviceId,
      },
    });
  }
}
