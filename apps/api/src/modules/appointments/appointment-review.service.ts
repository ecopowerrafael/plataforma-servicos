import { randomUUID } from 'node:crypto';

import {
  AppointmentReviewListResponseSchema,
  AppointmentReviewPublicSchema,
  type CreateAppointmentReviewRequest,
  type UpdateAppointmentReviewRequest,
} from '@plataforma/shared';

import { type AppointmentReviewRepository } from './appointment-review.repository.js';
import { type AppointmentRepository } from './appointment.repository.js';
import { AppError } from '../../errors/AppError.js';

type ReviewRecord = Awaited<ReturnType<AppointmentReviewRepository['create']>>;

const pub = (x: ReviewRecord) =>
  AppointmentReviewPublicSchema.parse({
    publicId: x.publicId,
    appointmentPublicId: x.appointment.publicId,
    appointmentProtocol: x.appointment.protocol,
    professionalPublicId: x.professional.publicId,
    professionalName: x.professional.publicName,
    servicePublicId: x.service.publicId,
    serviceName: x.service.name,
    rating: x.rating,
    comment: x.comment,
    createdAt: x.createdAt.toISOString(),
    updatedAt: x.updatedAt.toISOString(),
  });

function notFound(): AppError {
  return new AppError({
    code: 'APPOINTMENT_NOT_FOUND',
    message: 'Agendamento não encontrado.',
    statusCode: 404,
  });
}

export class AppointmentReviewService {
  public constructor(
    private readonly repo: AppointmentReviewRepository,
    private readonly appointments: AppointmentRepository,
  ) {}

  public async list(tenantId: bigint, customerId: bigint) {
    const items = await this.repo.list(tenantId, customerId);
    return AppointmentReviewListResponseSchema.parse({ items: items.map(pub) });
  }

  public async create(
    tenantId: bigint,
    customerId: bigint,
    appointmentPublicId: string,
    input: CreateAppointmentReviewRequest,
  ) {
    const appointment = await this.appointments.find(tenantId, appointmentPublicId);
    if (appointment?.customerId !== customerId) throw notFound();
    if (appointment.status !== 'COMPLETED')
      throw new AppError({
        code: 'APPOINTMENT_REVIEW_NOT_ALLOWED',
        message: 'Somente atendimentos concluídos podem ser avaliados.',
        statusCode: 400,
      });
    const existing = await this.repo.findByAppointment(tenantId, customerId, appointment.id);
    if (existing !== null)
      throw new AppError({
        code: 'APPOINTMENT_REVIEW_ALREADY_EXISTS',
        message: 'Este agendamento já foi avaliado.',
        statusCode: 409,
      });
    const created = await this.repo.create({
      publicId: randomUUID(),
      tenantId,
      appointmentId: appointment.id,
      customerId,
      professionalId: appointment.professionalId,
      serviceId: appointment.serviceId,
      rating: input.rating,
      comment: input.comment ?? null,
    });
    await this.repo.audit({
      publicId: randomUUID(),
      tenantId,
      userId: null,
      sessionId: null,
      action: 'appointment.review.created',
      targetType: 'appointment_review',
      targetPublicId: created.publicId,
    });
    return pub(created);
  }

  public async update(
    tenantId: bigint,
    customerId: bigint,
    appointmentPublicId: string,
    input: UpdateAppointmentReviewRequest,
  ) {
    const appointment = await this.appointments.find(tenantId, appointmentPublicId);
    if (appointment?.customerId !== customerId) throw notFound();
    const existing = await this.repo.findByAppointment(tenantId, customerId, appointment.id);
    if (existing === null)
      throw new AppError({
        code: 'APPOINTMENT_REVIEW_NOT_FOUND',
        message: 'Avaliação não encontrada.',
        statusCode: 404,
      });
    const updated = await this.repo.update(existing.id, {
      rating: input.rating,
      comment: input.comment ?? null,
    });
    await this.repo.audit({
      publicId: randomUUID(),
      tenantId,
      userId: null,
      sessionId: null,
      action: 'appointment.review.updated',
      targetType: 'appointment_review',
      targetPublicId: updated.publicId,
    });
    return pub(updated);
  }
}
