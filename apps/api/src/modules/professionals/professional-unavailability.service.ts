import { randomUUID } from 'node:crypto';

import {
  ProfessionalUnavailabilityListResponseSchema,
  type ProfessionalUnavailabilityType,
} from '@plataforma/shared';

import { type PrismaProfessionalUnavailabilityRepository } from './professional-unavailability.repository.js';
import { AppError } from '../../errors/AppError.js';

interface Actor {
  userId: bigint;
  sessionId: bigint | null;
}
interface UnavailabilityInput {
  unitPublicId?: string | null | undefined;
  type: ProfessionalUnavailabilityType;
  title: string;
  reason?: string | null | undefined;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  repeatsWeekly: boolean;
  recurrenceEndsAt?: string | null | undefined;
  active: boolean;
}
interface CreateInput extends UnavailabilityInput {
  professionalPublicIds?: string[] | undefined;
}
interface ListInput {
  from?: string | undefined;
  to?: string | undefined;
  type?: ProfessionalUnavailabilityType | undefined;
  active?: boolean | undefined;
}

export class ProfessionalUnavailabilityService {
  public constructor(private readonly repository: PrismaProfessionalUnavailabilityRepository) {}

  public async list(tenantId: bigint, professionalPublicId: string, input: ListInput) {
    const professional = await this.getProfessional(tenantId, professionalPublicId);
    const items = await this.repository.list(tenantId, professional.id, {
      ...(input.type === undefined ? {} : { type: input.type }),
      ...(input.active === undefined ? {} : { active: input.active }),
      ...(input.from === undefined || input.to === undefined
        ? {}
        : {
            OR: [
              { startsAt: { lte: new Date(input.to) }, endsAt: { gte: new Date(input.from) } },
              {
                repeatsWeekly: true,
                recurrenceEndsAt: { gte: new Date(input.from) },
                startsAt: { lte: new Date(input.to) },
              },
            ],
          }),
    });
    return ProfessionalUnavailabilityListResponseSchema.parse({
      items: items.map((item) => this.publicItem(item)),
    });
  }

  public async create(
    tenantId: bigint,
    professionalPublicId: string,
    input: CreateInput,
    actor: Actor,
  ) {
    const source = await this.getProfessional(tenantId, professionalPublicId);
    const targetIds = [...new Set([source.publicId, ...(input.professionalPublicIds ?? [])])];
    const professionals = await this.repository.findProfessionals(tenantId, targetIds);
    if (professionals.length !== targetIds.length)
      throw this.notFound('Um dos profissionais selecionados n\u00e3o foi encontrado.');
    const unitId = await this.resolveUnitId(tenantId, input.unitPublicId);
    for (const professional of professionals)
      await this.assertNoOverlap(tenantId, professional.id, input);
    for (const professional of professionals) {
      await this.repository.create({
        publicId: randomUUID(),
        tenantId,
        professionalId: professional.id,
        unitId,
        type: input.type,
        title: input.title,
        reason: input.reason ?? null,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        allDay: input.allDay,
        repeatsWeekly: input.repeatsWeekly,
        recurrenceEndsAt:
          input.recurrenceEndsAt === undefined || input.recurrenceEndsAt === null
            ? null
            : new Date(input.recurrenceEndsAt),
        active: input.active,
      });
    }
    await this.audit(tenantId, actor, 'professional_unavailability.created', source.publicId, {
      professionalCount: professionals.length,
    });
    return this.list(tenantId, source.publicId, {});
  }

  public async update(
    tenantId: bigint,
    professionalPublicId: string,
    itemPublicId: string,
    input: UnavailabilityInput,
    actor: Actor,
  ) {
    const professional = await this.getProfessional(tenantId, professionalPublicId);
    await this.getItem(tenantId, professional.id, itemPublicId);
    const unitId = await this.resolveUnitId(tenantId, input.unitPublicId);
    await this.assertNoOverlap(tenantId, professional.id, input, itemPublicId);
    await this.repository.update(itemPublicId, {
      unitId,
      type: input.type,
      title: input.title,
      reason: input.reason ?? null,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      allDay: input.allDay,
      repeatsWeekly: input.repeatsWeekly,
      recurrenceEndsAt:
        input.recurrenceEndsAt === undefined || input.recurrenceEndsAt === null
          ? null
          : new Date(input.recurrenceEndsAt),
      active: input.active,
    });
    await this.audit(
      tenantId,
      actor,
      'professional_unavailability.updated',
      professional.publicId,
      { itemPublicId },
    );
    return this.list(tenantId, professional.publicId, {});
  }

  public async setStatus(
    tenantId: bigint,
    professionalPublicId: string,
    itemPublicId: string,
    active: boolean,
    actor: Actor,
  ) {
    const professional = await this.getProfessional(tenantId, professionalPublicId);
    const item = await this.getItem(tenantId, professional.id, itemPublicId);
    if (active)
      await this.assertNoOverlap(tenantId, professional.id, this.inputFromItem(item), itemPublicId);
    await this.repository.update(itemPublicId, { active });
    await this.audit(
      tenantId,
      actor,
      active ? 'professional_unavailability.activated' : 'professional_unavailability.deactivated',
      professional.publicId,
      { itemPublicId },
    );
    return this.list(tenantId, professional.publicId, {});
  }

  public async remove(
    tenantId: bigint,
    professionalPublicId: string,
    itemPublicId: string,
    actor: Actor,
  ) {
    const professional = await this.getProfessional(tenantId, professionalPublicId);
    await this.getItem(tenantId, professional.id, itemPublicId);
    await this.repository.delete(itemPublicId);
    await this.audit(
      tenantId,
      actor,
      'professional_unavailability.removed',
      professional.publicId,
      { itemPublicId },
    );
    return this.list(tenantId, professional.publicId, {});
  }

  private async assertNoOverlap(
    tenantId: bigint,
    professionalId: bigint,
    input: UnavailabilityInput,
    excludePublicId?: string,
  ) {
    if (!input.active) return;
    const current = await this.repository.list(tenantId, professionalId, {
      active: true,
      ...(excludePublicId === undefined ? {} : { publicId: { not: excludePublicId } }),
    });
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    const overlap = current.some((item) => startsAt < item.endsAt && endsAt > item.startsAt);
    if (overlap)
      throw new AppError({
        code: 'PROFESSIONAL_UNAVAILABILITY_OVERLAP',
        message: 'H\u00e1 uma indisponibilidade ativa sobreposta.',
        statusCode: 400,
      });
  }

  private async resolveUnitId(tenantId: bigint, unitPublicId?: string | null) {
    if (unitPublicId === undefined || unitPublicId === null) return null;
    const unit = await this.repository.findUnit(tenantId, unitPublicId);
    if (unit === null)
      throw this.notFound(
        'Unidade n\u00e3o encontrada para este estabelecimento.',
        'BUSINESS_UNIT_NOT_FOUND',
      );
    return unit.id;
  }

  private async getProfessional(tenantId: bigint, publicId: string) {
    const professional = await this.repository.findProfessional(tenantId, publicId);
    if (professional === null) throw this.notFound('Profissional n\u00e3o encontrado.');
    return professional;
  }
  private async getItem(tenantId: bigint, professionalId: bigint, publicId: string) {
    const item = await this.repository.find(tenantId, professionalId, publicId);
    if (item === null)
      throw this.notFound(
        'Indisponibilidade n\u00e3o encontrada.',
        'PROFESSIONAL_UNAVAILABILITY_NOT_FOUND',
      );
    return item;
  }
  private notFound(message: string, code = 'PROFESSIONAL_NOT_FOUND') {
    return new AppError({ code, message, statusCode: 404 });
  }
  private inputFromItem(
    item: Awaited<ReturnType<PrismaProfessionalUnavailabilityRepository['find']>> & {},
  ) {
    return {
      unitPublicId: item.unit?.publicId ?? null,
      type: item.type,
      title: item.title,
      reason: item.reason,
      startsAt: item.startsAt.toISOString(),
      endsAt: item.endsAt.toISOString(),
      allDay: item.allDay,
      repeatsWeekly: item.repeatsWeekly,
      recurrenceEndsAt: item.recurrenceEndsAt?.toISOString() ?? null,
      active: item.active,
    };
  }
  private publicItem(
    item: Awaited<ReturnType<PrismaProfessionalUnavailabilityRepository['find']>> & {},
  ) {
    return {
      publicId: item.publicId,
      professionalPublicId: item.professional.publicId,
      unitPublicId: item.unit?.publicId ?? null,
      type: item.type,
      title: item.title,
      reason: item.reason,
      startsAt: item.startsAt.toISOString(),
      endsAt: item.endsAt.toISOString(),
      allDay: item.allDay,
      repeatsWeekly: item.repeatsWeekly,
      recurrenceEndsAt: item.recurrenceEndsAt?.toISOString() ?? null,
      active: item.active,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }
  private async audit(
    tenantId: bigint,
    actor: Actor,
    action: string,
    professionalPublicId: string,
    metadata: Record<string, number | string>,
  ) {
    await this.repository.audit({
      publicId: randomUUID(),
      tenantId,
      userId: actor.userId,
      sessionId: actor.sessionId,
      action,
      targetType: 'professional',
      targetPublicId: professionalPublicId,
      metadata,
    });
  }
}
