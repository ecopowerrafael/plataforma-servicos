export interface ResolvedDate { raw: string; isoDate: string }
export interface ResolvedTime { raw: string; time: string }

const weekday: Record<string, number> = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };

export function resolveDate(text: string, now = new Date()): ResolvedDate | undefined {
  const value = text.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLowerCase();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const relative = value.includes('depois de amanha') ? 2 : value.includes('amanha') ? 1 : value.includes('hoje') ? 0 : undefined;
  if (relative !== undefined) return { raw: relative === 0 ? 'hoje' : relative === 1 ? 'amanha' : 'depois de amanha', isoDate: addDays(base, relative).toISOString().slice(0, 10) };
  const explicit = value.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?\b/u);
  if (explicit) { const day = Number(explicit[1]); const month = Number(explicit[2]) - 1; let year = explicit[3] === undefined ? base.getFullYear() : Number(explicit[3]); let result = new Date(year, month, day); if (explicit[3] === undefined && result < base) result = new Date(year + 1, month, day); return validDate(result, day, month) ? { raw: explicit[0], isoDate: result.toISOString().slice(0, 10) } : undefined; }
  const found = Object.keys(weekday).find((day) => new RegExp(`\\b${day}(?:-feira)?\\b`, 'u').test(value));
  if (found === undefined) return undefined;
  const delta = (weekday[found]! - base.getDay() + 7) % 7 || 7;
  return { raw: found, isoDate: addDays(base, delta).toISOString().slice(0, 10) };
}

export function resolveTime(text: string): ResolvedTime | undefined {
  const value = text.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLowerCase();
  const spoken = value.match(/\b(\d{1,2})\s+da\s+(manha|tarde|noite)\b/u);
  const explicit = spoken === null ? value.match(/\b(?:as|a|às|em)?\s*(\d{1,2})(?:(?::|h)\s*(\d{2})?)?\b/u) : null;
  if (explicit === null && spoken === null) return undefined;
  const rawHour = explicit?.[1] ?? spoken?.[1]; if (rawHour === undefined) return undefined;
  let hour = Number(rawHour); const minute = Number(explicit?.[2] ?? 0); const period = spoken?.[2]; if (period === 'tarde' && hour < 12) hour += 12; if (period === 'noite' && hour < 12) hour += 12;
  if (hour > 23 || minute > 59) return undefined;
  return { raw: explicit?.[0].trim() ?? spoken?.[0].trim() ?? '', time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
}

function addDays(date: Date, days: number): Date { const result = new Date(date); result.setDate(result.getDate() + days); return result; }
function validDate(date: Date, day: number, month: number): boolean { return date.getDate() === day && date.getMonth() === month; }
