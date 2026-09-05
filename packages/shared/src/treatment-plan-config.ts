import { z } from 'zod';

export const TreatmentPlanLabelsSchema = z.object({
  moduleTitle: z.string().trim().min(1).max(80),
  singular: z.string().trim().min(1).max(80),
  plural: z.string().trim().min(1).max(80),
  sessionSingular: z.string().trim().min(1).max(80),
  sessionPlural: z.string().trim().min(1).max(80),
});

export type TreatmentPlanLabels = z.infer<typeof TreatmentPlanLabelsSchema>;

export const TREATMENT_PLAN_LABEL_PRESETS = {
  aesthetic_clinic: {
    moduleTitle: 'Tratamentos',
    singular: 'Tratamento',
    plural: 'Tratamentos',
    sessionSingular: 'Sessão',
    sessionPlural: 'Sessões',
  },
  dentistry: {
    moduleTitle: 'Planos de tratamento',
    singular: 'Plano de tratamento',
    plural: 'Planos de tratamento',
    sessionSingular: 'Sessão',
    sessionPlural: 'Sessões',
  },
  workshop: {
    moduleTitle: 'Orçamentos',
    singular: 'Orçamento',
    plural: 'Orçamentos',
    sessionSingular: 'Etapa',
    sessionPlural: 'Etapas',
  },
  tattoo_studio: {
    moduleTitle: 'Projetos',
    singular: 'Projeto',
    plural: 'Projetos',
    sessionSingular: 'Sessão',
    sessionPlural: 'Sessões',
  },
  consulting: {
    moduleTitle: 'Propostas',
    singular: 'Proposta',
    plural: 'Propostas',
    sessionSingular: 'Encontro',
    sessionPlural: 'Encontros',
  },
  personal_trainer: {
    moduleTitle: 'Planos',
    singular: 'Plano',
    plural: 'Planos',
    sessionSingular: 'Sessão',
    sessionPlural: 'Sessões',
  },
} as const satisfies Record<string, TreatmentPlanLabels>;

export type TreatmentPlanLabelPresetKey = keyof typeof TREATMENT_PLAN_LABEL_PRESETS;

export const DEFAULT_TREATMENT_PLAN_LABELS: TreatmentPlanLabels = {
  moduleTitle: 'Orçamentos e Planos',
  singular: 'Orçamento/Plano',
  plural: 'Orçamentos/Planos',
  sessionSingular: 'Sessão',
  sessionPlural: 'Sessões',
};

export const UpdateTenantTerminologySchema = z.object({
  treatmentPlanModuleTitle: z.string().trim().min(1).max(80).nullable().optional(),
  treatmentPlanSingular: z.string().trim().min(1).max(80).nullable().optional(),
  treatmentPlanPlural: z.string().trim().min(1).max(80).nullable().optional(),
  treatmentPlanSessionSingular: z.string().trim().min(1).max(80).nullable().optional(),
  treatmentPlanSessionPlural: z.string().trim().min(1).max(80).nullable().optional(),
});

export type UpdateTenantTerminology = z.infer<typeof UpdateTenantTerminologySchema>;

export const TreatmentPlanReminderSequenceStepSchema = z.object({
  enabled: z.boolean().default(true),
  delayValue: z.number().int().positive(),
  delayUnit: z.enum(['HOUR', 'DAY']),
  message: z.string().trim().min(10).max(1000),
});

export type TreatmentPlanReminderSequenceStep = z.infer<typeof TreatmentPlanReminderSequenceStepSchema>;

export const TreatmentPlanReminderConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    channel: z.enum(['WHATSAPP', 'EMAIL', 'PUSH']).default('WHATSAPP'),
    sequence: z.array(TreatmentPlanReminderSequenceStepSchema).default([
      {
        enabled: true,
        delayValue: 1,
        delayUnit: 'DAY',
        message: 'Olá {{customerName}}! Você tem um {{treatmentPlanSingular}} pendente de aprovação. Confira os detalhes!',
      },
      {
        enabled: true,
        delayValue: 3,
        delayUnit: 'DAY',
        message: 'Oi {{customerName}}, gostaria de relembrar sobre seu {{treatmentPlanSingular}} aguardando aprovação.',
      },
      {
        enabled: true,
        delayValue: 7,
        delayUnit: 'DAY',
        message: 'Última notificação: seu {{treatmentPlanSingular}} foi criado há 7 dias. Clique para aprovar!',
      },
    ]),
  })
  .strict();

export type TreatmentPlanReminderConfig = z.infer<typeof TreatmentPlanReminderConfigSchema>;
