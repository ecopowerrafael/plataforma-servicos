import { describe, expect, it } from 'vitest';

import { parseProfessionalSpecialties } from './ProfessionalForm.js';

describe('ProfessionalForm', () => {
  it('converts the specialties text without applying split to the stored array', () => {
    expect(parseProfessionalSpecialties('Corte, Barba,  Visagismo ')).toEqual([
      'Corte',
      'Barba',
      'Visagismo',
    ]);
    expect(parseProfessionalSpecialties('')).toEqual([]);
  });
});
