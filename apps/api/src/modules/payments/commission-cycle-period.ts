export interface CommissionPeriod {
  periodStart: Date;
  periodEnd: Date;
}

type LocalDate = { year: number; month: number; day: number };
type LocalDateTime = LocalDate & { hour: number; minute: number; second: number };

function localDate(value: Date, timeZone: string): LocalDate {
  const fields = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const get = (type: string) => Number(fields.find((part) => part.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

function localDateTime(value: Date, timeZone: string): LocalDateTime {
  const fields = new Intl.DateTimeFormat('en-CA', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(value);
  const get = (type: string) => Number(fields.find((part) => part.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function previousMonth(year: number, month: number): LocalDate {
  return month === 1 ? { year: year - 1, month: 12, day: 1 } : { year, month: month - 1, day: 1 };
}

function zonedMidnight(date: LocalDate, timeZone: string): Date {
  let instant = new Date(Date.UTC(date.year, date.month - 1, date.day));
  for (let i = 0; i < 3; i += 1) {
    const observed = localDateTime(instant, timeZone);
    const localAsUtc = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute, observed.second);
    const desiredAsUtc = Date.UTC(date.year, date.month - 1, date.day);
    instant = new Date(instant.getTime() + desiredAsUtc - localAsUtc);
  }
  return instant;
}

function boundary(year: number, month: number, closingDay: number, timeZone: string): Date {
  return zonedMidnight({ year, month, day: Math.min(closingDay, daysInMonth(year, month)) }, timeZone);
}

export function commissionPeriodFor(
  now: Date,
  timeZone: string,
  closingDay: number,
  effectiveFrom: Date | null = null,
): CommissionPeriod | null {
  if (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31) throw new Error('closingDay must be between 1 and 31');
  const current = localDate(now, timeZone);
  const currentBoundary = boundary(current.year, current.month, closingDay, timeZone);
  const periodEnd = now.getTime() >= currentBoundary.getTime()
    ? boundary(current.month === 12 ? current.year + 1 : current.year, current.month === 12 ? 1 : current.month + 1, closingDay, timeZone)
    : currentBoundary;
  const endLocal = localDate(new Date(periodEnd.getTime() - 1), timeZone);
  const previous = previousMonth(endLocal.year, endLocal.month);
  let periodStart = boundary(previous.year, previous.month, closingDay, timeZone);
  if (effectiveFrom !== null && effectiveFrom.getTime() >= periodEnd.getTime()) return null;
  if (effectiveFrom !== null && effectiveFrom.getTime() > periodStart.getTime()) periodStart = effectiveFrom;
  return { periodStart, periodEnd };
}

export function isInPeriod(value: Date, period: CommissionPeriod): boolean {
  return value.getTime() >= period.periodStart.getTime() && value.getTime() < period.periodEnd.getTime();
}
