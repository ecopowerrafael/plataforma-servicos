import { describe, expect, it } from 'vitest';

import { decideNextAttempt, type AttemptDecisionRule } from './collection-attempt-engine.js';

const rule = (overrides: Partial<AttemptDecisionRule> = {}): AttemptDecisionRule => ({
  maxAttemptsPerDay: 1,
  consecutiveDays: 3,
  pauseDaysAfterCycle: 4,
  maxCycles: null,
  allowedStartHour: 9,
  allowedEndHour: 18,
  skipSundays: true,
  ...overrides,
});

// 2026-08-24 é uma segunda-feira; 2026-08-23 é domingo. Horário 12:00 UTC = meio-dia em UTC (timezone 'UTC' nos testes).
const monday = new Date('2026-08-24T12:00:00.000Z');
const sunday = new Date('2026-08-23T12:00:00.000Z');

describe('decideNextAttempt', () => {
  it('1) sem tentativa nenhuma: cria ciclo 1, tentativa 1, INITIAL_COLLECTION', () => {
    const decision = decideNextAttempt({ rule: rule(), existingAttempts: [], now: monday, timezone: 'UTC' });
    expect(decision).toEqual({ action: 'create', cycleNumber: 1, attemptNumber: 1, attemptType: 'INITIAL_COLLECTION' });
  });

  it('fora do horário permitido: skip mesmo sem tentativa nenhuma', () => {
    const earlyMorning = new Date('2026-08-24T05:00:00.000Z'); // 05:00 < allowedStartHour=9
    const decision = decideNextAttempt({ rule: rule(), existingAttempts: [], now: earlyMorning, timezone: 'UTC' });
    expect(decision).toEqual({ action: 'skip', reason: 'OUTSIDE_ALLOWED_HOURS' });
  });

  it('domingo com skipSundays: skip mesmo sem tentativa nenhuma', () => {
    const decision = decideNextAttempt({ rule: rule(), existingAttempts: [], now: sunday, timezone: 'UTC' });
    expect(decision).toEqual({ action: 'skip', reason: 'SUNDAY' });
  });

  it('domingo com skipSundays=false: segue normalmente', () => {
    const decision = decideNextAttempt({
      rule: rule({ skipSundays: false }),
      existingAttempts: [],
      now: sunday,
      timezone: 'UTC',
    });
    expect(decision.action).toBe('create');
  });

  it('2) já tentou hoje, mas não bateu maxAttemptsPerDay: mais uma tentativa no mesmo dia (SAME_DAY_FOLLOWUP)', () => {
    const decision = decideNextAttempt({
      rule: rule({ maxAttemptsPerDay: 2 }),
      existingAttempts: [{ cycleNumber: 1, scheduledAt: new Date('2026-08-24T10:00:00.000Z'), sentAt: null, respondedAt: null }],
      now: monday,
      timezone: 'UTC',
    });
    expect(decision).toEqual({ action: 'create', cycleNumber: 1, attemptNumber: 2, attemptType: 'SAME_DAY_FOLLOWUP' });
  });

  it('já bateu maxAttemptsPerDay hoje: skip', () => {
    const decision = decideNextAttempt({
      rule: rule({ maxAttemptsPerDay: 1 }),
      existingAttempts: [{ cycleNumber: 1, scheduledAt: new Date('2026-08-24T10:00:00.000Z'), sentAt: null, respondedAt: null }],
      now: monday,
      timezone: 'UTC',
    });
    expect(decision).toEqual({ action: 'skip', reason: 'DAILY_LIMIT_REACHED' });
  });

  it('3) dia seguinte, ainda dentro de consecutiveDays: novo dia do mesmo ciclo (NEXT_DAY_FOLLOWUP)', () => {
    // ciclo começou segunda (24), hoje é terça (25) — consecutiveDays=3, dia 1 do ciclo já passou.
    const decision = decideNextAttempt({
      rule: rule({ consecutiveDays: 3 }),
      existingAttempts: [{ cycleNumber: 1, scheduledAt: monday, sentAt: null, respondedAt: null }],
      now: new Date('2026-08-25T12:00:00.000Z'),
      timezone: 'UTC',
    });
    expect(decision).toEqual({ action: 'create', cycleNumber: 1, attemptNumber: 1, attemptType: 'NEXT_DAY_FOLLOWUP' });
  });

  it('4) dentro da janela de pausa (depois de consecutiveDays, antes de consecutiveDays+pauseDaysAfterCycle): skip', () => {
    // ciclo começou segunda (24-08), consecutiveDays=3 (dias 0,1,2 -> até 26-08), pauseDaysAfterCycle=4 (27,28,29,30).
    const decision = decideNextAttempt({
      rule: rule({ consecutiveDays: 3, pauseDaysAfterCycle: 4 }),
      existingAttempts: [{ cycleNumber: 1, scheduledAt: monday, sentAt: null, respondedAt: null }], // início do ciclo: 24-08
      now: new Date('2026-08-27T12:00:00.000Z'), // 3 dias depois do início (dia 3, já fora de consecutiveDays=3)
      timezone: 'UTC',
    });
    expect(decision).toEqual({ action: 'skip', reason: 'CYCLE_PAUSE' });
  });

  it('5) depois da pausa: novo ciclo (CYCLE_RESTART)', () => {
    // início do ciclo 24-08; consecutiveDays=3 + pauseDaysAfterCycle=4 = 7 dias -> 31-08 já é novo ciclo.
    const decision = decideNextAttempt({
      rule: rule({ consecutiveDays: 3, pauseDaysAfterCycle: 4 }),
      existingAttempts: [{ cycleNumber: 1, scheduledAt: monday, sentAt: null, respondedAt: null }],
      now: new Date('2026-08-31T12:00:00.000Z'),
      timezone: 'UTC',
    });
    expect(decision).toEqual({ action: 'create', cycleNumber: 2, attemptNumber: 1, attemptType: 'CYCLE_RESTART' });
  });

  it('6) maxCycles atingido: nunca mais reinicia (skip permanente)', () => {
    const decision = decideNextAttempt({
      rule: rule({ consecutiveDays: 3, pauseDaysAfterCycle: 4, maxCycles: 1 }),
      existingAttempts: [{ cycleNumber: 1, scheduledAt: monday, sentAt: null, respondedAt: null }],
      now: new Date('2026-08-31T12:00:00.000Z'),
      timezone: 'UTC',
    });
    expect(decision).toEqual({ action: 'skip', reason: 'MAX_CYCLES_REACHED' });
  });

  it('considera só as tentativas do ciclo atual para achar o início do ciclo (ciclo anterior não interfere)', () => {
    const decision = decideNextAttempt({
      rule: rule({ consecutiveDays: 3, pauseDaysAfterCycle: 4 }),
      existingAttempts: [
        { cycleNumber: 1, scheduledAt: new Date('2026-08-10T12:00:00.000Z'), sentAt: null, respondedAt: null },
        { cycleNumber: 2, scheduledAt: monday, sentAt: null, respondedAt: null }, // ciclo 2 começou 24-08
      ],
      now: new Date('2026-08-25T12:00:00.000Z'), // 1 dia depois do início do ciclo 2
      timezone: 'UTC',
    });
    expect(decision).toEqual({ action: 'create', cycleNumber: 2, attemptNumber: 1, attemptType: 'NEXT_DAY_FOLLOWUP' });
  });

  it('intervalo mínimo entre tentativas: antes do intervalo mínimo → skip', () => {
    const lastAttempt = new Date('2026-08-24T10:00:00.000Z'); // 10:00
    const now = new Date('2026-08-24T11:00:00.000Z'); // 11:00 (60 min depois, minMinutesBetweenAttempts=120)
    const decision = decideNextAttempt({
      rule: rule({ maxAttemptsPerDay: 3, minMinutesBetweenAttempts: 120 }),
      existingAttempts: [{ cycleNumber: 1, scheduledAt: lastAttempt, sentAt: lastAttempt, respondedAt: null }],
      now,
      timezone: 'UTC',
    });
    expect(decision).toEqual({ action: 'skip', reason: 'ATTEMPT_INTERVAL_NOT_REACHED' });
  });

  it('intervalo mínimo entre tentativas: depois do intervalo mínimo → create', () => {
    const lastAttempt = new Date('2026-08-24T10:00:00.000Z'); // 10:00
    const now = new Date('2026-08-24T12:01:00.000Z'); // 12:01 (121 min depois)
    const decision = decideNextAttempt({
      rule: rule({ maxAttemptsPerDay: 3, minMinutesBetweenAttempts: 120 }),
      existingAttempts: [{ cycleNumber: 1, scheduledAt: lastAttempt, sentAt: lastAttempt, respondedAt: null }],
      now,
      timezone: 'UTC',
    });
    expect(decision).toEqual({ action: 'create', cycleNumber: 1, attemptNumber: 2, attemptType: 'SAME_DAY_FOLLOWUP' });
  });

  it('se respondedAt != null: não cria SAME_DAY_FOLLOWUP (bloqueia pelas 24h)', () => {
    const lastAttempt = new Date('2026-08-24T10:00:00.000Z'); // 10:00
    const respondedTime = new Date('2026-08-24T10:05:00.000Z'); // respondeu 5min depois
    const now = new Date('2026-08-24T12:01:00.000Z'); // 12:01 (mesmo depois do intervalo mínimo)
    const decision = decideNextAttempt({
      rule: rule({ maxAttemptsPerDay: 3, minMinutesBetweenAttempts: 120 }),
      existingAttempts: [
        { cycleNumber: 1, scheduledAt: lastAttempt, sentAt: lastAttempt, respondedAt: respondedTime },
      ],
      now,
      timezone: 'UTC',
    });
    expect(decision).toEqual({ action: 'skip', reason: 'CUSTOMER_RESPONDED' });
  });

  it('usa sentAt em vez de scheduledAt para calcular intervalo (se sentAt existir)', () => {
    const scheduled = new Date('2026-08-24T10:00:00.000Z');
    const sent = new Date('2026-08-24T10:30:00.000Z'); // enviada depois de agendar
    const now = new Date('2026-08-24T12:01:00.000Z'); // 91 min depois de enviada (< 120)
    const decision = decideNextAttempt({
      rule: rule({ maxAttemptsPerDay: 3, minMinutesBetweenAttempts: 120 }),
      existingAttempts: [{ cycleNumber: 1, scheduledAt: scheduled, sentAt: sent, respondedAt: null }],
      now,
      timezone: 'UTC',
    });
    expect(decision).toEqual({ action: 'skip', reason: 'ATTEMPT_INTERVAL_NOT_REACHED' });
  });

  it('não comprime tentativas no fim do dia: próximo worker tick > allowedEndHour', () => {
    // Debt criada às 16:45, campanhas 09-18, 3 tentativas/dia, intervalo 120 min
    // 16:45 + primeira tentativa
    // próxima elegível: 18:45 (fora da janela 09-18)
    // não deve tentar enviar antes de fechar
    const lastAttempt = new Date('2026-08-24T16:45:00.000Z');
    const now = new Date('2026-08-24T17:50:00.000Z'); // 65 min depois, ainda falta 70 min
    const decision = decideNextAttempt({
      rule: rule({ maxAttemptsPerDay: 3, minMinutesBetweenAttempts: 120, allowedStartHour: 9, allowedEndHour: 18 }),
      existingAttempts: [{ cycleNumber: 1, scheduledAt: lastAttempt, sentAt: lastAttempt, respondedAt: null }],
      now,
      timezone: 'UTC',
    });
    expect(decision).toEqual({ action: 'skip', reason: 'ATTEMPT_INTERVAL_NOT_REACHED' });
  });
});
