import { DEFAULT_TREATMENT_PLAN_LABELS, type TenantTerminologyOverrides } from '@plataforma/shared';

export function getTreatmentPlansLabels(terminology?: TenantTerminologyOverrides | null) {
  return {
    moduleTitle: terminology?.treatmentPlanModuleTitle ?? DEFAULT_TREATMENT_PLAN_LABELS.moduleTitle,
    singular: terminology?.treatmentPlanSingular ?? DEFAULT_TREATMENT_PLAN_LABELS.singular,
    plural: terminology?.treatmentPlanPlural ?? DEFAULT_TREATMENT_PLAN_LABELS.plural,
    sessionSingular: terminology?.treatmentPlanSessionSingular ?? DEFAULT_TREATMENT_PLAN_LABELS.sessionSingular,
    sessionPlural: terminology?.treatmentPlanSessionPlural ?? DEFAULT_TREATMENT_PLAN_LABELS.sessionPlural,
  };
}
