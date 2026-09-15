import { describe, expect, it } from 'vitest';

import { buildSchedulePeriods } from './ProfessionalSchedule.js';

describe('buildSchedulePeriods', () => {
  it('divide a jornada em dois períodos quando existe pausa para almoço', () => {
    expect(
      buildSchedulePeriods(
        { weekday: '1', startsAt: '09:00', endsAt: '18:00', unitPublicId: 'unit-1' },
        { startsAt: '12:00', endsAt: '13:00' },
      ),
    ).toEqual([
      { weekday: 1, startsAt: '09:00', endsAt: '12:00', unitPublicId: 'unit-1', active: true },
      { weekday: 1, startsAt: '13:00', endsAt: '18:00', unitPublicId: 'unit-1', active: true },
    ]);
  });
});
