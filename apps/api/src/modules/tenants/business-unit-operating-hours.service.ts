import { randomUUID } from 'node:crypto';

import {
  type ReplaceBusinessUnitOperatingHoursRequest,
  BusinessUnitOperatingHoursResponseSchema,
} from '@plataforma/shared';

import { type PrismaBusinessUnitOperatingHoursRepository } from './business-unit-operating-hours.repository.js';
import { AppError } from '../../errors/AppError.js';

interface Actor {
  userId: bigint;
  sessionId: bigint;
}

function unitNotFound() {
  return new AppError({
    code: 'BUSINESS_UNIT_NOT_FOUND',
    message: 'Unidade não encontrada.',
    statusCode: 404,
  });
}

interface PeriodRecord {
  publicId: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const pub = (item: PeriodRecord) => ({
  publicId: item.publicId,
  weekday: item.weekday,
  startsAt: item.startsAt,
  endsAt: item.endsAt,
  active: item.active,
  createdAt: item.createdAt.toISOString(),
  updatedAt: item.updatedAt.toISOString(),
});

export class BusinessUnitOperatingHoursService {
  public constructor(private readonly repository: PrismaBusinessUnitOperatingHoursRepository) {}

  public async list(tenantId: bigint, unitPublicId: string) {
    const unit = await this.repository.findUnit(tenantId, unitPublicId);
    if (unit === null) throw unitNotFound();
    const items = await this.repository.list(tenantId, unit.id);
    return BusinessUnitOperatingHoursResponseSchema.parse({ items: items.map(pub) });
  }

  public async replace(
    tenantId: bigint,
    unitPublicId: string,
    input: ReplaceBusinessUnitOperatingHoursRequest,
    actor?: Actor,
  ) {
    const unit = await this.repository.findUnit(tenantId, unitPublicId);
    if (unit === null) throw unitNotFound();
    const items = await this.repository.replace(
      tenantId,
      unit.id,
      input.periods.map((period) => ({
        publicId: randomUUID(),
        tenantId,
        unitId: unit.id,
        weekday: period.weekday,
        startsAt: period.startsAt,
        endsAt: period.endsAt,
        active: period.active,
      })),
    );
    if (actor !== undefined)
      await this.repository.audit({
        publicId: randomUUID(),
        tenantId,
        userId: actor.userId,
        sessionId: actor.sessionId,
        action: 'business_unit_operating_hours.replaced',
        targetType: 'business_unit',
        targetPublicId: unitPublicId,
        metadata: { periodCount: input.periods.length },
      });
    return BusinessUnitOperatingHoursResponseSchema.parse({ items: items.map(pub) });
  }
}
