import { randomUUID } from 'node:crypto';

import {
  CustomerCrmProfileSchema,
  CustomerListResponseSchema,
  CustomerPublicSchema,
  TenantCustomFieldsResponseSchema,
  type CreateCustomerRequest,
  type UpdateCustomerRequest,
} from '@plataforma/shared';

import {
  averageIntervalDays,
  daysSince,
  deriveSegments,
  isRecoveryEligible,
  relationshipWindowsFromRules,
  type CustomerSegment,
} from './customer-crm.js';
import { type CustomerRepository, type RawSum } from './customer.repository.js';
import { type Prisma } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
interface Actor {
  userId: bigint;
  sessionId: bigint;
}
interface List {
  page: number;
  limit: number;
  search?: string | undefined;
  status?: boolean | undefined;
  unitPublicId?: string | undefined;
  orderBy: 'name' | 'createdAt';
  direction: 'asc' | 'desc';
  segment?: CustomerSegment | undefined;
  professionalPublicId?: string | undefined;
  servicePublicId?: string | undefined;
}
const publicValue = (item: Awaited<ReturnType<CustomerRepository['find']>> & {}) =>
  CustomerPublicSchema.parse({
    publicId: item.publicId,
    name: item.name,
    socialName: item.socialName,
    phone: item.phone,
    whatsapp: item.whatsapp,
    email: item.email,
    birthDate: item.birthDate?.toISOString().slice(0, 10) ?? null,
    document: item.document,
    notes: item.notes,
    source: item.source,
    acceptsCommunications: item.acceptsCommunications,
    primaryUnitPublicId: item.primaryUnit?.publicId ?? null,
    customFields: item.customFields ?? {},
    status: item.status,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  });
const statusTimelineLabel = (status: string) =>
  status === 'CONFIRMED'
    ? 'Agendamento confirmado'
    : status === 'IN_PROGRESS'
      ? 'Atendimento iniciado'
      : status === 'COMPLETED'
        ? 'Atendimento concluído'
        : status === 'CANCELED'
          ? 'Agendamento cancelado'
          : status === 'NO_SHOW'
            ? 'Falta registrada'
            : 'Status atualizado';

const sourceTimelineLabel = (source: string) =>
  source === 'PUBLIC_BOOKING'
    ? 'pelo site'
    : source === 'CUSTOMER_PORTAL'
      ? 'pela área do cliente'
      : source === 'WAITLIST'
        ? 'pela lista de espera'
        : 'pelo painel';

/**
 * Timeline composta a partir de eventos reais já persistidos: histórico do agendamento,
 * pagamentos, avaliações e movimentos de fidelidade. Nada é sintetizado.
 */
function buildTimeline(
  history: {
    action: string;
    newStatus: string | null;
    reason: string | null;
    createdAt: Date;
    appointment: {
      publicId: string;
      source: string;
      service: { name: string };
      professional: { publicName: string };
    };
  }[],
  payments: {
    amountCents: bigint;
    kind: string;
    createdAt: Date;
    appointment: { publicId: string };
  }[],
  reviews: { rating: number; comment: string | null; createdAt: Date; service: { name: string } }[],
  loyalty: { type: string; direction: string; amount: bigint; createdAt: Date }[],
) {
  const entries: {
    kind: string;
    at: string;
    title: string;
    description: string | null;
    appointmentPublicId: string | null;
    amountCents: string | null;
  }[] = [];
  for (const entry of history) {
    const context = `${entry.appointment.service.name} · ${entry.appointment.professional.publicName}`;
    if (entry.action === 'CREATED')
      entries.push({
        kind: 'APPOINTMENT_CREATED',
        at: entry.createdAt.toISOString(),
        title: `Agendamento criado ${sourceTimelineLabel(entry.appointment.source)}`,
        description: context,
        appointmentPublicId: entry.appointment.publicId,
        amountCents: null,
      });
    else if (entry.action === 'RESCHEDULED')
      entries.push({
        kind: 'APPOINTMENT_RESCHEDULED',
        at: entry.createdAt.toISOString(),
        title: 'Agendamento reagendado',
        description: entry.reason ?? context,
        appointmentPublicId: entry.appointment.publicId,
        amountCents: null,
      });
    else if (entry.action === 'CHECKED_IN')
      entries.push({
        kind: 'CHECK_IN',
        at: entry.createdAt.toISOString(),
        title: 'Cliente chegou',
        description: context,
        appointmentPublicId: entry.appointment.publicId,
        amountCents: null,
      });
    else
      entries.push({
        kind: 'APPOINTMENT_STATUS',
        at: entry.createdAt.toISOString(),
        title: statusTimelineLabel(entry.newStatus ?? ''),
        description: entry.reason ?? context,
        appointmentPublicId: entry.appointment.publicId,
        amountCents: null,
      });
  }
  for (const payment of payments)
    entries.push({
      kind: 'PAYMENT',
      at: payment.createdAt.toISOString(),
      title: payment.kind === 'DEPOSIT' ? 'Sinal recebido' : 'Pagamento recebido',
      description: null,
      appointmentPublicId: payment.appointment.publicId,
      amountCents: payment.amountCents.toString(),
    });
  for (const review of reviews)
    entries.push({
      kind: 'REVIEW',
      at: review.createdAt.toISOString(),
      title: `Avaliação ${String(review.rating)}/5`,
      description: review.comment ?? review.service.name,
      appointmentPublicId: null,
      amountCents: null,
    });
  for (const entry of loyalty)
    entries.push({
      kind: 'LOYALTY',
      at: entry.createdAt.toISOString(),
      title:
        entry.direction === 'CREDIT'
          ? `Créditos de fidelidade (${entry.type === 'POINTS' ? 'pontos' : 'cashback'})`
          : `Resgate de fidelidade (${entry.type === 'POINTS' ? 'pontos' : 'cashback'})`,
      description: null,
      appointmentPublicId: null,
      amountCents: null,
    });
  return entries.sort((left, right) => right.at.localeCompare(left.at)).slice(0, 60);
}

/** Normaliza agregações do MySQL (Decimal/string/BigInt) em centavos inteiros. */
const toCents = (value: RawSum): bigint => {
  if (value === null) return 0n;
  const [integer = '0'] = String(value).split('.');
  return /^-?\d+$/u.test(integer) ? BigInt(integer) : 0n;
};

export class CustomerService {
  public constructor(private readonly repo: CustomerRepository) {}
  async list(
    t: bigint,
    i: List,
    options: { includeFinancial: boolean } = { includeFinancial: false },
  ) {
    const unit =
      i.unitPublicId === undefined ? undefined : await this.repo.findUnit(t, i.unitPublicId);
    const segmentWhere = await this.segmentWhere(t, i.segment);
    const { total, items } = await this.repo.list(
      {
        tenantId: t,
        ...(i.search === undefined
          ? {}
          : {
              OR: [
                { name: { contains: i.search } },
                { email: { contains: i.search } },
                { phone: { contains: i.search } },
              ],
            }),
        ...(i.status === undefined ? {} : { status: i.status ? 'ACTIVE' : 'INACTIVE' }),
        ...(unit === undefined ? {} : { primaryUnitId: unit?.id ?? BigInt(-1) }),
        ...(i.professionalPublicId === undefined
          ? {}
          : { appointments: { some: { professional: { publicId: i.professionalPublicId } } } }),
        ...(i.servicePublicId === undefined
          ? {}
          : { appointments: { some: { service: { publicId: i.servicePublicId } } } }),
        ...segmentWhere,
      },
      i.page,
      i.limit,
      { [i.orderBy]: i.direction },
    );
    const now = new Date();
    const ids = items.map((item) => item.id);
    const rules = await this.repo.recoveryRules(t);
    const windows = relationshipWindowsFromRules(rules);
    const noReturnBefore =
      windows.noReturnAfterDays === null
        ? null
        : new Date(now.getTime() - windows.noReturnAfterDays * 86_400_000);
    const [summaries, highlights, paidTotals, metrics] = await Promise.all([
      this.repo.appointmentSummaries(t, ids, now),
      this.repo.highlightsByCustomer(t, ids, now),
      options.includeFinancial
        ? this.repo.paidTotalsByCustomer(t, ids)
        : Promise.resolve([] as { customerId: bigint; paidTotalCents: RawSum }[]),
      this.repo.crmMetrics(
        t,
        now,
        new Date(now.getTime() - windows.newWithinDays * 86_400_000),
        noReturnBefore,
      ),
    ]);
    const byCustomer = new Map(summaries.map((summary) => [summary.customerId, summary]));
    const paidByCustomer = new Map(
      paidTotals.map((entry) => [entry.customerId, toCents(entry.paidTotalCents)]),
    );
    const lastByCustomer = new Map<bigint, (typeof highlights)[number]>();
    const nextByCustomer = new Map<bigint, (typeof highlights)[number]>();
    for (const entry of highlights)
      if (entry.status === 'COMPLETED') lastByCustomer.set(entry.customerId, entry);
      else nextByCustomer.set(entry.customerId, entry);
    return CustomerListResponseSchema.parse({
      items: items.map((item) => {
        const summary = byCustomer.get(item.id);
        const completedCount = Number(summary?.appointmentCount ?? 0);
        const paid = paidByCustomer.get(item.id) ?? 0n;
        const segments = deriveSegments(
          {
            createdAt: item.createdAt,
            completedCount,
            lastCompletedAt: summary?.lastCompletedAt ?? null,
            nextAppointmentAt: summary?.nextAppointmentAt ?? null,
          },
          windows,
          now,
        );
        return {
          ...publicValue(item),
          lastCompletedAt: summary?.lastCompletedAt?.toISOString() ?? null,
          nextAppointmentAt: summary?.nextAppointmentAt?.toISOString() ?? null,
          appointmentCount: completedCount,
          segments,
          paidTotalCents: options.includeFinancial ? paid.toString() : null,
          averageTicketCents:
            options.includeFinancial && completedCount > 0
              ? (paid / BigInt(completedCount)).toString()
              : null,
          lastServiceName: lastByCustomer.get(item.id)?.serviceName ?? null,
          lastProfessionalName: lastByCustomer.get(item.id)?.professionalName ?? null,
          nextServiceName: nextByCustomer.get(item.id)?.serviceName ?? null,
        };
      }),
      page: { page: i.page, limit: i.limit, total, totalPages: Math.ceil(total / i.limit) },
      metrics,
    });
  }
  /** Traduz o segmento derivado em filtro real de banco — sem estado persistido. */
  private async segmentWhere(
    t: bigint,
    segment: CustomerSegment | undefined,
  ): Promise<Prisma.CustomerWhereInput> {
    if (segment === undefined) return {};
    const now = new Date();
    const windows = relationshipWindowsFromRules(await this.repo.recoveryRules(t));
    const activeStatuses = ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] as const;
    if (segment === 'SCHEDULED')
      return {
        appointments: { some: { startsAt: { gte: now }, status: { in: [...activeStatuses] } } },
      };
    if (segment === 'NEW')
      return { createdAt: { gte: new Date(now.getTime() - windows.newWithinDays * 86_400_000) } };
    if (segment === 'RECURRING') return { id: { in: await this.repo.recurringCustomerIds(t) } };
    const days =
      segment === 'NO_RETURN' ? windows.noReturnAfterDays : windows.inactiveAfterDays;
    // Sem regra configurada no módulo de Recuperação não há corte confiável: não filtra nada.
    if (days === null) return {};
    const cutoff = new Date(now.getTime() - days * 86_400_000);
    return {
      NOT: { appointments: { some: { startsAt: { gte: cutoff } } } },
      ...(segment === 'NO_RETURN'
        ? { appointments: { some: { status: 'COMPLETED', startsAt: { lt: cutoff } } } }
        : {}),
    };
  }
  async get(t: bigint, id: string) {
    const x = await this.repo.find(t, id);
    if (x === null) throw this.err('CUSTOMER_NOT_FOUND', 'Cliente não encontrado.', 404);
    return publicValue(x);
  }
  async crmProfile(
    t: bigint,
    id: string,
    options: { includeFinancial: boolean } = { includeFinancial: false },
  ) {
    const customer = await this.repo.find(t, id);
    if (customer === null) throw this.err('CUSTOMER_NOT_FOUND', 'Cliente não encontrado.', 404);
    const [appointments, loyalty, coupons, waitlist, payments, reviews, history, rules, whatsapp] =
      await Promise.all([
        this.repo.appointmentsForCustomer(t, customer.id),
        this.repo.loyaltyForCustomer(t, customer.id),
        this.repo.couponsForCustomer(t, customer.id),
        this.repo.waitlistForCustomer(t, customer.id),
        options.includeFinancial
          ? this.repo.paymentsForCustomer(t, customer.id)
          : Promise.resolve([] as Awaited<ReturnType<CustomerRepository['paymentsForCustomer']>>),
        this.repo.reviewsForCustomer(t, customer.id),
        this.repo.historyForCustomer(t, customer.id),
        this.repo.recoveryRules(t),
        this.repo.whatsappConversation(t, customer.id),
      ]);
    const appointmentValues = appointments.map((appointment) => ({
      publicId: appointment.publicId,
      startsAt: appointment.startsAt.toISOString(),
      priceCents: appointment.priceCents.toString(),
      status: appointment.status,
      professionalPublicId: appointment.professional.publicId,
      professionalName: appointment.professional.publicName,
      servicePublicId: appointment.service.publicId,
      serviceName: appointment.service.name,
      unitPublicId: appointment.unit?.publicId ?? null,
      unitName: appointment.unit?.name ?? null,
    }));
    const completed = appointmentValues.filter((appointment) => appointment.status === 'COMPLETED');
    const nextAppointment =
      appointmentValues
        .filter(
          (appointment) =>
            ['PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(appointment.status) &&
            new Date(appointment.startsAt).getTime() >= Date.now(),
        )
        .sort((left, right) => left.startsAt.localeCompare(right.startsAt))[0] ?? null;
    const rank = (
      values: typeof completed,
      get: (value: (typeof completed)[number]) => { publicId: string; name: string },
    ) => {
      const counts = new Map<string, { publicId: string; name: string; count: number }>();
      for (const value of values) {
        const item = get(value);
        const current = counts.get(item.publicId);
        counts.set(item.publicId, { ...item, count: (current?.count ?? 0) + 1 });
      }
      return [...counts.values()].sort((left, right) => right.count - left.count).slice(0, 5);
    };
    const balances = new Map<'POINTS' | 'CASHBACK', bigint>([
      ['POINTS', 0n],
      ['CASHBACK', 0n],
    ]);
    for (const entry of loyalty)
      balances.set(
        entry.type,
        (balances.get(entry.type) ?? 0n) +
          (entry.direction === 'CREDIT' ? entry.amount : -entry.amount),
      );
    const paidTotal = payments.reduce((total, payment) => total + payment.amountCents, 0n);
    const now = new Date();
    const completedDates = appointments
      .filter((appointment) => appointment.status === 'COMPLETED')
      .map((appointment) => appointment.startsAt);
    const lastCompletedDate =
      completedDates.length === 0
        ? null
        : completedDates.reduce((latest, value) => (value > latest ? value : latest));
    const windows = relationshipWindowsFromRules(rules);
    const segments = deriveSegments(
      {
        createdAt: customer.createdAt,
        completedCount: completed.length,
        lastCompletedAt: lastCompletedDate,
        nextAppointmentAt: nextAppointment === null ? null : new Date(nextAppointment.startsAt),
      },
      windows,
      now,
    );
    const timeline = buildTimeline(history, payments, reviews, loyalty);
    return CustomerCrmProfileSchema.parse({
      customer: publicValue(customer),
      appointments: appointmentValues,
      summary: {
        completedCount: completed.length,
        canceledCount: appointmentValues.filter((item) => item.status === 'CANCELED').length,
        noShowCount: appointmentValues.filter((item) => item.status === 'NO_SHOW').length,
        nextAppointment,
        lastCompleted: completed[0] ?? null,
        recurringServices: rank(completed, (item) => ({
          publicId: item.servicePublicId,
          name: item.serviceName,
        })),
        recurringProfessionals: rank(completed, (item) => ({
          publicId: item.professionalPublicId,
          name: item.professionalName,
        })),
      },
      relationship: {
        loyaltyBalances: [...balances].map(([type, balance]) => ({
          type,
          balance: balance.toString(),
        })),
        usedCoupons: coupons.map((item) => ({
          code: item.coupon.code,
          usedAt: item.createdAt.toISOString(),
        })),
        waitlist: waitlist.map((item) => ({
          publicId: item.publicId,
          serviceName: item.service.name,
          professionalName: item.professional?.publicName ?? null,
          unitName: item.unit.name,
          preferredDateFrom: item.preferredDateFrom.toISOString().slice(0, 10),
          preferredDateTo: item.preferredDateTo.toISOString().slice(0, 10),
          preferredTimeStart: item.preferredTimeStart,
          preferredTimeEnd: item.preferredTimeEnd,
          status: item.status,
        })),
      },
      financial: options.includeFinancial
        ? {
            paidTotalCents: paidTotal.toString(),
            paidCount: payments.length,
            averageTicketCents:
              completed.length === 0 ? '0' : (paidTotal / BigInt(completed.length)).toString(),
            recentPayments: payments.slice(0, 20).map((item) => ({
              publicId: item.publicId,
              amountCents: item.amountCents.toString(),
              kind: item.kind,
              createdAt: item.createdAt.toISOString(),
              appointmentPublicId: item.appointment.publicId,
            })),
          }
        : null,
      reviews: reviews.map((review) => ({
        publicId: review.publicId,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt.toISOString(),
        serviceName: review.service.name,
        professionalName: review.professional.publicName,
      })),
      timeline,
      relationshipStatus: {
        segments,
        daysSinceLastVisit: daysSince(lastCompletedDate, now),
        averageIntervalDays: averageIntervalDays(completedDates),
        noReturnAfterDays: windows.noReturnAfterDays,
        inactiveAfterDays: windows.inactiveAfterDays,
        recoveryEligible: isRecoveryEligible(segments, rules),
      },
      whatsapp:
        whatsapp === null
          ? null
          : {
              lastInboundAt: whatsapp.lastInboundAt.toISOString(),
              lastOutboundAt: whatsapp.lastOutboundAt?.toISOString() ?? null,
              status: whatsapp.status,
            },
    });
  }
  async customFields(t: bigint) {
    const tenant = await this.repo.tenantProfile(t);
    if (tenant === null) throw this.err('TENANT_NOT_FOUND', 'Estabelecimento não encontrado.', 404);
    return TenantCustomFieldsResponseSchema.parse({
      profile: tenant.businessProfile,
      fields: (await this.repo.fields(t)).map(({ sortOrder, ...field }) => ({
        ...field,
        options: field.options ?? undefined,
        validation: field.validation ?? undefined,
        order: sortOrder,
        createdAt: field.createdAt.toISOString(),
        updatedAt: field.updatedAt.toISOString(),
      })),
    });
  }
  async create(t: bigint, i: CreateCustomerRequest, a: Actor) {
    const x = await this.repo.create({
      publicId: randomUUID(),
      tenantId: t,
      ...(await this.data(t, i)),
    });
    await this.audit(t, x.publicId, 'customer.created', a);
    return publicValue(x);
  }
  async identifyOrCreatePublic(
    t: bigint,
    input: { name: string; phone?: string | null; email?: string | null },
  ) {
    const phone = input.phone ?? null;
    const email = input.email ?? null;
    const existing = await this.repo.findByContact(t, phone, email);
    if (existing !== null) return publicValue(existing);
    const created = await this.repo.create({
      publicId: randomUUID(),
      tenantId: t,
      name: input.name,
      socialName: null,
      phone,
      whatsapp: null,
      email,
      birthDate: null,
      document: null,
      notes: null,
      status: 'ACTIVE',
      source: 'PUBLIC_BOOKING',
      acceptsCommunications: false,
      primaryUnitId: null,
      customFields: {},
    });
    await this.repo.audit({
      publicId: randomUUID(),
      tenantId: t,
      userId: null,
      sessionId: null,
      action: 'customer.created_public',
      targetType: 'customer',
      targetPublicId: created.publicId,
    });
    return publicValue(created);
  }
  async update(t: bigint, id: string, i: UpdateCustomerRequest, a: Actor) {
    const old = await this.repo.find(t, id);
    if (old === null) throw this.err('CUSTOMER_NOT_FOUND', 'Cliente não encontrado.', 404);
    const x = await this.repo.update(old.id, await this.data(t, i));
    await this.audit(t, id, 'customer.updated', a);
    return publicValue(x);
  }
  async status(t: bigint, id: string, active: boolean, a: Actor) {
    const old = await this.repo.find(t, id);
    if (old === null) throw this.err('CUSTOMER_NOT_FOUND', 'Cliente não encontrado.', 404);
    await this.repo.update(old.id, { status: active ? 'ACTIVE' : 'INACTIVE' });
    await this.audit(t, id, active ? 'customer.activated' : 'customer.deactivated', a);
  }
  private async data(t: bigint, i: CreateCustomerRequest | UpdateCustomerRequest) {
    const unit =
      i.primaryUnitPublicId === null || i.primaryUnitPublicId === undefined
        ? null
        : await this.repo.findUnit(t, i.primaryUnitPublicId);
    if (i.primaryUnitPublicId !== null && i.primaryUnitPublicId !== undefined && unit === null)
      throw this.err('CUSTOMER_UNIT_NOT_FOUND', 'Unidade principal não encontrada.', 400);
    const fields = await this.repo.fields(t);
    const available = new Map(
      fields.filter((field) => field.active).map((field) => [field.key, field]),
    );
    for (const key of Object.keys(i.customFields)) {
      if (!available.has(key))
        throw this.err('CUSTOMER_CUSTOM_FIELD_UNKNOWN', 'Campo adicional indisponível.', 400);
    }
    for (const f of fields) {
      if (f.required && f.active && i.customFields[f.key] === undefined)
        throw this.err('CUSTOMER_CUSTOM_FIELD_REQUIRED', 'Preencha os campos obrigatórios.', 400);
    }
    return {
      name: i.name,
      socialName: i.socialName ?? null,
      phone: i.phone ?? null,
      whatsapp: i.whatsapp ?? null,
      email: i.email ?? null,
      birthDate:
        i.birthDate === null || i.birthDate === undefined
          ? null
          : new Date(`${i.birthDate}T00:00:00.000Z`),
      document: i.document ?? null,
      notes: i.notes ?? null,
      status: i.status,
      source: i.source,
      acceptsCommunications: i.acceptsCommunications,
      primaryUnitId: unit?.id ?? null,
      customFields: i.customFields as Prisma.InputJsonValue,
    };
  }
  private err(code: string, message: string, statusCode: number) {
    return new AppError({ code, message, statusCode });
  }
  private async audit(t: bigint, id: string, action: string, a: Actor) {
    await this.repo.audit({
      publicId: randomUUID(),
      tenantId: t,
      userId: a.userId,
      sessionId: a.sessionId,
      action,
      targetType: 'customer',
      targetPublicId: id,
    });
  }
}
