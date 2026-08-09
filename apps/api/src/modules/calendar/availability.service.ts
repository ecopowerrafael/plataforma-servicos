import { randomUUID } from 'node:crypto';

import { AvailabilityResponseSchema, CalendarResponseSchema } from '@plataforma/shared';

import { type AvailabilityRepository } from './availability.repository.js';
import { AppError } from '../../errors/AppError.js';

interface Input {
  date: string;
  professionalPublicId: string;
  servicePublicId: string;
  unitPublicId?: string | undefined;
  excludeAppointmentId?: bigint | undefined;
}
interface CalendarInput {
  from: string;
  to: string;
  professionalPublicId?: string | undefined;
  servicePublicId?: string | undefined;
  unitPublicId?: string | undefined;
}
interface Actor {
  userId: bigint;
  sessionId: bigint;
}

const formatter = (timezone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
const parts = (date: Date, timezone: string) =>
  Object.fromEntries(
    formatter(timezone)
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
const localDate = (date: Date, timezone: string) => {
  const value = parts(date, timezone);
  return `${value.year ?? '0000'}-${value.month ?? '01'}-${value.day ?? '01'}`;
};
const localMinutes = (date: Date, timezone: string) => {
  const value = parts(date, timezone);
  return Number(value.hour ?? 0) * 60 + Number(value.minute ?? 0);
};
const weekday = (date: string, timezone: string) => {
  const day = new Date(`${date}T12:00:00.000Z`);
  const value = parts(day, timezone).weekday;
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(value ?? '');
};
const timeMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const minuteTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const localAt = (date: string, minutes: number, timezone: string) => {
  const [year, month, day] = date.split('-').map(Number);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  let guess = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, hour, minute));
  for (let index = 0; index < 2; index += 1) {
    const value = parts(guess, timezone);
    const current = Date.UTC(
      Number(value.year),
      Number(value.month) - 1,
      Number(value.day),
      Number(value.hour),
      Number(value.minute),
    );
    guess = new Date(
      guess.getTime() + (Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, hour, minute) - current),
    );
  }
  return guess;
};

export class AvailabilityService {
  public constructor(private readonly repository: AvailabilityRepository) {}
  public async available(tenantId: bigint, input: Input) {
    const context = await this.repository.context(
      tenantId,
      input.professionalPublicId,
      input.servicePublicId,
    );
    const professional = context?.professionals[0];
    const service = context?.services[0];
    if (context === null || professional === undefined || service === undefined)
      throw new AppError({
        code: 'AVAILABILITY_RESOURCE_NOT_FOUND',
        message: 'Profissional ou serviço não encontrado.',
        statusCode: 404,
      });
    if (!professional.active || !service.active)
      throw new AppError({
        code: 'AVAILABILITY_RESOURCE_INACTIVE',
        message: 'Profissional ou serviço indisponível.',
        statusCode: 400,
      });
    const link = await this.repository.link(tenantId, professional.id, service.id);
    if (!link?.active)
      throw new AppError({
        code: 'PROFESSIONAL_SERVICE_LINK_REQUIRED',
        message: 'O profissional não está vinculado a este serviço.',
        statusCode: 400,
      });
    const duration = link.durationMinutes ?? service.durationMinutes;
    const pauseEnabled = link.hasPostServiceBreak ?? service.hasPostServiceBreak;
    const pause = pauseEnabled
      ? (link.postServiceBreakMinutes ?? service.postServiceBreakMinutes)
      : 0;
    const blockedMinutes = duration + pause;
    const interval = context.settings?.defaultAppointmentIntervalMinutes ?? 15;
    const minimumDate = new Date(
      Date.now() + (context.settings?.minimumAdvanceMinutes ?? 0) * 60_000,
    );
    const nowDate = localDate(minimumDate, context.timezone);
    const maximumDate = new Date();
    maximumDate.setUTCDate(
      maximumDate.getUTCDate() + (context.settings?.maximumAdvanceDays ?? 180),
    );
    if (input.date < nowDate || input.date > localDate(maximumDate, context.timezone))
      throw new AppError({
        code: 'AVAILABILITY_DATE_OUT_OF_RANGE',
        message: 'A data está fora da janela de disponibilidade.',
        statusCode: 400,
      });
    const dayStart = localAt(input.date, 0, context.timezone);
    const dayEnd = localAt(input.date, 1440, context.timezone);
    const dayOfWeek = weekday(input.date, context.timezone);
    const [schedule, unavailability, appointments] = await Promise.all([
      this.repository.schedule(tenantId, professional.id, dayOfWeek, input.unitPublicId),
      this.repository.unavailabilities(
        tenantId,
        professional.id,
        dayStart,
        dayEnd,
        input.unitPublicId,
      ),
      this.repository.appointments(
        tenantId,
        professional.id,
        dayStart,
        dayEnd,
        input.excludeAppointmentId,
      ),
    ]);
    const effectiveSchedule = await this.clipToOperatingHours(
      tenantId,
      input.unitPublicId,
      input.date,
      dayOfWeek,
      schedule,
    );
    const slots = effectiveSchedule.flatMap((period) => {
      const start = timeMinutes(period.startsAt);
      const end = timeMinutes(period.endsAt);
      const output = [] as {
        startsAt: string;
        endsAt: string;
        state: 'AVAILABLE' | 'UNAVAILABLE' | 'BLOCKED';
        reason: string | null;
      }[];
      for (let minute = start; minute + blockedMinutes <= end; minute += interval) {
        const startsAt = localAt(input.date, minute, context.timezone);
        const endsAt = localAt(input.date, minute + blockedMinutes, context.timezone);
        const block = unavailability.find((item) => {
          const itemStart = item.repeatsWeekly
            ? localAt(input.date, localMinutes(item.startsAt, context.timezone), context.timezone)
            : item.startsAt;
          const itemEnd = item.repeatsWeekly
            ? new Date(itemStart.getTime() + (item.endsAt.getTime() - item.startsAt.getTime()))
            : item.endsAt;
          return itemStart < endsAt && itemEnd > startsAt;
        });
        const booked = appointments.some(
          (appointment) => appointment.startsAt < endsAt && appointment.endsAt > startsAt,
        );
        output.push({
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          state:
            block === undefined
              ? booked
                ? 'BLOCKED'
                : 'AVAILABLE'
              : block.type === 'BLOCK'
                ? 'BLOCKED'
                : 'UNAVAILABLE',
          reason: block?.title ?? (booked ? 'Hor\u00e1rio reservado' : null),
        });
      }
      return output;
    });
    return AvailabilityResponseSchema.parse({
      date: input.date,
      timezone: context.timezone,
      intervalMinutes: interval,
      blockedMinutes,
      slots,
    });
  }
  public async calendar(tenantId: bigint, input: CalendarInput) {
    if (input.professionalPublicId === undefined || input.servicePublicId === undefined)
      throw new AppError({
        code: 'CALENDAR_FILTER_REQUIRED',
        message: 'Selecione profissional e serviço para visualizar a agenda.',
        statusCode: 400,
      });
    const professionalPublicId = input.professionalPublicId;
    const servicePublicId = input.servicePublicId;
    const dates: string[] = [];
    for (
      let date = new Date(`${input.from}T12:00:00.000Z`);
      date <= new Date(`${input.to}T12:00:00.000Z`);
      date.setUTCDate(date.getUTCDate() + 1)
    )
      dates.push(date.toISOString().slice(0, 10));
    if (dates.length > 7)
      throw new AppError({
        code: 'CALENDAR_RANGE_TOO_LARGE',
        message: 'Informe até sete dias.',
        statusCode: 400,
      });
    const days = await Promise.all(
      dates.map(async (date) => ({
        date,
        slots: (
          await this.available(tenantId, {
            date,
            professionalPublicId,
            servicePublicId,
            ...(input.unitPublicId === undefined ? {} : { unitPublicId: input.unitPublicId }),
          })
        ).slots,
      })),
    );
    const first = await this.available(tenantId, {
      date: dates[0] ?? input.from,
      professionalPublicId,
      servicePublicId,
      ...(input.unitPublicId === undefined ? {} : { unitPublicId: input.unitPublicId }),
    });
    return CalendarResponseSchema.parse({ timezone: first.timezone, days });
  }
  public async assertSlot(tenantId: bigint, input: Omit<Input, 'date'> & { startsAt: string }) {
    const context = await this.repository.context(
      tenantId,
      input.professionalPublicId,
      input.servicePublicId,
    );
    const timezone = context?.timezone ?? 'UTC';
    const date = localDate(new Date(input.startsAt), timezone);
    const result = await this.available(tenantId, {
      date,
      professionalPublicId: input.professionalPublicId,
      servicePublicId: input.servicePublicId,
      ...(input.unitPublicId === undefined ? {} : { unitPublicId: input.unitPublicId }),
      ...(input.excludeAppointmentId === undefined
        ? {}
        : { excludeAppointmentId: input.excludeAppointmentId }),
    });
    if (
      !result.slots.some(
        (slot) =>
          slot.state === 'AVAILABLE' && slot.startsAt === new Date(input.startsAt).toISOString(),
      )
    )
      throw new AppError({
        code: 'APPOINTMENT_SLOT_UNAVAILABLE',
        message: 'O horário selecionado não está disponível.',
        statusCode: 409,
      });
  }
  public async auditRead(
    tenantId: bigint,
    actor: Actor,
    action: 'availability.read' | 'calendar.read',
  ) {
    await this.repository.audit({
      publicId: randomUUID(),
      tenantId,
      userId: actor.userId,
      sessionId: actor.sessionId,
      action,
      targetType: 'calendar',
      targetPublicId: null,
    });
  }
  private async clipToOperatingHours(
    tenantId: bigint,
    unitPublicId: string | undefined,
    date: string,
    dayOfWeek: number,
    schedule: { startsAt: string; endsAt: string }[],
  ): Promise<{ startsAt: string; endsAt: string }[]> {
    if (unitPublicId === undefined) return schedule;
    const unit = await this.repository.unit(tenantId, unitPublicId);
    if (unit === null) return schedule;
    const windows = await this.resolveUnitWindows(tenantId, unit.id, date, dayOfWeek);
    if (windows === null) return schedule;
    if (windows.length === 0) return [];
    return schedule.flatMap((period) => {
      const start = timeMinutes(period.startsAt);
      const end = timeMinutes(period.endsAt);
      return windows
        .map((window) => ({
          start: Math.max(start, window.start),
          end: Math.min(end, window.end),
        }))
        .filter((clipped) => clipped.start < clipped.end)
        .map((clipped) => ({
          startsAt: minuteTime(clipped.start),
          endsAt: minuteTime(clipped.end),
        }));
    });
  }
  /**
   * Prioridade: 1) exceção específica da data, 2) feriado, 3) horário semanal da unidade.
   * Retorna null quando nada está configurado (sem restrição); retorna [] quando o dia está fechado.
   */
  private async resolveUnitWindows(
    tenantId: bigint,
    unitId: bigint,
    date: string,
    dayOfWeek: number,
  ): Promise<{ start: number; end: number }[] | null> {
    const overrides = await this.repository.dateOverrides(
      tenantId,
      unitId,
      new Date(`${date}T00:00:00.000Z`),
    );
    const toWindows = (
      rows: { closed: boolean; startsAt: string | null; endsAt: string | null }[],
    ) =>
      rows.flatMap((row) => {
        if (row.closed || row.startsAt === null || row.endsAt === null) return [];
        return [{ start: timeMinutes(row.startsAt), end: timeMinutes(row.endsAt) }];
      });
    const exceptions = overrides.filter((row) => row.type === 'EXCEPTION');
    if (exceptions.length > 0) return toWindows(exceptions);
    const holidays = overrides.filter((row) => row.type === 'HOLIDAY');
    if (holidays.length > 0) return toWindows(holidays);
    const operatingHours = await this.repository.operatingHours(tenantId, unitId);
    if (operatingHours.length === 0) return null;
    return operatingHours
      .filter((period) => period.active && period.weekday === dayOfWeek)
      .map((period) => ({
        start: timeMinutes(period.startsAt),
        end: timeMinutes(period.endsAt),
      }));
  }
}
