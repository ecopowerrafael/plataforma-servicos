import { describe, expect, it } from 'vitest';

/**
 * Testa normalização de applied_steps_count retornado por MariaDB.
 *
 * MariaDB via @prisma/adapter-mariadb pode retornar bigint/string em runtime,
 * mesmo que TypeScript o tipifique como number. Comparações diretas falham:
 * 0n === 0 // false
 * "0" === 0 // false
 */

function normalizeAppliedStepsCount(raw: number | bigint | string | null | undefined): number {
  if (raw === null || raw === undefined) {
    throw new Error(`Invalid applied_steps_count: ${raw}`);
  }
  const normalized = Number(raw);
  if (!Number.isFinite(normalized) || !Number.isInteger(normalized) || normalized < 0) {
    throw new Error(`Invalid applied_steps_count: ${raw}`);
  }
  return normalized;
}

describe('migration recovery - applied_steps_count normalization', () => {
  it('normaliza number 0', () => {
    expect(normalizeAppliedStepsCount(0)).toBe(0);
  });

  it('normaliza bigint 0n', () => {
    expect(normalizeAppliedStepsCount(0n)).toBe(0);
  });

  it('normaliza string "0"', () => {
    expect(normalizeAppliedStepsCount('0')).toBe(0);
  });

  it('normaliza number > 0', () => {
    expect(normalizeAppliedStepsCount(1)).toBe(1);
    expect(normalizeAppliedStepsCount(5)).toBe(5);
  });

  it('normaliza bigint > 0', () => {
    expect(normalizeAppliedStepsCount(1n)).toBe(1);
    expect(normalizeAppliedStepsCount(5n)).toBe(5);
  });

  it('normaliza string > 0', () => {
    expect(normalizeAppliedStepsCount('1')).toBe(1);
    expect(normalizeAppliedStepsCount('5')).toBe(5);
  });

  it('rejeita valores inválidos', () => {
    expect(() => normalizeAppliedStepsCount(-1)).toThrow();
    expect(() => normalizeAppliedStepsCount('invalid')).toThrow();
    expect(() => normalizeAppliedStepsCount(null)).toThrow();
    expect(() => normalizeAppliedStepsCount(undefined)).toThrow();
  });
});
