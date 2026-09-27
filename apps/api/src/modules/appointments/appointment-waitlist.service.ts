import { randomUUID } from 'node:crypto';

import {
  AppointmentWaitlistListResponseSchema,
  AppointmentWaitlistPublicSchema,
  type AppointmentWaitlistFilter,
  type ConvertAppointmentWaitlistRequest,
  type CreateAppointmentWaitlistRequest,
} from '@plataforma/shared';

import {
  type AppointmentWaitlistRepository,
  type WaitlistRecord,
} from './appointment-waitlist.repository.js';
import { type AppointmentService } from './appointment.service.js';
import { AppError } from '../../errors/AppError.js';
import { type AvailabilityService } from '../calendar/availability.service.js';
import { PlanEntitlementService } from '../tenants/plan-entitlement.service.js';

interface Actor {
  userId: bigint;
  sessionId: bigint;
}
const day = (value: Date) => value.toISOString().slice(0, 10);
const localTime = (value: Date, timezone: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(value);

export class AppointmentWaitlistService {
  public constructor(
    private readonly repo: AppointmentWaitlistRepository,
    private readonly appointments: AppointmentService,
    private readonly availability: AvailabilityService,
  ) {}
  private assertEnabled(tenantId: bigint) { return new PlanEntitlementService().assertFeatureEnabledForTenant(this.repo.client, tenantId, 'waitlist.enabled'); }
  public async list(t: bigint, query: AppointmentWaitlistFilter) {
    await this.assertEnabled(t);
    await this.repo.expire(t, new Date());
    const items = await this.repo.list(t, {
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.customerPublicId === undefined
        ? {}
        : { customer: { publicId: query.customerPublicId } }),
      ...(query.professionalPublicId === undefined
        ? {}
        : { professional: { publicId: query.professionalPublicId } }),
      ...(query.servicePublicId === undefined
        ? {}
        : { service: { publicId: query.servicePublicId } }),
      ...(query.unitPublicId === undefined ? {} : { unit: { publicId: query.unitPublicId } }),
    });
    return AppointmentWaitlistListResponseSchema.parse({
      items: items.map((item) => this.pub(item)),
    });
  }
  public async get(t: bigint, id: string) {
    await this.assertEnabled(t);
    await this.repo.expire(t, new Date());
    const item = await this.repo.find(t, id);
    if (item === null) throw this.notFound();
    return this.pub(item);
  }
  public async create(t: bigint, input: CreateAppointmentWaitlistRequest, actor: Actor) {
    await this.assertEnabled(t);
    const [customer, service, unit] = await Promise.all([
      this.repo.customer(t, input.customerPublicId),
      this.repo.service(t, input.servicePublicId),
      this.repo.unit(t, input.unitPublicId),
    ]);
    if (customer === null || service === null || unit === null)
      throw this.invalid('Cliente, serviço ou unidade inválido.');
    const professional =
      input.professionalPublicId == null
        ? null
        : await this.repo.professional(t, input.professionalPublicId);
    if (input.professionalPublicId != null && professional === null)
      throw this.invalid('Profissional inválido.');
    if (professional !== null) {
      const [serviceLink, unitLink] = await Promise.all([
        this.repo.professionalService(t, professional.id, service.id),
        this.repo.professionalUnit(t, professional.id, unit.id),
      ]);
      if (serviceLink === null || (professional.primaryUnitId !== unit.id && unitLink === null))
        throw this.invalid('O profissional não atende o serviço nesta unidade.');
    }
    if (
      new Date(input.expiresAt) <= new Date() ||
      day(new Date(input.expiresAt)) < input.preferredDateFrom
    )
      throw this.invalid('A expiração deve ser futura e cobrir o período preferido.');
    if (await this.repo.activeDuplicate(t, customer.id, service.id, unit.id))
      throw new AppError({
        code: 'APPOINTMENT_WAITLIST_ALREADY_EXISTS',
        message: 'Já existe uma entrada ativa para este cliente, serviço e unidade.',
        statusCode: 409,
      });
    const professionals =
      professional === null
        ? await this.repo.professionalsFor(t, service.id, unit.id)
        : [{ publicId: professional.publicId }];
    for (const candidate of professionals) {
      for (
        let date = new Date(`${input.preferredDateFrom}T12:00:00.000Z`);
        day(date) <= input.preferredDateTo;
        date.setUTCDate(date.getUTCDate() + 1)
      ) {
        const result = await this.availability.available(t, {
          date: day(date),
          professionalPublicId: candidate.publicId,
          servicePublicId: service.publicId,
          unitPublicId: unit.publicId,
        });
        if (
          result.slots.some((slot) => {
            const time = localTime(new Date(slot.startsAt), unit.timezone);
            return (
              slot.state === 'AVAILABLE' &&
              time >= input.preferredTimeStart &&
              time <= input.preferredTimeEnd
            );
          })
        )
          throw new AppError({
            code: 'APPOINTMENT_WAITLIST_AVAILABILITY_EXISTS',
            message: 'Já existe disponibilidade compatível; realize o agendamento diretamente.',
            statusCode: 409,
          });
      }
    }
    const item = await this.repo.create({
      publicId: randomUUID(),
      tenantId: t,
      customerId: customer.id,
      professionalId: professional?.id ?? null,
      serviceId: service.id,
      unitId: unit.id,
      preferredDateFrom: new Date(`${input.preferredDateFrom}T00:00:00.000Z`),
      preferredDateTo: new Date(`${input.preferredDateTo}T00:00:00.000Z`),
      preferredTimeStart: input.preferredTimeStart,
      preferredTimeEnd: input.preferredTimeEnd,
      expiresAt: new Date(input.expiresAt),
      notes: input.notes ?? null,
    });
    await this.audit(t, actor, 'appointment_waitlist.created', item.publicId);
    return this.pub(item);
  }
  public async cancel(t: bigint, id: string, reason: string, actor: Actor) {
    await this.assertEnabled(t);
    const item = await this.repo.find(t, id);
    if (item === null) throw this.notFound();
    if (item.status !== 'WAITING' && item.status !== 'MATCHED')
      throw this.invalid('Esta entrada já está encerrada.');
    const updated = await this.repo.update(item.id, {
      status: 'CANCELED',
      canceledAt: new Date(),
      canceledReason: reason,
      opportunityId: null,
    });
    await this.audit(t, actor, 'appointment_waitlist.canceled', id);
    return this.pub(updated);
  }
  public async convert(
    t: bigint,
    id: string,
    input: ConvertAppointmentWaitlistRequest,
    actor: Actor,
  ) {
    await this.assertEnabled(t);
    const initial = await this.repo.find(t, id);
    if (initial === null) throw this.notFound();
    const result = await this.repo.withConversionLock(t, initial.id, async () => {
      const item = await this.repo.find(t, id);
      if (
        item?.status !== 'MATCHED' ||
        item.opportunity?.publicId !== input.opportunityPublicId ||
        item.expiresAt <= new Date()
      )
        throw new AppError({
          code: 'APPOINTMENT_WAITLIST_NOT_MATCHED',
          message: 'A oportunidade não está disponível para conversão.',
          statusCode: 409,
        });
      const appointment = await this.appointments.create(
        t,
        {
          customerPublicId: item.customer.publicId,
          professionalPublicId: item.opportunity.professional.publicId,
          servicePublicId: item.service.publicId,
          unitPublicId: item.unit.publicId,
          startsAt: item.opportunity.startsAt.toISOString(),
          notes: input.notes ?? item.notes,
          source: 'WAITLIST',
        },
        actor,
      );
      const saved = await this.repo.appointment(t, appointment.publicId);
      if (saved === null) throw this.invalid('Agendamento convertido não foi encontrado.');
      await this.repo.update(item.id, {
        status: 'CONVERTED',
        convertedAt: new Date(),
        appointmentId: saved.id,
      });
      await this.audit(t, actor, 'appointment_waitlist.converted', id);
      return appointment;
    });
    if (result === null)
      throw new AppError({
        code: 'APPOINTMENT_WAITLIST_CONVERSION_BUSY',
        message: 'A conversão já está em andamento.',
        statusCode: 409,
      });
    return result;
  }
  public async matchCancellation(t: bigint, appointmentId: bigint) {
    const id = await this.repo.createAndClaimOpportunity(t, appointmentId);
    return id === null ? null : this.get(t, id);
  }
  public async markWaitlistOpportunityOnAppointmentCancellation(t: bigint, appointmentId: bigint) {
    return this.matchCancellation(t, appointmentId);
  }
  private pub(item: WaitlistRecord) {
    return AppointmentWaitlistPublicSchema.parse({
      publicId: item.publicId,
      customerPublicId: item.customer.publicId,
      customerName: item.customer.name,
      professionalPublicId: item.professional?.publicId ?? null,
      professionalName: item.professional?.publicName ?? null,
      servicePublicId: item.service.publicId,
      serviceName: item.service.name,
      unitPublicId: item.unit.publicId,
      unitName: item.unit.name,
      preferredDateFrom: day(item.preferredDateFrom),
      preferredDateTo: day(item.preferredDateTo),
      preferredTimeStart: item.preferredTimeStart,
      preferredTimeEnd: item.preferredTimeEnd,
      expiresAt: item.expiresAt.toISOString(),
      notes: item.notes,
      status: item.status,
      matchedAt: item.matchedAt?.toISOString() ?? null,
      convertedAt: item.convertedAt?.toISOString() ?? null,
      canceledAt: item.canceledAt?.toISOString() ?? null,
      canceledReason: item.canceledReason,
      opportunityPublicId: item.opportunity?.publicId ?? null,
      opportunityStartsAt: item.opportunity?.startsAt.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    });
  }
  private async audit(t: bigint, actor: Actor, action: string, target: string) {
    await this.repo.audit({
      publicId: randomUUID(),
      tenantId: t,
      userId: actor.userId,
      sessionId: actor.sessionId,
      action,
      targetType: 'appointment_waitlist',
      targetPublicId: target,
    });
  }
  private notFound() {
    return new AppError({
      code: 'APPOINTMENT_WAITLIST_NOT_FOUND',
      message: 'Entrada não encontrada.',
      statusCode: 404,
    });
  }
  private invalid(message: string) {
    return new AppError({ code: 'APPOINTMENT_WAITLIST_INVALID', message, statusCode: 400 });
  }
}
