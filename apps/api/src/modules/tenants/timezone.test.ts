import { describe, expect, it } from 'vitest';

import { addDaysToDay, daysBetweenDays, zonedDayKey, zonedDayStart } from './timezone.js';

describe('dia civil no fuso do estabelecimento', () => {
  it('resolve a meia-noite local, não a do servidor', () => {
    expect(zonedDayStart('2026-08-15', 'America/Sao_Paulo').toISOString()).toBe(
      '2026-08-15T03:00:00.000Z',
    );
    expect(zonedDayStart('2026-08-15', 'UTC').toISOString()).toBe('2026-08-15T00:00:00.000Z');
    expect(zonedDayStart('2026-08-15', 'America/Manaus').toISOString()).toBe(
      '2026-08-15T04:00:00.000Z',
    );
  });

  it('classifica a borda de UTC no dia correto do negócio', () => {
    // 02:00Z do dia 16 ainda é dia 15 em São Paulo.
    const borda = new Date('2026-08-16T02:00:00.000Z');
    expect(zonedDayKey(borda, 'America/Sao_Paulo')).toBe('2026-08-15');
    expect(zonedDayKey(borda, 'UTC')).toBe('2026-08-16');
    // 23:00Z do dia 15 já é dia 16 em Tóquio.
    const noite = new Date('2026-08-15T23:00:00.000Z');
    expect(zonedDayKey(noite, 'Asia/Tokyo')).toBe('2026-08-16');
  });

  it('atravessa mudança de mês e ano sem depender de fuso', () => {
    expect(addDaysToDay('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDaysToDay('2026-01-01', -1)).toBe('2025-12-31');
    expect(daysBetweenDays('2026-08-01', '2026-09-01')).toBe(31);
    expect(daysBetweenDays('2026-08-15', '2026-08-16')).toBe(1);
  });
});
