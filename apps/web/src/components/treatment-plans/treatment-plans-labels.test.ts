import { describe, it, expect } from 'vitest';
import { getTreatmentPlansLabels } from './treatment-plans-labels.js';

describe('getTreatmentPlansLabels', () => {
  it('should return default labels when no terminology is provided', () => {
    const labels = getTreatmentPlansLabels();
    expect(labels.moduleTitle).toBe('Orçamentos e Planos');
    expect(labels.singular).toBe('Orçamento/Plano');
    expect(labels.plural).toBe('Orçamentos/Planos');
  });

  it('should return default labels when terminology is null', () => {
    const labels = getTreatmentPlansLabels(null);
    expect(labels.moduleTitle).toBe('Orçamentos e Planos');
  });

  it('should use custom terminology when provided', () => {
    const terminology = {
      treatmentPlanModuleTitle: 'Meus Tratamentos',
      treatmentPlanSingular: 'Tratamento',
      treatmentPlanPlural: 'Tratamentos',
      treatmentPlanSessionSingular: 'Sessão',
      treatmentPlanSessionPlural: 'Sessões',
    };
    const labels = getTreatmentPlansLabels(terminology);
    expect(labels.moduleTitle).toBe('Meus Tratamentos');
    expect(labels.singular).toBe('Tratamento');
  });

  it('should fallback to defaults for missing fields', () => {
    const terminology = {
      treatmentPlanModuleTitle: 'Custom Title',
    };
    const labels = getTreatmentPlansLabels(terminology);
    expect(labels.moduleTitle).toBe('Custom Title');
    expect(labels.singular).toBe('Orçamento/Plano');
    expect(labels.plural).toBe('Orçamentos/Planos');
  });

  it('should have all required properties', () => {
    const labels = getTreatmentPlansLabels();
    expect(labels).toHaveProperty('moduleTitle');
    expect(labels).toHaveProperty('singular');
    expect(labels).toHaveProperty('plural');
    expect(labels).toHaveProperty('sessionSingular');
    expect(labels).toHaveProperty('sessionPlural');
  });
});
