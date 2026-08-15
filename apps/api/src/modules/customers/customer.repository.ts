import { Prisma, type PrismaClient } from '../../database-client/client.js';

const include = { primaryUnit: { select: { publicId: true } } } as const;

/** Agregações vindas de `$queryRaw`: MySQL devolve Decimal, string ou BigInt. */
export type RawSum = bigint | number | string | { toString: () => string } | null;

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
      select: { type: true, direction: true, amount: true, reason: true, createdAt: true },
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
  /**
   * Total pago por cliente em uma única consulta — evita N+1 na listagem.
   * `SUM()` do MySQL chega como Decimal/string no queryRaw, por isso o tipo aberto.
   */
  public paidTotalsByCustomer(tenantId: bigint, customerIds: bigint[]) {
    if (customerIds.length === 0)
      return Promise.resolve([] as { customerId: bigint; paidTotalCents: RawSum }[]);
    return this.client.$queryRaw<{ customerId: bigint; paidTotalCents: RawSum }[]>(
      Prisma.sql`
      SELECT a.customer_id AS customerId, SUM(p.amount_cents) AS paidTotalCents
      FROM payments p
      INNER JOIN appointments a ON a.id = p.appointment_id
      WHERE p.tenant_id = ${tenantId}
        AND p.status = 'PAID'
        AND a.customer_id IN (${Prisma.join(customerIds)})
      GROUP BY a.customer_id
    `,
    );
  }
  /** Último atendimento concluído e próximo agendamento, com serviço e profissional. */
  public highlightsByCustomer(tenantId: bigint, customerIds: bigint[], now: Date) {
    if (customerIds.length === 0)
      return Promise.resolve(
        [] as {
          customerId: bigint;
          startsAt: Date;
          status: string;
          serviceName: string;
          professionalName: string;
        }[],
      );
    return this.client.$queryRaw<
      {
        customerId: bigint;
        startsAt: Date;
        status: string;
        serviceName: string;
        professionalName: string;
      }[]
    >(Prisma.sql`
      SELECT a.customer_id AS customerId, a.starts_at AS startsAt, a.status AS status,
             s.name AS serviceName, pr.public_name AS professionalName
      FROM appointments a
      INNER JOIN services s ON s.id = a.service_id
      INNER JOIN professionals pr ON pr.id = a.professional_id
      WHERE a.tenant_id = ${tenantId}
        AND a.customer_id IN (${Prisma.join(customerIds)})
        AND (
          a.id IN (
            SELECT MAX(x.id) FROM appointments x
            WHERE x.tenant_id = ${tenantId} AND x.status = 'COMPLETED'
              AND x.customer_id IN (${Prisma.join(customerIds)})
            GROUP BY x.customer_id
          )
          OR a.id IN (
            SELECT MIN(y.id) FROM appointments y
            WHERE y.tenant_id = ${tenantId}
              AND y.status IN ('PENDING', 'CONFIRMED', 'IN_PROGRESS')
              AND y.starts_at >= ${now}
              AND y.customer_id IN (${Prisma.join(customerIds)})
            GROUP BY y.customer_id
          )
        )
    `);
  }
  /** Indicadores da base inteira, independentes da página. */
  public async crmMetrics(
    tenantId: bigint,
    now: Date,
    newSince: Date,
    noReturnBefore: Date | null,
  ) {
    const scheduledWhere: Prisma.CustomerWhereInput = {
      tenantId,
      appointments: {
        some: {
          startsAt: { gte: now },
          status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
        },
      },
    };
    const [active, scheduled, created, noReturn, recurringRows] = await Promise.all([
      this.client.customer.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.client.customer.count({ where: scheduledWhere }),
      this.client.customer.count({ where: { tenantId, createdAt: { gte: newSince } } }),
      noReturnBefore === null
        ? Promise.resolve(0)
        : this.client.customer.count({
            where: {
              tenantId,
              appointments: { some: { status: 'COMPLETED', startsAt: { lt: noReturnBefore } } },
              NOT: { appointments: { some: { startsAt: { gte: noReturnBefore } } } },
            },
          }),
      this.client.$queryRaw<{ total: bigint }[]>(Prisma.sql`
        SELECT COUNT(*) AS total FROM (
          SELECT customer_id FROM appointments
          WHERE tenant_id = ${tenantId} AND status = 'COMPLETED'
          GROUP BY customer_id HAVING COUNT(*) > 1
        ) AS recurring
      `),
    ]);
    return {
      active,
      scheduled,
      new: created,
      noReturn,
      recurring: Number(recurringRows[0]?.total ?? 0),
    };
  }
  /** Ids de clientes com mais de um atendimento concluído (segmento Recorrente). */
  public async recurringCustomerIds(tenantId: bigint) {
    const rows = await this.client.$queryRaw<{ customerId: bigint }[]>(Prisma.sql`
      SELECT customer_id AS customerId FROM appointments
      WHERE tenant_id = ${tenantId} AND status = 'COMPLETED'
      GROUP BY customer_id HAVING COUNT(*) > 1
    `);
    return rows.map((row) => row.customerId);
  }
  public reviewsForCustomer(tenantId: bigint, customerId: bigint) {
    return this.client.appointmentReview.findMany({
      where: { tenantId, customerId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        publicId: true,
        rating: true,
        comment: true,
        createdAt: true,
        service: { select: { name: true } },
        professional: { select: { publicName: true } },
      },
    });
  }
  /** Eventos de agenda do cliente, base da timeline de relacionamento. */
  public historyForCustomer(tenantId: bigint, customerId: bigint) {
    return this.client.appointmentHistoryEntry.findMany({
      where: { tenantId, appointment: { customerId } },
      orderBy: { createdAt: 'desc' },
      take: 60,
      select: {
        publicId: true,
        action: true,
        previousStatus: true,
        newStatus: true,
        newStartsAt: true,
        reason: true,
        createdAt: true,
        appointment: {
          select: {
            publicId: true,
            source: true,
            service: { select: { name: true } },
            professional: { select: { publicName: true } },
          },
        },
      },
    });
  }
  public recoveryRules(tenantId: bigint) {
    return this.client.customerRecoveryRule.findMany({
      where: { tenantId },
      select: { rule: true, days: true, active: true },
    });
  }
  public whatsappConversation(tenantId: bigint, customerId: bigint) {
    return this.client.whatsAppConversation.findFirst({
      where: { tenantId, customerId },
      orderBy: { lastInboundAt: 'desc' },
      select: { lastInboundAt: true, lastOutboundAt: true, status: true },
    });
  }
  public audit(data: Prisma.AuditLogUncheckedCreateInput) {
    return this.client.auditLog.create({ data });
  }
}
