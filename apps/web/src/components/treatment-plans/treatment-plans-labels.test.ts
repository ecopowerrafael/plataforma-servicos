import { describe, it, expect } from 'vitest';
import { treatmentPlansLabels } from './treatment-plans-labels.js';

describe('treatment-plans-labels', () => {
  it('should export moduleTitle', () => {
    expect(treatmentPlansLabels.moduleTitle).toBe('Orçamentos e Planos');
  });

  it('should export singular label', () => {
    expect(treatmentPlansLabels.singular).toBe('Orçamento/Plano');
  });

  it('should export plural label', () => {
    expect(treatmentPlansLabels.plural).toBe('Orçamentos/Planos');
  });

  it('should have all required properties', () => {
    expect(treatmentPlansLabels).toHaveProperty('moduleTitle');
    expect(treatmentPlansLabels).toHaveProperty('singular');
    expect(treatmentPlansLabels).toHaveProperty('plural');
  });
});
