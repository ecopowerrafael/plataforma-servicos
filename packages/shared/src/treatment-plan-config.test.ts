import { describe, it, expect } from 'vitest';
import {
  TreatmentPlanLabelsSchema,
  TREATMENT_PLAN_LABEL_PRESETS,
  DEFAULT_TREATMENT_PLAN_LABELS,
  UpdateTenantTerminologySchema,
} from './treatment-plan-config.js';

describe('treatment-plan-config', () => {
  describe('TreatmentPlanLabelsSchema', () => {
    it('should validate correct labels', () => {
      const labels = {
        moduleTitle: 'Tratamentos',
        singular: 'Tratamento',
        plural: 'Tratamentos',
        sessionSingular: 'Sessão',
        sessionPlural: 'Sessões',
      };
      const result = TreatmentPlanLabelsSchema.safeParse(labels);
      expect(result.success).toBe(true);
    });

    it('should reject empty strings', () => {
      const labels = {
        moduleTitle: '',
        singular: 'Tratamento',
        plural: 'Tratamentos',
        sessionSingular: 'Sessão',
        sessionPlural: 'Sessões',
      };
      const result = TreatmentPlanLabelsSchema.safeParse(labels);
      expect(result.success).toBe(false);
    });

    it('should enforce max length of 80', () => {
      const labels = {
        moduleTitle: 'A'.repeat(81),
        singular: 'Tratamento',
        plural: 'Tratamentos',
        sessionSingular: 'Sessão',
        sessionPlural: 'Sessões',
      };
      const result = TreatmentPlanLabelsSchema.safeParse(labels);
      expect(result.success).toBe(false);
    });
  });

  describe('TREATMENT_PLAN_LABEL_PRESETS', () => {
    it('should have aesthetic_clinic preset', () => {
      expect(TREATMENT_PLAN_LABEL_PRESETS.aesthetic_clinic).toBeDefined();
      expect(TREATMENT_PLAN_LABEL_PRESETS.aesthetic_clinic.moduleTitle).toBe('Tratamentos');
    });

    it('should have dentistry preset', () => {
      expect(TREATMENT_PLAN_LABEL_PRESETS.dentistry).toBeDefined();
      expect(TREATMENT_PLAN_LABEL_PRESETS.dentistry.moduleTitle).toBe('Planos de tratamento');
    });

    it('should have workshop preset', () => {
      expect(TREATMENT_PLAN_LABEL_PRESETS.workshop).toBeDefined();
      expect(TREATMENT_PLAN_LABEL_PRESETS.workshop.sessionSingular).toBe('Etapa');
    });

    it('should have tattoo_studio preset', () => {
      expect(TREATMENT_PLAN_LABEL_PRESETS.tattoo_studio).toBeDefined();
      expect(TREATMENT_PLAN_LABEL_PRESETS.tattoo_studio.moduleTitle).toBe('Projetos');
    });

    it('should have consulting preset', () => {
      expect(TREATMENT_PLAN_LABEL_PRESETS.consulting).toBeDefined();
      expect(TREATMENT_PLAN_LABEL_PRESETS.consulting.sessionSingular).toBe('Encontro');
    });

    it('should have personal_trainer preset', () => {
      expect(TREATMENT_PLAN_LABEL_PRESETS.personal_trainer).toBeDefined();
      expect(TREATMENT_PLAN_LABEL_PRESETS.personal_trainer.moduleTitle).toBe('Planos');
    });

    it('all presets should be valid labels', () => {
      Object.values(TREATMENT_PLAN_LABEL_PRESETS).forEach((preset) => {
        const result = TreatmentPlanLabelsSchema.safeParse(preset);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('DEFAULT_TREATMENT_PLAN_LABELS', () => {
    it('should have all required fields', () => {
      expect(DEFAULT_TREATMENT_PLAN_LABELS.moduleTitle).toBeDefined();
      expect(DEFAULT_TREATMENT_PLAN_LABELS.singular).toBeDefined();
      expect(DEFAULT_TREATMENT_PLAN_LABELS.plural).toBeDefined();
      expect(DEFAULT_TREATMENT_PLAN_LABELS.sessionSingular).toBeDefined();
      expect(DEFAULT_TREATMENT_PLAN_LABELS.sessionPlural).toBeDefined();
    });

    it('should be a valid labels schema', () => {
      const result = TreatmentPlanLabelsSchema.safeParse(DEFAULT_TREATMENT_PLAN_LABELS);
      expect(result.success).toBe(true);
    });
  });

  describe('UpdateTenantTerminologySchema', () => {
    it('should accept null values', () => {
      const data = {
        treatmentPlanModuleTitle: null,
        treatmentPlanSingular: null,
      };
      const result = UpdateTenantTerminologySchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept undefined values', () => {
      const data = {};
      const result = UpdateTenantTerminologySchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept partial updates', () => {
      const data = {
        treatmentPlanModuleTitle: 'Meus Tratamentos',
      };
      const result = UpdateTenantTerminologySchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject invalid values', () => {
      const data = {
        treatmentPlanModuleTitle: 123,
      };
      const result = UpdateTenantTerminologySchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });
});
