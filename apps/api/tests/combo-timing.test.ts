import { describe, expect, it } from 'vitest';
import { resolveComboTiming } from '@plataforma/shared';

describe('resolveComboTiming', () => {
  it('calcula timing sem overrides', () => {
    const result = resolveComboTiming([
      {
        serviceId: 1n,
        service: { durationMinutes: 45, hasPostServiceBreak: true, postServiceBreakMinutes: 15 },
      },
      {
        serviceId: 2n,
        service: { durationMinutes: 30, hasPostServiceBreak: true, postServiceBreakMinutes: 10 },
      },
      {
        serviceId: 3n,
        service: { durationMinutes: 20, hasPostServiceBreak: true, postServiceBreakMinutes: 5 },
      },
    ]);

    expect(result).toEqual({
      durationMinutes: 120, // 45+15+30+10+20
      postServiceBreakMinutes: 5, // último break
      blockedMinutes: 125, // 120+5
    });
  });

  it('aplica overrides de ProfessionalService', () => {
    const result = resolveComboTiming([
      {
        serviceId: 1n,
        service: { durationMinutes: 45, hasPostServiceBreak: true, postServiceBreakMinutes: 15 },
        link: { durationMinutes: 60, hasPostServiceBreak: null, postServiceBreakMinutes: null }, // override duração
      },
      {
        serviceId: 2n,
        service: { durationMinutes: 30, hasPostServiceBreak: true, postServiceBreakMinutes: 10 },
      },
    ]);

    // 60+15 (overridden duration+break) + 30 (no override) = 105
    // postServiceBreakMinutes = 10 (do último item)
    expect(result).toEqual({
      durationMinutes: 105,
      postServiceBreakMinutes: 10,
      blockedMinutes: 115,
    });
  });

  it('rejeita combo vazio', () => {
    expect(() => resolveComboTiming([])).toThrow('Combo must have at least one item');
  });

  it('valida invariant: blockedMinutes === sum(blockedServiceMinutes)', () => {
    // Se há bug na agregação, invariant falha
    const result = resolveComboTiming([
      {
        serviceId: 1n,
        service: { durationMinutes: 45, hasPostServiceBreak: true, postServiceBreakMinutes: 15 },
      },
      {
        serviceId: 2n,
        service: { durationMinutes: 30, hasPostServiceBreak: true, postServiceBreakMinutes: 10 },
      },
    ]);

    // sum = (45+15) + (30+10) = 60 + 40 = 100
    // result.blockedMinutes deve ser 100
    expect(result.blockedMinutes).toBe(100);
    expect(result.blockedMinutes).toBe(result.durationMinutes + result.postServiceBreakMinutes);
  });

  it('trata breaks desativados corretamente', () => {
    const result = resolveComboTiming([
      {
        serviceId: 1n,
        service: { durationMinutes: 45, hasPostServiceBreak: false, postServiceBreakMinutes: 0 },
      },
      {
        serviceId: 2n,
        service: { durationMinutes: 30, hasPostServiceBreak: true, postServiceBreakMinutes: 10 },
      },
    ]);

    // 45 (sem break) + 30 (com break) = 75
    // postServiceBreakMinutes = 10
    expect(result).toEqual({
      durationMinutes: 75,
      postServiceBreakMinutes: 10,
      blockedMinutes: 85,
    });
  });
});
