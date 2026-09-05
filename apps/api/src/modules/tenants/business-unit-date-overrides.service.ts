import { randomUUID } from 'node:crypto';

import {
  type ReplaceBusinessUnitDateOverrideRequest,
  BusinessUnitDateOverridesResponseSchema,
  BusinessUnitDateOverrideDaySchema,
} from '@plataforma/shared';

import { type PrismaBusinessUnitDateOverridesRepository } from './business-unit-date-overrides.repository.js';
import { type BusinessUnitDateOverrideType } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';

interface Actor {
  userId: bigint;
  sessionId: bigint | null;
}

interface OverrideRow {
  date: Date;
  type: BusinessUnitDateOverrideType;
  closed: boolean;
  startsAt: string | null;
  endsAt: string | null;
  title: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function unitNotFound() {
  return new AppError({
    code: 'BUSINESS_UNIT_NOT_FOUND',
    message: 'Unidade não encontrada.',
    statusCode: 404,
  });
}

const formatDate = (date: Date) => date.toISOString().slice(0, 10);
const parseDate = (date: string) => new Date(`${date}T00:00:00.000Z`);

function toDay(date: string, rows: OverrideRow[]) {
  const first = rows[0];
  if (first === undefined) return null;
  return BusinessUnitDateOverrideDaySchema.parse({
    date,
    type: first.type,
    closed: first.closed,
    title: first.title,
    periods: rows
      .filter((row) => !row.closed)
      .map((row) => ({ startsAt: row.startsAt, endsAt: row.endsAt })),
    active: first.active,
    createdAt: first.createdAt.toISOString(),
    updatedAt: first.updatedAt.toISOString(),
  });
}

export class BusinessUnitDateOverridesService {
  public constructor(private readonly repository: PrismaBusinessUnitDateOverridesRepository) {}

  public async list(tenantId: bigint, unitPublicId: string, from: string, to: string) {
    const unit = await this.repository.findUnit(tenantId, unitPublicId);
    if (unit === null) throw unitNotFound();
    const rows = await this.repository.list(tenantId, unit.id, parseDate(from), parseDate(to));
    const byDate = new Map<string, OverrideRow[]>();
    for (const row of rows) {
      const key = formatDate(row.date);
      const list = byDate.get(key) ?? [];
      list.push(row);
      byDate.set(key, list);
    }
    const items = [...byDate.entries()]
      .map(([date, dayRows]) => toDay(date, dayRows))
      .filter((day) => day !== null);
    return BusinessUnitDateOverridesResponseSchema.parse({ items });
  }

  public async replace(
    tenantId: bigint,
    unitPublicId: string,
    date: string,
    input: ReplaceBusinessUnitDateOverrideRequest,
    actor?: Actor,
  ) {
    const unit = await this.repository.findUnit(tenantId, unitPublicId);
    if (unit === null) throw unitNotFound();
    const parsedDate = parseDate(date);
    const rows = input.closed
      ? [
          {
            publicId: randomUUID(),
            tenantId,
            unitId: unit.id,
            date: parsedDate,
            type: input.type,
            closed: true,
            startsAt: null,
            endsAt: null,
            title: input.title ?? null,
          },
        ]
      : input.periods.map((period) => ({
          publicId: randomUUID(),
          tenantId,
          unitId: unit.id,
          date: parsedDate,
          type: input.type,
          closed: false,
          startsAt: period.startsAt,
          endsAt: period.endsAt,
          title: input.title ?? null,
        }));
    const saved = await this.repository.replace(tenantId, unit.id, parsedDate, rows);
    if (actor !== undefined)
      await this.repository.audit({
        publicId: randomUUID(),
        tenantId,
        userId: actor.userId,
        sessionId: actor.sessionId,
        action: 'business_unit_date_override.replaced',
        targetType: 'business_unit',
        targetPublicId: unitPublicId,
        metadata: { date, type: input.type, closed: input.closed },
      });
    const day = toDay(date, saved);
    if (day === null)
      throw new AppError({
        code: 'BUSINESS_UNIT_DATE_OVERRIDE_SAVE_FAILED',
        message: 'Não foi possível salvar a exceção de horário.',
        statusCode: 500,
      });
    return day;
  }

  public async remove(tenantId: bigint, unitPublicId: string, date: string, actor?: Actor) {
    const unit = await this.repository.findUnit(tenantId, unitPublicId);
    if (unit === null) throw unitNotFound();
    await this.repository.remove(tenantId, unit.id, parseDate(date));
    if (actor !== undefined)
      await this.repository.audit({
        publicId: randomUUID(),
        tenantId,
        userId: actor.userId,
        sessionId: actor.sessionId,
        action: 'business_unit_date_override.removed',
        targetType: 'business_unit',
        targetPublicId: unitPublicId,
        metadata: { date },
      });
  }
}
