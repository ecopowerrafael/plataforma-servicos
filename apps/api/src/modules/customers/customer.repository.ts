import { Prisma, type PrismaClient } from '../../database-client/client.js';

const include = { primaryUnit: { select: { publicId: true } } } as const;

export class CustomerRepository {
  public constructor(private readonly client: PrismaClient) {}

  public async list(
    where: Prisma.CustomerWhereInput,
    page: number,
    limit: number,
    orderBy: Prisma.CustomerOrderByWithRelationInput,
  ) {
    const [total, items] = await this.client.$transaction([
      this.client.customer.count({ where }),
      this.client.customer.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include,
      }),
    ]);
    return { total, items };
  }

  public find(tenantId: bigint, publicId: string) {
    return this.client.customer.findFirst({ where: { tenantId, publicId }, include });
  }
  public appointmentSummaries(tenantId: bigint, customerIds: bigint[], now: Date) {
    if (customerIds.length === 0)
      return Promise.resolve(
        [] as {
          customerId: bigint;
          appointmentCount: bigint;
          lastCompletedAt: Date | null;
          nextAppointmentAt: Date | null;
        }[],
      );
    return this.client.$queryRaw<
      {
        customerId: bigint;
        appointmentCount: bigint;
        lastCompletedAt: Date | null;
        nextAppointmentAt: Date | null;
      }[]
    >(Prisma.sql`
      SELECT
        customer_id AS customerId,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS appointmentCount,
        MAX(CASE WHEN status = 'COMPLETED' THEN starts_at END) AS lastCompletedAt,
        MIN(CASE WHEN status IN ('PENDING', 'CONFIRMED', 'IN_PROGRESS') AND starts_at >= ${now}
          THEN starts_at END) AS nextAppointmentAt
      FROM appointments
      WHERE tenant_id = ${tenantId} AND customer_id IN (${Prisma.join(customerIds)})
      GROUP BY customer_id
    `);
  }
  public appointmentsForCustomer(tenantId: bigint, customerId: bigint) {
    return this.client.appointment.findMany({
      where: { tenantId, customerId },
      orderBy: { startsAt: 'desc' },
      select: {
        publicId: true,
        startsAt: true,
        priceCents: true,
        status: true,
        professional: { select: { publicId: true, publicName: true } },
        service: { select: { publicId: true, name: true } },
        unit: { select: { publicId: true, name: true } },
      },
    });
  }
  public loyaltyForCustomer(tenantId: bigint, customerId: bigint) {
    return this.client.loyaltyLedgerEntry.findMany({
      where: { tenantId, customerId },
      orderBy: { createdAt: 'desc' },
      select: { type: true, direction: true, amount: true },
    });
  }
  public couponsForCustomer(tenantId: bigint, customerId: bigint) {
    return this.client.couponRedemption.findMany({
      where: { tenantId, customerId, canceledAt: null },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, coupon: { select: { code: true } } },
    });
  }
  public waitlistForCustomer(tenantId: bigint, customerId: bigint) {
    return this.client.appointmentWaitlist.findMany({
      where: { tenantId, customerId, status: { in: ['WAITING', 'MATCHED'] } },
      orderBy: { createdAt: 'asc' },
      select: {
        publicId: true,
        preferredDateFrom: true,
        preferredDateTo: true,
        preferredTimeStart: true,
        preferredTimeEnd: true,
        status: true,
        service: { select: { name: true } },
        professional: { select: { publicName: true } },
        unit: { select: { name: true } },
      },
    });
  }
  public paymentsForCustomer(tenantId: bigint, customerId: bigint) {
    return this.client.payment.findMany({
      where: { tenantId, appointment: { customerId }, status: 'PAID' },
      orderBy: { createdAt: 'desc' },
      select: {
        publicId: true,
        amountCents: true,
        kind: true,
        createdAt: true,
        appointment: { select: { publicId: true } },
      },
    });
  }
  public findByEmail(tenantId: bigint, email: string) {
    return this.client.customer.findFirst({ where: { tenantId, email }, include });
  }
  public findByContact(tenantId: bigint, phone: string | null, email: string | null) {
    const or: Prisma.CustomerWhereInput[] = [];
    if (phone !== null) or.push({ phone });
    if (email !== null) or.push({ email });
    if (or.length === 0) return Promise.resolve(null);
    return this.client.customer.findFirst({ where: { tenantId, OR: or }, include });
  }
  public create(data: Prisma.CustomerUncheckedCreateInput) {
    return this.client.customer.create({ data, include });
  }
  public update(id: bigint, data: Prisma.CustomerUncheckedUpdateInput) {
    return this.client.customer.update({ where: { id }, data, include });
  }
  public findUnit(tenantId: bigint, publicId: string) {
    return this.client.businessUnit.findFirst({
      where: { tenantId, publicId, status: 'ACTIVE' },
      select: { id: true },
    });
  }
  public tenantProfile(tenantId: bigint) {
    return this.client.tenant.findUnique({
      where: { id: tenantId },
      select: { businessProfile: true },
    });
  }
  public fields(tenantId: bigint) {
    return this.client.tenantCustomFieldDefinition.findMany({
      where: { tenantId, scope: 'CUSTOMER' },
      select: {
        publicId: true,
        key: true,
        label: true,
        description: true,
        type: true,
        scope: true,
        required: true,
        active: true,
        sortOrder: true,
        options: true,
        validation: true,
        source: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
    });
  }
  public audit(data: Prisma.AuditLogUncheckedCreateInput) {
    return this.client.auditLog.create({ data });
  }
}
