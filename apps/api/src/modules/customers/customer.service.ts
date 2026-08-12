import { randomUUID } from 'node:crypto';

import {
  CustomerCrmProfileSchema,
  CustomerListResponseSchema,
  CustomerPublicSchema,
  TenantCustomFieldsResponseSchema,
  type CreateCustomerRequest,
  type UpdateCustomerRequest,
} from '@plataforma/shared';

import { type CustomerRepository } from './customer.repository.js';
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
export class CustomerService {
  public constructor(private readonly repo: CustomerRepository) {}
  async list(t: bigint, i: List) {
    const unit =
      i.unitPublicId === undefined ? undefined : await this.repo.findUnit(t, i.unitPublicId);
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
      },
      i.page,
      i.limit,
      { [i.orderBy]: i.direction },
    );
    const summaries = await this.repo.appointmentSummaries(
      t,
      items.map((item) => item.id),
      new Date(),
    );
    const byCustomer = new Map(summaries.map((summary) => [summary.customerId, summary]));
    return CustomerListResponseSchema.parse({
      items: items.map((item) => {
        const summary = byCustomer.get(item.id);
        return {
          ...publicValue(item),
          lastCompletedAt: summary?.lastCompletedAt?.toISOString() ?? null,
          nextAppointmentAt: summary?.nextAppointmentAt?.toISOString() ?? null,
          appointmentCount: Number(summary?.appointmentCount ?? 0),
        };
      }),
      page: { page: i.page, limit: i.limit, total, totalPages: Math.ceil(total / i.limit) },
    });
  }
  async get(t: bigint, id: string) {
    const x = await this.repo.find(t, id);
    if (x === null) throw this.err('CUSTOMER_NOT_FOUND', 'Cliente não encontrado.', 404);
    return publicValue(x);
  }
  async crmProfile(t: bigint, id: string) {
    const customer = await this.repo.find(t, id);
    if (customer === null) throw this.err('CUSTOMER_NOT_FOUND', 'Cliente não encontrado.', 404);
    const [appointments, loyalty, coupons, waitlist, payments] = await Promise.all([
      this.repo.appointmentsForCustomer(t, customer.id),
      this.repo.loyaltyForCustomer(t, customer.id),
      this.repo.couponsForCustomer(t, customer.id),
      this.repo.waitlistForCustomer(t, customer.id),
      this.repo.paymentsForCustomer(t, customer.id),
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
      financial: {
        paidTotalCents: paidTotal.toString(),
        paidCount: payments.length,
        recentPayments: payments.slice(0, 20).map((item) => ({
          publicId: item.publicId,
          amountCents: item.amountCents.toString(),
          kind: item.kind,
          createdAt: item.createdAt.toISOString(),
          appointmentPublicId: item.appointment.publicId,
        })),
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
