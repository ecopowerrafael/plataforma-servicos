import { randomUUID } from 'node:crypto';

import {
  AppointmentWaitlistListResponseSchema,
  AppointmentWaitlistPublicSchema,
  type CreateAppointmentWaitlistRequest,
  type MatchAppointmentWaitlistRequest,
} from '@plataforma/shared';

import { type PrismaClient, type Prisma } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { type AppointmentService } from './appointment.service.js';

const include = {
  customer: { select: { publicId: true, name: true } },
  professional: { select: { publicId: true, publicName: true } },
  service: { select: { publicId: true, name: true } },
  unit: { select: { publicId: true, name: true } },
} as const;

export type AppointmentWaitlistRecord = Prisma.AppointmentWaitlistGetPayload<{ include: typeof include }>;

export class AppointmentWaitlistService {
  public constructor(
    private readonly client: PrismaClient,
    private readonly appointments: AppointmentService,
  ) {}

  public async list(tenantId: bigint, query?: { status?: string; customerPublicId?: string }) {
    const items = await this.client.appointmentWaitlist.findMany({
      where: {
        tenantId,
        ...(query?.status === undefined ? {} : { status: query.status as never }),
        ...(query?.customerPublicId === undefined
          ? {}
          : { customer: { publicId: query.customerPublicId } }),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include,
    });
    return AppointmentWaitlistListResponseSchema.parse({
      items: items.map((item) => this.publicItem(item)),
    });
  }

  public async get(tenantId: bigint, publicId: string) {
    const item = await this.client.appointmentWaitlist.findFirst({
      where: { tenantId, publicId },
      include,
    });
    if (item === null) throw this.notFound();
    return this.publicItem(item);
  }

  public async create(tenantId: bigint, input: CreateAppointmentWaitlistRequest) {
    const [customer, professional, service] = await Promise.all([
      this.client.customer.findFirst({
        where: { tenantId, publicId: input.customerPublicId, status: 'ACTIVE' },
      }),
      this.client.professional.findFirst({
        where: { tenantId, publicId: input.professionalPublicId, active: true },
      }),
      this.client.service.findFirst({
        where: { tenantId, publicId: input.servicePublicId, active: true },
      }),
    ]);
    if (customer === null || professional === null || service === null)
      throw new AppError({
        code: 'APPOINTMENT_WAITLIST_RESOURCE_NOT_FOUND',
        message: 'Cliente, profissional ou serviço inválido.',
        statusCode: 400,
      });

    const link = await this.client.professionalService.findFirst({
      where: { tenantId, professionalId: professional.id, serviceId: service.id, active: true },
    });
    if (link === null)
      throw new AppError({
        code: 'PROFESSIONAL_SERVICE_LINK_REQUIRED',
        message: 'Vínculo profissional-serviço inválido.',
        statusCode: 400,
      });

    const unit =
      input.unitPublicId === undefined || input.unitPublicId === null
        ? null
        : await this.client.businessUnit.findFirst({
            where: { tenantId, publicId: input.unitPublicId, status: 'ACTIVE' },
          });
    if (input.unitPublicId !== undefined && input.unitPublicId !== null && unit === null)
      throw new AppError({
        code: 'BUSINESS_UNIT_NOT_FOUND',
        message: 'Unidade não encontrada.',
        statusCode: 400,
      });

    const existing = await this.client.appointmentWaitlist.findFirst({
      where: {
        tenantId,
        customerId: customer.id,
        professionalId: professional.id,
        serviceId: service.id,
        unitId: unit?.id ?? null,
        status: { in: ['WAITING', 'MATCHED'] },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (existing !== null)
      throw new AppError({
        code: 'APPOINTMENT_WAITLIST_ALREADY_EXISTS',
        message: 'Já existe uma entrada ativa na lista de espera para este cliente e atendimento.',
        statusCode: 409,
      });

    const item = await this.client.appointmentWaitlist.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        customerId: customer.id,
        professionalId: professional.id,
        serviceId: service.id,
        unitId: unit?.id ?? null,
        preferredStartsAt: input.preferredStartsAt === undefined ? null : new Date(input.preferredStartsAt),
        notes: input.notes ?? null,
        status: 'WAITING',
      },
      include,
    });
    return this.publicItem(item);
  }

  public async recordOpportunity(tenantId: bigint, publicId: string, input: MatchAppointmentWaitlistRequest) {
    const item = await this.client.appointmentWaitlist.findFirst({
      where: { tenantId, publicId },
      include,
    });
    if (item === null) throw this.notFound();
    if (['CONVERTED', 'EXPIRED', 'CANCELED'].includes(item.status))
      throw new AppError({
        code: 'APPOINTMENT_WAITLIST_STATUS_INVALID',
        message: 'Esta entrada da lista de espera não pode receber nova oportunidade.',
        statusCode: 400,
      });

    const updated = await this.client.appointmentWaitlist.update({
      where: { id: item.id },
      data: {
        status: 'MATCHED',
        matchedAt: new Date(),
        preferredStartsAt:
          input.preferredStartsAt === undefined ? item.preferredStartsAt : new Date(input.preferredStartsAt),
      },
      include,
    });
    return this.publicItem(updated);
  }

  public async cancel(tenantId: bigint, publicId: string, reason?: string) {
    const item = await this.client.appointmentWaitlist.findFirst({
      where: { tenantId, publicId },
      include,
    });
    if (item === null) throw this.notFound();
    if (['CONVERTED', 'EXPIRED', 'CANCELED'].includes(item.status))
      throw new AppError({
        code: 'APPOINTMENT_WAITLIST_STATUS_INVALID',
        message: 'Esta entrada da lista de espera já está encerrada.',
        statusCode: 400,
      });

    const updated = await this.client.appointmentWaitlist.update({
      where: { id: item.id },
      data: {
        status: 'CANCELED',
        canceledAt: new Date(),
        canceledReason: reason ?? null,
      },
      include,
    });
    return this.publicItem(updated);
  }

  public async convertToAppointment(
    tenantId: bigint,
    publicId: string,
    input: {
      customerPublicId: string;
      professionalPublicId: string;
      servicePublicId: string;
      unitPublicId?: string | null;
      startsAt: string;
      notes?: string | null; 
    },
  ) {
    const waitlist = await this.client.appointmentWaitlist.findFirst({
      where: { tenantId, publicId },
      include,
    });
    if (waitlist === null) throw this.notFound();
    if (waitlist.status !== 'MATCHED')
      throw new AppError({
        code: 'APPOINTMENT_WAITLIST_NOT_MATCHED',
        message: 'A entrada da lista de espera ainda não tem oportunidade válida para conversão.',
        statusCode: 400,
      });

    const appointment = await this.appointments.create(tenantId, {
      customerPublicId: input.customerPublicId,
      professionalPublicId: input.professionalPublicId,
      servicePublicId: input.servicePublicId,
      unitPublicId: input.unitPublicId ?? waitlist.unit?.publicId ?? undefined,
      startsAt: input.startsAt,
      notes: input.notes ?? waitlist.notes,
      source: 'WAITLIST',
    }, { userId: null, sessionId: null });

    await this.client.appointmentWaitlist.update({
      where: { id: waitlist.id },
      data: {
        status: 'CONVERTED',
        convertedAt: new Date(),
        appointmentId: appointment.id,
      },
    });

    return appointment;
  }

  public async findMatchingCandidates(tenantId: bigint, appointmentId: bigint) {
    const appointment = await this.client.appointment.findUnique({
      where: { id: appointmentId },
      select: { tenantId: true, professionalId: true, serviceId: true, unitId: true, startsAt: true },
    });
    if (appointment === null || appointment.tenantId !== tenantId) return [];
    return this.client.appointmentWaitlist.findMany({
      where: {
        tenantId,
        professionalId: appointment.professionalId,
        serviceId: appointment.serviceId,
        status: 'WAITING',
        ...(appointment.unitId === null ? {} : { OR: [{ unitId: appointment.unitId }, { unitId: null }] }),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include,
    });
  }

  public async markWaitlistOpportunityOnAppointmentCancellation(tenantId: bigint, appointmentId: bigint) {
    const candidates = await this.findMatchingCandidates(tenantId, appointmentId);
    if (candidates.length === 0) return [];
    return Promise.all(
      candidates.map((candidate) =>
        this.client.appointmentWaitlist.update({
          where: { id: candidate.id },
          data: { status: 'MATCHED', matchedAt: new Date() },
          include,
        }),
      ),
    );
  }

  public static async connectCancellationHook(
    client: PrismaClient,
    waitlist: AppointmentWaitlistService,
    appointments: AppointmentService,
  ) {
    return {
      async onAppointmentCanceled(tenantId: bigint, appointmentId: bigint) {
        await waitlist.markWaitlistOpportunityOnAppointmentCancellation(tenantId, appointmentId);
        return appointments.get(tenantId, (await client.appointment.findUniqueOrThrow({ where: { id: appointmentId }, select: { publicId: true } })).publicId);
      },
    };
  }

  private publicItem(item: AppointmentWaitlistRecord) {
    return AppointmentWaitlistPublicSchema.parse({
      publicId: item.publicId,
      customerPublicId: item.customer.publicId,
      professionalPublicId: item.professional.publicId,
      servicePublicId: item.service.publicId,
      unitPublicId: item.unit?.publicId ?? null,
      preferredStartsAt: item.preferredStartsAt?.toISOString() ?? null,
      notes: item.notes,
      status: item.status,
      matchedAt: item.matchedAt?.toISOString() ?? null,
      convertedAt: item.convertedAt?.toISOString() ?? null,
      canceledAt: item.canceledAt?.toISOString() ?? null,
      canceledReason: item.canceledReason,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    });
  }

  private notFound() {
    return new AppError({
      code: 'APPOINTMENT_WAITLIST_NOT_FOUND',
      message: 'Entrada da lista de espera não encontrada.',
      statusCode: 404,
    });
  }
}
