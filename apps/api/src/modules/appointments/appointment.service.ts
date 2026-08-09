import { randomUUID } from 'node:crypto';

import {
  AppointmentHistoryResponseSchema,
  AppointmentListResponseSchema,
  AppointmentPublicSchema,
} from '@plataforma/shared';

import { type AppointmentWaitlistService } from './appointment-waitlist.service.js';
import { type AppointmentRepository } from './appointment.repository.js';
import { type AppointmentStatus, type Prisma } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { type AvailabilityService } from '../calendar/availability.service.js';
interface Actor {
  userId: bigint | null;
  sessionId: bigint | null;
}
interface Input {
  customerPublicId: string;
  professionalPublicId: string;
  servicePublicId: string;
  unitPublicId?: string | null | undefined;
  startsAt: string;
  notes?: string | null | undefined;
  source: string;
  rescheduleReason?: string | undefined;
  isFitIn?: boolean | undefined;
  fitInReason?: string | undefined;
  depositType?: 'FIXED' | 'PERCENTAGE' | null | undefined;
  depositValue?: number | undefined;
}
type AppointmentRecord = Awaited<ReturnType<AppointmentRepository['find']>> & {};
const pub = (x: AppointmentRecord) =>
  AppointmentPublicSchema.parse({
    publicId: x.publicId,
    protocol: x.protocol,
    customerPublicId: x.customer.publicId,
    customerName: x.customer.name,
    professionalPublicId: x.professional.publicId,
    professionalName: x.professional.publicName,
    servicePublicId: x.service.publicId,
    serviceName: x.service.name,
    unitPublicId: x.unit?.publicId ?? null,
    unitName: x.unit?.name ?? null,
    startsAt: x.startsAt.toISOString(),
    endsAt: x.endsAt.toISOString(),
    durationMinutes: x.durationMinutes,
    postServiceBreakMinutes: x.postServiceBreakMinutes,
    priceCents: x.priceCents.toString(),
    status: x.status,
    notes: x.notes,
    source: x.source,
    canceledReason: x.canceledReason,
    rescheduleReason: x.rescheduleReason,
    isFitIn: x.isFitIn,
    fitInReason: x.fitInReason,
    checkedInAt: x.checkedInAt?.toISOString() ?? null,
    depositType: x.depositType,
    depositPercentage: x.depositPercentage,
    depositAmountCents: x.depositAmountCents?.toString() ?? null,
    createdAt: x.createdAt.toISOString(),
    updatedAt: x.updatedAt.toISOString(),
  });
export class AppointmentService {
  private waitlistService?: AppointmentWaitlistService;

  constructor(
    private readonly repo: AppointmentRepository,
    private readonly availability: AvailabilityService,
  ) {}

  setWaitlistService(service: AppointmentWaitlistService): void {
    this.waitlistService = service;
  }
  async list(
    t: bigint,
    q: {
      from: string;
      to: string;
      status?: string | undefined;
      professionalPublicId?: string | undefined;
      customerPublicId?: string | undefined;
      servicePublicId?: string | undefined;
      unitPublicId?: string | undefined;
      search?: string | undefined;
    },
  ) {
    const items = await this.repo.list(t, {
      startsAt: { gte: new Date(q.from), lte: new Date(q.to) },
      ...(q.status === undefined ? {} : { status: this.appointmentStatus(q.status) }),
      ...(q.professionalPublicId === undefined
        ? {}
        : { professional: { publicId: q.professionalPublicId } }),
      ...(q.customerPublicId === undefined ? {} : { customer: { publicId: q.customerPublicId } }),
      ...(q.servicePublicId === undefined ? {} : { service: { publicId: q.servicePublicId } }),
      ...(q.unitPublicId === undefined ? {} : { unit: { publicId: q.unitPublicId } }),
      ...(q.search === undefined
        ? {}
        : {
            OR: [
              { protocol: { contains: q.search } },
              { customer: { name: { contains: q.search } } },
            ],
          }),
    });
    return AppointmentListResponseSchema.parse({ items: items.map(pub) });
  }
  async listUpcomingForCustomer(t: bigint, customerId: bigint) {
    const items = await this.repo.list(
      t,
      {
        customerId,
        startsAt: { gte: new Date() },
        status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
      },
      { startsAt: 'asc' },
    );
    return AppointmentListResponseSchema.parse({ items: items.map(pub) });
  }
  async listHistoryForCustomer(t: bigint, customerId: bigint) {
    const items = await this.repo.list(t, { customerId }, { startsAt: 'desc' });
    return AppointmentListResponseSchema.parse({ items: items.map(pub) });
  }
  async cancelForCustomer(t: bigint, customerId: bigint, id: string, reason: string | undefined) {
    const old = await this.repo.find(t, id);
    if (old?.customerId !== customerId) throw this.notFound();
    return this.status(t, id, 'CANCELED', reason, { userId: null, sessionId: null });
  }
  async rescheduleForCustomer(
    t: bigint,
    customerId: bigint,
    id: string,
    startsAt: string,
    reason: string,
  ) {
    const old = await this.repo.find(t, id);
    if (old?.customerId !== customerId) throw this.notFound();
    return this.update(
      t,
      id,
      {
        customerPublicId: old.customer.publicId,
        professionalPublicId: old.professional.publicId,
        servicePublicId: old.service.publicId,
        unitPublicId: old.unit?.publicId ?? null,
        startsAt,
        notes: old.notes,
        source: old.source,
        rescheduleReason: reason,
      },
      { userId: null, sessionId: null },
    );
  }
  async get(t: bigint, id: string) {
    const x = await this.repo.find(t, id);
    if (x === null) throw this.notFound();
    return pub(x);
  }
  async getForProfessional(t: bigint, professionalId: bigint, id: string) {
    const x = await this.repo.find(t, id);
    if (x?.professionalId !== professionalId) throw this.notFound();
    return pub(x);
  }
  async history(t: bigint, id: string) {
    const x = await this.repo.find(t, id);
    if (x === null) throw this.notFound();
    return this.historyOf(t, x.id);
  }
  async historyForProfessional(t: bigint, professionalId: bigint, id: string) {
    const x = await this.repo.find(t, id);
    if (x?.professionalId !== professionalId) throw this.notFound();
    return this.historyOf(t, x.id);
  }
  private async historyOf(t: bigint, appointmentId: bigint) {
    const entries = await this.repo.listHistory(t, appointmentId);
    return AppointmentHistoryResponseSchema.parse({
      items: entries.map((entry) => ({
        publicId: entry.publicId,
        action: entry.action,
        previousStatus: entry.previousStatus,
        newStatus: entry.newStatus,
        previousStartsAt: entry.previousStartsAt?.toISOString() ?? null,
        newStartsAt: entry.newStartsAt?.toISOString() ?? null,
        reason: entry.reason,
        isFitIn: entry.isFitIn,
        createdAt: entry.createdAt.toISOString(),
      })),
    });
  }
  async notesForProfessional(
    t: bigint,
    professionalId: bigint,
    id: string,
    notes: string | null,
    a: Actor,
  ) {
    const old = await this.repo.find(t, id);
    if (old?.professionalId !== professionalId) throw this.notFound();
    const updated = await this.repo.update(old.id, { notes });
    await this.audit(t, id, 'appointment.notes_updated', a);
    return pub(updated);
  }
  private static readonly professionalStatusTransitions = {
    PENDING: [],
    CONFIRMED: ['IN_PROGRESS', 'NO_SHOW'],
    IN_PROGRESS: ['COMPLETED'],
    COMPLETED: [],
    CANCELED: [],
    NO_SHOW: [],
  } as const;
  async statusForProfessional(
    t: bigint,
    professionalId: bigint,
    id: string,
    status: 'IN_PROGRESS' | 'COMPLETED' | 'NO_SHOW',
    reason: string | undefined,
    a: Actor,
  ) {
    const old = await this.repo.find(t, id);
    if (old?.professionalId !== professionalId) throw this.notFound();
    const allowed: readonly string[] = AppointmentService.professionalStatusTransitions[old.status];
    if (!allowed.includes(status))
      throw new AppError({
        code: 'APPOINTMENT_STATUS_TRANSITION_NOT_ALLOWED_FOR_PROFESSIONAL',
        message: 'Esta alteração de status não é permitida para o profissional.',
        statusCode: 403,
      });
    return this.status(t, id, status, reason, a);
  }
  async create(t: bigint, i: Input, a: Actor) {
    return this.save(t, i, a);
  }
  async update(t: bigint, id: string, i: Input, a: Actor) {
    const old = await this.repo.find(t, id);
    if (old === null) throw this.notFound();
    if (['COMPLETED', 'CANCELED'].includes(old.status))
      throw new AppError({
        code: 'APPOINTMENT_LOCKED',
        message: 'Este agendamento não pode ser alterado.',
        statusCode: 400,
      });
    if (
      new Date(i.startsAt).getTime() !== old.startsAt.getTime() &&
      i.rescheduleReason === undefined
    )
      throw new AppError({
        code: 'RESCHEDULE_REASON_REQUIRED',
        message: 'Informe o motivo do reagendamento.',
        statusCode: 400,
      });
    return this.save(t, i, a, old);
  }
  async status(
    t: bigint,
    id: string,
    status: 'CONFIRMED' | 'IN_PROGRESS' | 'CANCELED' | 'COMPLETED' | 'NO_SHOW',
    reason: string | undefined,
    a: Actor,
  ) {
    const old = await this.repo.find(t, id);
    if (old === null) throw this.notFound();
    if (['COMPLETED', 'CANCELED'].includes(old.status))
      throw new AppError({
        code: 'APPOINTMENT_LOCKED',
        message: 'Este agendamento não pode ser alterado.',
        statusCode: 400,
      });
    const allowed: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
      PENDING: ['CONFIRMED', 'CANCELED', 'NO_SHOW'],
      CONFIRMED: ['IN_PROGRESS', 'CANCELED', 'NO_SHOW'],
      IN_PROGRESS: ['COMPLETED', 'CANCELED'],
      NO_SHOW: [],
      COMPLETED: [],
      CANCELED: [],
    };
    const transitions: readonly AppointmentStatus[] = allowed[old.status];
    if (!transitions.includes(status))
      throw new AppError({
        code: 'APPOINTMENT_STATUS_TRANSITION_INVALID',
        message: 'A transição de status não é permitida.',
        statusCode: 400,
      });
    if (status === 'CANCELED' && reason === undefined)
      throw new AppError({
        code: 'CANCEL_REASON_REQUIRED',
        message: 'Informe o motivo do cancelamento.',
        statusCode: 400,
      });
    await this.repo.update(old.id, {
      status,
      ...(status === 'CANCELED' ? { canceledReason: reason ?? null } : {}),
    });
    if (status === 'CANCELED' && this.waitlistService !== undefined) {
      await this.waitlistService.markWaitlistOpportunityOnAppointmentCancellation(t, old.id);
    }
    await this.recordHistory(t, old.id, {
      action: 'STATUS_CHANGED',
      previousStatus: old.status,
      newStatus: status,
      reason: reason ?? null,
      isFitIn: false,
      actor: a,
    });
    await this.audit(t, id, `appointment.${status.toLowerCase()}`, a);
    return { success: true } as const;
  }
  private appointmentStatus(value: string): AppointmentStatus {
    switch (value) {
      case 'PENDING':
      case 'CONFIRMED':
      case 'IN_PROGRESS':
      case 'COMPLETED':
      case 'CANCELED':
      case 'NO_SHOW':
        return value;
      default:
        throw new AppError({
          code: 'APPOINTMENT_STATUS_INVALID',
          message: 'Status de agendamento inválido.',
          statusCode: 400,
        });
    }
  }
  async checkIn(t: bigint, id: string, checkedInAt: string | undefined, a: Actor) {
    const old = await this.repo.find(t, id);
    if (old === null) throw this.notFound();
    if (['CANCELED', 'COMPLETED', 'NO_SHOW'].includes(old.status))
      throw new AppError({
        code: 'APPOINTMENT_CHECKIN_NOT_ALLOWED',
        message: 'Este agendamento não pode receber check-in.',
        statusCode: 400,
      });
    if (old.checkedInAt !== null)
      throw new AppError({
        code: 'APPOINTMENT_ALREADY_CHECKED_IN',
        message: 'O check-in já foi registrado para este agendamento.',
        statusCode: 409,
      });
    const at = checkedInAt === undefined ? new Date() : new Date(checkedInAt);
    const updated = await this.repo.update(old.id, { checkedInAt: at });
    await this.recordHistory(t, old.id, {
      action: 'CHECKED_IN',
      previousStatus: old.status,
      newStatus: old.status,
      reason: null,
      isFitIn: false,
      actor: a,
    });
    await this.audit(t, id, 'appointment.checked_in', a);
    return pub(updated);
  }
  private async save(t: bigint, i: Input, a: Actor, old?: AppointmentRecord) {
    const isFitIn = i.isFitIn === true;
    if (!isFitIn)
      await this.availability.assertSlot(t, {
        professionalPublicId: i.professionalPublicId,
        servicePublicId: i.servicePublicId,
        startsAt: i.startsAt,
        ...(i.unitPublicId === undefined || i.unitPublicId === null
          ? {}
          : { unitPublicId: i.unitPublicId }),
        ...(old === undefined ? {} : { excludeAppointmentId: old.id }),
      });
    const [customer, professional, service] = await Promise.all([
      this.repo.customer(t, i.customerPublicId),
      this.repo.professional(t, i.professionalPublicId),
      this.repo.service(t, i.servicePublicId),
    ]);
    if (customer === null || professional === null || service === null)
      throw new AppError({
        code: 'APPOINTMENT_RESOURCE_NOT_FOUND',
        message: 'Cliente, profissional ou serviço inválido.',
        statusCode: 400,
      });
    const link = await this.repo.link(t, professional.id, service.id);
    if (link === null)
      throw new AppError({
        code: 'PROFESSIONAL_SERVICE_LINK_REQUIRED',
        message: 'Vínculo profissional-serviço inválido.',
        statusCode: 400,
      });
    const unit =
      i.unitPublicId === undefined || i.unitPublicId === null
        ? null
        : await this.repo.unit(t, i.unitPublicId);
    if (i.unitPublicId !== undefined && i.unitPublicId !== null && unit === null)
      throw new AppError({
        code: 'BUSINESS_UNIT_NOT_FOUND',
        message: 'Unidade não encontrada.',
        statusCode: 400,
      });
    const duration = link.durationMinutes ?? service.durationMinutes;
    const pause =
      (link.hasPostServiceBreak ?? service.hasPostServiceBreak)
        ? (link.postServiceBreakMinutes ?? service.postServiceBreakMinutes)
        : 0;
    const start = new Date(i.startsAt);
    const end = new Date(start.getTime() + (duration + pause) * 60000);
    if (await this.repo.conflict(t, professional.id, start, end, old?.id))
      throw new AppError({
        code: 'APPOINTMENT_CONFLICT',
        message: 'Há conflito na agenda do profissional.',
        statusCode: 409,
      });
    const priceCents = link.priceCents ?? service.priceCents;
    const depositType = i.depositType ?? null;
    let depositPercentage: number | null = null;
    let depositAmountCents: bigint | null = null;
    if (depositType !== null) {
      if (i.depositValue === undefined)
        throw new AppError({
          code: 'DEPOSIT_VALUE_REQUIRED',
          message: 'Informe o valor do sinal.',
          statusCode: 400,
        });
      if (depositType === 'FIXED') {
        depositAmountCents = BigInt(i.depositValue);
      } else {
        depositPercentage = i.depositValue;
        depositAmountCents = (priceCents * BigInt(i.depositValue)) / 100n;
      }
      if (depositAmountCents <= 0n || depositAmountCents > priceCents)
        throw new AppError({
          code: 'DEPOSIT_AMOUNT_INVALID',
          message:
            'O valor do sinal deve ser maior que zero e não pode exceder o preço do agendamento.',
          statusCode: 400,
        });
    }
    const data = {
      customerId: customer.id,
      professionalId: professional.id,
      serviceId: service.id,
      unitId: unit?.id ?? null,
      startsAt: start,
      endsAt: end,
      durationMinutes: duration,
      postServiceBreakMinutes: pause,
      priceCents,
      notes: i.notes ?? null,
      source: i.source,
      isFitIn,
      fitInReason: isFitIn ? (i.fitInReason ?? null) : null,
      depositType,
      depositPercentage,
      depositAmountCents,
      ...(i.rescheduleReason === undefined ? {} : { rescheduleReason: i.rescheduleReason }),
    };
    const x =
      old === undefined
        ? await this.repo.createIfAvailable({
            publicId: randomUUID(),
            tenantId: t,
            status: 'PENDING',
            ...data,
          })
        : await this.repo.updateIfAvailable(old.id, t, professional.id, start, end, data);
    if (x === null)
      throw new AppError({
        code: 'APPOINTMENT_CONFLICT',
        message: 'Há conflito na agenda do profissional.',
        statusCode: 409,
      });
    if (old === undefined) {
      await this.recordHistory(t, x.id, {
        action: 'CREATED',
        previousStatus: null,
        newStatus: 'PENDING',
        newStartsAt: start,
        reason: isFitIn ? (i.fitInReason ?? null) : null,
        isFitIn,
        actor: a,
      });
    } else {
      await this.recordHistory(t, x.id, {
        action: 'RESCHEDULED',
        previousStartsAt: old.startsAt,
        newStartsAt: start,
        reason: isFitIn ? (i.fitInReason ?? null) : (i.rescheduleReason ?? null),
        isFitIn,
        actor: a,
      });
    }
    await this.audit(
      t,
      x.publicId,
      old === undefined ? 'appointment.created' : 'appointment.rescheduled',
      a,
      isFitIn ? { isFitIn: true } : undefined,
    );
    return pub(x);
  }
  private async recordHistory(
    t: bigint,
    appointmentId: bigint,
    entry: {
      action: 'CREATED' | 'STATUS_CHANGED' | 'RESCHEDULED' | 'CHECKED_IN';
      previousStatus?: AppointmentRecord['status'] | null;
      newStatus?: AppointmentRecord['status'] | null;
      previousStartsAt?: Date | null;
      newStartsAt?: Date | null;
      reason: string | null;
      isFitIn: boolean;
      actor: Actor;
    },
  ) {
    await this.repo.recordHistory({
      publicId: randomUUID(),
      tenantId: t,
      appointmentId,
      action: entry.action,
      previousStatus: entry.previousStatus ?? null,
      newStatus: entry.newStatus ?? null,
      previousStartsAt: entry.previousStartsAt ?? null,
      newStartsAt: entry.newStartsAt ?? null,
      reason: entry.reason,
      isFitIn: entry.isFitIn,
      userId: entry.actor.userId,
      sessionId: entry.actor.sessionId,
    });
  }
  private notFound() {
    return new AppError({
      code: 'APPOINTMENT_NOT_FOUND',
      message: 'Agendamento não encontrado.',
      statusCode: 404,
    });
  }
  private async audit(
    t: bigint,
    id: string,
    action: string,
    a: Actor,
    metadata?: Prisma.InputJsonValue,
  ) {
    await this.repo.audit({
      publicId: randomUUID(),
      tenantId: t,
      userId: a.userId,
      sessionId: a.sessionId,
      action,
      targetType: 'appointment',
      targetPublicId: id,
      ...(metadata === undefined ? {} : { metadata }),
    });
  }
}
