import { zonedDayKey } from '../tenants/timezone.js';

export interface AttemptDecisionRule {
  maxAttemptsPerDay: number;
  consecutiveDays: number;
  pauseDaysAfterCycle: number;
  maxCycles: number | null;
  allowedStartHour: number;
  allowedEndHour: number;
  minMinutesBetweenAttempts: number;
  skipSundays: boolean;
}

export interface ExistingAttempt {
  cycleNumber: number;
  scheduledAt: Date;
  sentAt: Date | null;
  respondedAt: Date | null;
}

export type AttemptType = 'INITIAL_COLLECTION' | 'SAME_DAY_FOLLOWUP' | 'NEXT_DAY_FOLLOWUP' | 'CYCLE_RESTART';

export type AttemptSkipReason =
  | 'OUTSIDE_ALLOWED_HOURS'
  | 'SUNDAY'
  | 'DAILY_LIMIT_REACHED'
  | 'ATTEMPT_INTERVAL_NOT_REACHED'
  | 'CUSTOMER_RESPONDED'
  | 'CYCLE_PAUSE'
  | 'MAX_CYCLES_REACHED';

export type AttemptDecision =
  | { action: 'create'; cycleNumber: number; attemptNumber: number; attemptType: AttemptType }
  | { action: 'skip'; reason: AttemptSkipReason };

/** Hora local (0-23) do instante no fuso informado — mesma técnica de appointment-reminder.service.ts. */
function localHour(date: Date, timezone: string): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' }).format(date),
  );
}

function isLocalSunday(date: Date, timezone: string): boolean {
  return new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(date) === 'Sun';
}

/**
 * Diferença em dias civis entre duas chaves "YYYY-MM-DD", podendo ser 0 (mesmo
 * dia). Não reaproveita `daysBetweenDays` de tenants/timezone.ts porque aquela
 * função tem piso de 1 dia (feita para duração de período de relatório) — aqui
 * precisamos exatamente do valor 0 para "hoje é o primeiro dia do ciclo".
 */
function daysSinceDayKey(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00.000Z`).getTime();
  const end = new Date(`${to}T00:00:00.000Z`).getTime();
  return Math.round((end - start) / 86_400_000);
}

/**
 * Decide se uma Debt ativa deve ganhar uma nova CollectionAttempt agora.
 * Pura: não toca banco, não envia nada — só matemática de régua + calendário
 * civil no fuso do tenant. O ciclo é definido só por consecutiveDays +
 * pauseDaysAfterCycle (cadenceType/preferredWeekday/monthlyDay ficam de fora
 * nesta fase — ver plano da Fase 3).
 */
export function decideNextAttempt(input: {
  rule: AttemptDecisionRule;
  existingAttempts: ExistingAttempt[];
  now: Date;
  timezone: string;
}): AttemptDecision {
  const { rule, existingAttempts, now, timezone } = input;

  if (rule.skipSundays && isLocalSunday(now, timezone)) return { action: 'skip', reason: 'SUNDAY' };

  const hour = localHour(now, timezone);
  if (hour < rule.allowedStartHour || hour >= rule.allowedEndHour)
    return { action: 'skip', reason: 'OUTSIDE_ALLOWED_HOURS' };

  if (existingAttempts.length === 0)
    return { action: 'create', cycleNumber: 1, attemptNumber: 1, attemptType: 'INITIAL_COLLECTION' };

  const today = zonedDayKey(now, timezone);
  const last = existingAttempts[existingAttempts.length - 1]!;
  const lastDay = zonedDayKey(last.scheduledAt, timezone);

  if (lastDay === today) {
    // Se a última tentativa recebeu resposta, não enviar SAME_DAY_FOLLOWUP automaticamente.
    if (last.respondedAt !== null) return { action: 'skip', reason: 'CUSTOMER_RESPONDED' };

    const attemptsToday = existingAttempts.filter((a) => zonedDayKey(a.scheduledAt, timezone) === today).length;
    if (attemptsToday >= rule.maxAttemptsPerDay) return { action: 'skip', reason: 'DAILY_LIMIT_REACHED' };

    // Verificar intervalo mínimo entre tentativas: usar sentAt se disponível, senão scheduledAt.
    const lastAttemptTime = last.sentAt ?? last.scheduledAt;
    const minutesSinceLastAttempt = Math.floor((now.getTime() - lastAttemptTime.getTime()) / 60_000);
    if (minutesSinceLastAttempt < rule.minMinutesBetweenAttempts)
      return { action: 'skip', reason: 'ATTEMPT_INTERVAL_NOT_REACHED' };

    return {
      action: 'create',
      cycleNumber: last.cycleNumber,
      attemptNumber: attemptsToday + 1,
      attemptType: 'SAME_DAY_FOLLOWUP',
    };
  }

  const cycleAttempts = existingAttempts.filter((a) => a.cycleNumber === last.cycleNumber);
  const cycleStartDay = zonedDayKey(cycleAttempts[0]!.scheduledAt, timezone);
  const daysSinceCycleStart = daysSinceDayKey(cycleStartDay, today);

  if (daysSinceCycleStart < rule.consecutiveDays)
    return { action: 'create', cycleNumber: last.cycleNumber, attemptNumber: 1, attemptType: 'NEXT_DAY_FOLLOWUP' };

  if (daysSinceCycleStart < rule.consecutiveDays + rule.pauseDaysAfterCycle)
    return { action: 'skip', reason: 'CYCLE_PAUSE' };

  if (rule.maxCycles !== null && last.cycleNumber >= rule.maxCycles)
    return { action: 'skip', reason: 'MAX_CYCLES_REACHED' };

  return { action: 'create', cycleNumber: last.cycleNumber + 1, attemptNumber: 1, attemptType: 'CYCLE_RESTART' };
}
