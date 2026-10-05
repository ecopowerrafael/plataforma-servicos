import { resolveTimezone } from '../tenants/timezone.js';

type BillingInterval = 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';

const formatter = (timezone: string) => new Intl.DateTimeFormat('en-US', {
  timeZone: resolveTimezone(timezone), year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

const localParts = (date: Date, timezone: string) => Object.fromEntries(
  formatter(timezone).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
);

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

function fromLocalParts(parts: { year: number; month: number; day: number; hour: number; minute: number; second: number }, timezone: string): Date {
  const safeTimezone = resolveTimezone(timezone);
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let guess = new Date(target);
  for (let index = 0; index < 4; index += 1) {
    const current = localParts(guess, safeTimezone);
    const represented = Date.UTC(Number(current.year), Number(current.month) - 1, Number(current.day), Number(current.hour), Number(current.minute), Number(current.second));
    guess = new Date(guess.getTime() + target - represented);
  }
  return guess;
}

export function addMembershipPeriod(start: Date, interval: BillingInterval, timezone: string, anchorDay: number): Date {
  const current = localParts(start, timezone);
  const months = { MONTHLY: 1, QUARTERLY: 3, SEMIANNUAL: 6, ANNUAL: 12 }[interval];
  const absoluteMonth = (Number(current.year) * 12) + Number(current.month) - 1 + months;
  const year = Math.floor(absoluteMonth / 12);
  const month = (absoluteMonth % 12) + 1;
  const day = Math.min(anchorDay, daysInMonth(year, month));
  return fromLocalParts({ year, month, day, hour: Number(current.hour), minute: Number(current.minute), second: Number(current.second) }, timezone);
}

export function membershipAnchorDay(firstPeriodStart: Date, timezone: string): number {
  return Number(localParts(firstPeriodStart, timezone).day);
}
