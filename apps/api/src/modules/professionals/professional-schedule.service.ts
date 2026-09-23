import { randomUUID } from 'node:crypto';

import { ProfessionalScheduleResponseSchema } from '@plataforma/shared';

import { type PrismaProfessionalScheduleRepository } from './professional-schedule.repository.js';
import { AppError } from '../../errors/AppError.js';

interface SchedulePeriodInput {
  weekday: number;
  startsAt: string;
  endsAt: string;
  unitPublicId?: string | null | undefined;
  active: boolean;
}

interface ScheduleInput {
  periods: SchedulePeriodInput[];
  copyToWeekdays?: number[] | undefined;
  professionalPublicIds?: string[] | undefined;
}

interface Actor {
  userId: bigint;
  sessionId: bigint | null;
}

interface ExistingPeriod {
  publicId: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  active: boolean;
}

const minutesFromTime = (value: string) =>
  Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));

export class ProfessionalScheduleService {
  public constructor(private readonly repository: PrismaProfessionalScheduleRepository) {}

  public async list(tenantId: bigint, professionalPublicId: string) {
    const professional = await this.getProfessional(tenantId, professionalPublicId);
    const items = await this.repository.list(tenantId, professional.id);
    return ProfessionalScheduleResponseSchema.parse({
      items: items.map((item) => ({
        publicId: item.publicId,
        weekday: item.weekday,
        startsAt: item.startsAt,
        endsAt: item.endsAt,
        unitPublicId: item.unit?.publicId ?? null,
        active: item.active,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      weeklyMinutes: items
        .filter((item) => item.active)
        .reduce(
          (total, item) => total + minutesFromTime(item.endsAt) - minutesFromTime(item.startsAt),
          0,
        ),
    });
  }

  public async create(
    tenantId: bigint,
    professionalPublicId: string,
    input: ScheduleInput,
    actor: Actor,
  ) {
    const sourceProfessional = await this.getProfessional(tenantId, professionalPublicId);
    const periods = this.expandCopiedDays(input.periods, input.copyToWeekdays);
    const targetPublicIds = [
      ...new Set([sourceProfessional.publicId, ...(input.professionalPublicIds ?? [])]),
    ];
    const professionals = await this.repository.findProfessionals(tenantId, targetPublicIds);
    if (professionals.length !== targetPublicIds.length) {
      throw new AppError({
        code: 'PROFESSIONAL_NOT_FOUND',
        message: 'Um dos profissionais selecionados n\u00e3o foi encontrado.',
        statusCode: 404,
      });
    }
    const unitIds = await this.resolveUnitIds(tenantId, periods);

    for (const professional of professionals) {
      const existing = await this.repository.list(tenantId, professional.id);
      this.assertNoOverlap(existing, periods);
    }

    for (const professional of professionals) {
      for (const [index, period] of periods.entries()) {
        await this.repository.create({
          publicId: randomUUID(),
          tenantId,
          professionalId: professional.id,
          weekday: period.weekday,
          startsAt: period.startsAt,
          endsAt: period.endsAt,
          active: period.active,
          unitId: unitIds[index] ?? null,
        });
      }
    }
    await this.writeAudit(
      tenantId,
      actor,
      'professional_schedule.created',
      sourceProfessional.publicId,
      {
        professionalCount: professionals.length,
        periodCount: periods.length,
      },
    );
    return this.list(tenantId, sourceProfessional.publicId);
  }

  public async update(
    tenantId: bigint,
    professionalPublicId: string,
    periodPublicId: string,
    input: SchedulePeriodInput,
    actor: Actor,
  ) {
    const professional = await this.getProfessional(tenantId, professionalPublicId);
    const current = await this.getPeriod(tenantId, professional.id, periodPublicId);
    const unitId = await this.resolveUnitId(tenantId, input.unitPublicId);
    const existing = await this.repository.list(tenantId, professional.id);
    this.assertNoOverlap(
      existing.filter((period) => period.publicId !== current.publicId),
      [input],
    );
    await this.repository.update(periodPublicId, {
      weekday: input.weekday,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      unitId,
      active: input.active,
    });
    await this.writeAudit(tenantId, actor, 'professional_schedule.updated', professional.publicId, {
      periodPublicId,
    });
    return this.list(tenantId, professional.publicId);
  }

  public async replace(
    tenantId: bigint,
    professionalPublicId: string,
    input: ScheduleInput,
    actor: Actor,
  ) {
    const professional = await this.getProfessional(tenantId, professionalPublicId);
    const periods = input.periods;
    this.assertNoOverlap([], periods);
    const unitIds = await this.resolveUnitIds(tenantId, periods);
    await this.repository.replace(
      tenantId,
      professional.id,
      periods.map((period, index) => ({
        publicId: randomUUID(), tenantId, professionalId: professional.id, weekday: period.weekday,
        startsAt: period.startsAt, endsAt: period.endsAt, active: period.active,
        unitId: unitIds[index] ?? null,
      })),
    );
    await this.writeAudit(tenantId, actor, 'professional_schedule.replaced', professional.publicId, {
      periodCount: periods.length,
    });
    return this.list(tenantId, professional.publicId);
  }

  public async setStatus(
    tenantId: bigint,
    professionalPublicId: string,
    periodPublicId: string,
    active: boolean,
    actor: Actor,
  ) {
    const professional = await this.getProfessional(tenantId, professionalPublicId);
    const current = await this.getPeriod(tenantId, professional.id, periodPublicId);
    if (active) {
      const existing = await this.repository.list(tenantId, professional.id);
      this.assertNoOverlap(
        existing.filter((period) => period.publicId !== current.publicId),
        [current],
      );
    }
    await this.repository.update(periodPublicId, { active });
    await this.writeAudit(
      tenantId,
      actor,
      active ? 'professional_schedule.activated' : 'professional_schedule.deactivated',
      professional.publicId,
      { periodPublicId },
    );
    return this.list(tenantId, professional.publicId);
  }

  public async remove(
    tenantId: bigint,
    professionalPublicId: string,
    periodPublicId: string,
    actor: Actor,
  ) {
    const professional = await this.getProfessional(tenantId, professionalPublicId);
    await this.getPeriod(tenantId, professional.id, periodPublicId);
    await this.repository.delete(periodPublicId);
    await this.writeAudit(tenantId, actor, 'professional_schedule.removed', professional.publicId, {
      periodPublicId,
    });
    return this.list(tenantId, professional.publicId);
  }

  private async getProfessional(tenantId: bigint, publicId: string) {
    const professional = await this.repository.findProfessional(tenantId, publicId);
    if (professional === null) {
      throw new AppError({
        code: 'PROFESSIONAL_NOT_FOUND',
        message: 'Profissional n\u00e3o encontrado.',
        statusCode: 404,
      });
    }
    return professional;
  }

  private async getPeriod(tenantId: bigint, professionalId: bigint, publicId: string) {
    const period = await this.repository.findPeriod(tenantId, professionalId, publicId);
    if (period === null) {
      throw new AppError({
        code: 'PROFESSIONAL_SCHEDULE_PERIOD_NOT_FOUND',
        message: 'Per\u00edodo da jornada n\u00e3o encontrado.',
        statusCode: 404,
      });
    }
    return period;
  }

  private expandCopiedDays(periods: SchedulePeriodInput[], copyToWeekdays?: number[]) {
    const copies = copyToWeekdays ?? [];
    return periods.flatMap((period) => [
      period,
      ...copies
        .filter((weekday) => weekday !== period.weekday)
        .map((weekday) => ({ ...period, weekday })),
    ]);
  }

  private assertNoOverlap(existing: ExistingPeriod[], proposed: SchedulePeriodInput[]) {
    const combined = [
      ...existing.filter((period) => period.active),
      ...proposed.filter((period) => period.active),
    ].sort(
      (left, right) => left.weekday - right.weekday || left.startsAt.localeCompare(right.startsAt),
    );
    for (let index = 1; index < combined.length; index += 1) {
      const previous = combined[index - 1];
      const current = combined[index];
      if (previous === undefined || current === undefined) continue;
      if (previous.weekday === current.weekday && current.startsAt < previous.endsAt) {
        throw new AppError({
          code: 'PROFESSIONAL_SCHEDULE_OVERLAP',
          message: 'H\u00e1 per\u00edodos sobrepostos na jornada semanal.',
          statusCode: 400,
        });
      }
    }
  }

  private async resolveUnitIds(tenantId: bigint, periods: SchedulePeriodInput[]) {
    return Promise.all(periods.map((period) => this.resolveUnitId(tenantId, period.unitPublicId)));
  }

  private async resolveUnitId(tenantId: bigint, unitPublicId?: string | null) {
    if (unitPublicId === undefined || unitPublicId === null) return null;
    const unit = await this.repository.findUnit(tenantId, unitPublicId);
    if (unit === null) {
      throw new AppError({
        code: 'BUSINESS_UNIT_NOT_FOUND',
        message: 'Unidade n\u00e3o encontrada para este estabelecimento.',
        statusCode: 404,
      });
    }
    return unit.id;
  }

  private async writeAudit(
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
