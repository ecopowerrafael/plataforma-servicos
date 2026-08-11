import { z } from 'zod';

export const BusinessProfileCodeSchema = z.enum([
  'BARBERSHOP',
  'BEAUTY_SALON',
  'AESTHETIC_CLINIC',
  'MEDICAL_CLINIC',
  'PSYCHOLOGY',
  'NUTRITION',
  'DENTISTRY',
  'STUDIO',
  'TATTOO_STUDIO',
  'PET_CARE',
  'SPA',
  'MASSAGE',
  'PERSONAL_TRAINER',
  'CONSULTING',
  'GENERIC',
]);
export type BusinessProfileCode = z.infer<typeof BusinessProfileCodeSchema>;

export const BusinessProfileLabels: Record<BusinessProfileCode, string> = Object.freeze({
  BARBERSHOP: 'Barbearia',
  BEAUTY_SALON: 'Salão de beleza',
  AESTHETIC_CLINIC: 'Clínica de estética',
  MEDICAL_CLINIC: 'Clínica médica',
  PSYCHOLOGY: 'Psicologia',
  NUTRITION: 'Nutrição',
  DENTISTRY: 'Clínica odontológica',
  STUDIO: 'Estúdio',
  TATTOO_STUDIO: 'Estúdio de tatuagem',
  PET_CARE: 'Pet shop / Banho e tosa',
  SPA: 'Spa',
  MASSAGE: 'Massoterapia',
  PERSONAL_TRAINER: 'Personal trainer',
  CONSULTING: 'Consultoria',
  GENERIC: 'Outro',
});

export const TenantFeatureCodeSchema = z.enum([
  'MULTIPLE_UNITS',
  'PROFESSIONAL_SELECTION',
  'CUSTOMER_SELF_BOOKING',
  'ONLINE_PAYMENT',
  'WAITING_LIST',
  'MEMBERSHIP_PLANS',
  'PACKAGES',
  'LOYALTY',
  'PRODUCT_SALES',
  'CUSTOM_FORMS',
  'MEDICAL_RECORDS',
  'PORTFOLIO',
  'BEFORE_AFTER_IMAGES',
  'RECURRING_APPOINTMENTS',
  'GROUP_APPOINTMENTS',
  'RESOURCE_BOOKING',
]);
export type TenantFeatureCode = z.infer<typeof TenantFeatureCodeSchema>;

export const TenantFeatureSourceSchema = z.enum(['PROFILE', 'OVERRIDE']);
export const TenantCustomFieldScopeSchema = z.enum([
  'TENANT',
  'PROFESSIONAL',
  'CUSTOMER',
  'APPOINTMENT',
]);
export const TenantCustomFieldTypeSchema = z.enum([
  'TEXT',
  'TEXTAREA',
  'NUMBER',
  'BOOLEAN',
  'DATE',
  'SELECT',
  'MULTISELECT',
]);
export const TenantCustomFieldSourceSchema = z.enum(['PROFILE', 'OVERRIDE']);
export const TenantCustomFieldKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{1,62}$/u)
  .max(63);
const CustomFieldOptionSchema = z.string().trim().min(1).max(80);
export const TenantCustomFieldValidationSchema = z
  .object({
    minLength: z.number().int().min(0).max(5000).optional(),
    maxLength: z.number().int().min(1).max(5000).optional(),
    min: z.number().min(-1_000_000).max(1_000_000).optional(),
    max: z.number().min(-1_000_000).max(1_000_000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.minLength !== undefined &&
      value.maxLength !== undefined &&
      value.minLength > value.maxLength
    )
      context.addIssue({ code: 'custom', message: 'O tamanho mínimo não pode superar o máximo.' });
    if (value.min !== undefined && value.max !== undefined && value.min > value.max)
      context.addIssue({ code: 'custom', message: 'O valor mínimo não pode superar o máximo.' });
  });
const TenantCustomFieldBodySchema = z
  .object({
    key: TenantCustomFieldKeySchema,
    label: z.string().trim().min(2).max(120),
    description: z.string().trim().min(1).max(500).nullable().optional(),
    type: TenantCustomFieldTypeSchema,
    scope: TenantCustomFieldScopeSchema,
    required: z.boolean().default(false),
    active: z.boolean().default(true),
    order: z.number().int().min(0).max(999).default(0),
    options: z.array(CustomFieldOptionSchema).max(50).optional(),
    validation: TenantCustomFieldValidationSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const optionType = value.type === 'SELECT' || value.type === 'MULTISELECT';
    if (optionType && (value.options === undefined || value.options.length < 1))
      context.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Informe ao menos uma opção.',
      });
    if (!optionType && value.options !== undefined && value.options.length > 0)
      context.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Opções são permitidas somente para listas.',
      });
    if (
      value.options !== undefined &&
      new Set(value.options.map((option) => option.toLocaleLowerCase())).size !==
        value.options.length
    )
      context.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'As opções devem ser únicas.',
      });
  });
export const CreateTenantCustomFieldRequestSchema = TenantCustomFieldBodySchema;
export type CreateTenantCustomFieldRequest = z.infer<typeof CreateTenantCustomFieldRequestSchema>;
export const UpdateTenantCustomFieldRequestSchema = TenantCustomFieldBodySchema;
export type UpdateTenantCustomFieldRequest = z.infer<typeof UpdateTenantCustomFieldRequestSchema>;
export const TenantCustomFieldResponseSchema = TenantCustomFieldBodySchema.extend({
  publicId: z.uuid(),
  source: TenantCustomFieldSourceSchema,
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export const TenantCustomFieldsResponseSchema = z.object({
  profile: BusinessProfileCodeSchema,
  fields: z.array(TenantCustomFieldResponseSchema),
});
export const TenantFeatureOverrideSchema = z
  .object({ code: TenantFeatureCodeSchema, enabled: z.boolean() })
  .strict();
export const UpdateTenantFeaturesRequestSchema = z
  .object({
    features: z
      .array(TenantFeatureOverrideSchema)
      .min(1)
      .max(TenantFeatureCodeSchema.options.length),
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<string>();
    for (const [index, feature] of value.features.entries()) {
      if (seen.has(feature.code)) {
        context.addIssue({
          code: 'custom',
          path: ['features', index, 'code'],
          message: 'Cada funcionalidade pode ser informada somente uma vez.',
        });
      }
      seen.add(feature.code);
    }
  });
export const TenantFeaturesResponseSchema = z.object({
  profile: BusinessProfileCodeSchema,
  features: z.array(
    z.object({
      code: TenantFeatureCodeSchema,
      recommended: z.boolean(),
      enabled: z.boolean(),
      source: TenantFeatureSourceSchema,
    }),
  ),
});

export const BusinessTerminologySchema = z.object({
  professional: z.object({ singular: z.string().min(1), plural: z.string().min(1) }),
  customer: z.object({ singular: z.string().min(1), plural: z.string().min(1) }),
  service: z.object({ singular: z.string().min(1), plural: z.string().min(1) }),
  appointment: z.object({ singular: z.string().min(1), plural: z.string().min(1) }),
  unit: z.object({ singular: z.string().min(1), plural: z.string().min(1) }),
});
export type BusinessTerminology = z.infer<typeof BusinessTerminologySchema>;

export const TenantHexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/u);
export const TenantBorderRadiusSchema = z.enum(['0.25rem', '0.5rem', '0.75rem', '1rem']);
export const TenantFontFamilySchema = z.enum(['system-ui', 'Inter', 'Poppins', 'Montserrat']);
export const BusinessThemeSchema = z.object({
  primaryColor: TenantHexColorSchema,
  secondaryColor: TenantHexColorSchema,
  accentColor: TenantHexColorSchema,
  backgroundColor: TenantHexColorSchema,
  surfaceColor: TenantHexColorSchema,
  textColor: TenantHexColorSchema,
  mutedTextColor: TenantHexColorSchema,
  borderColor: TenantHexColorSchema,
  borderRadius: TenantBorderRadiusSchema,
  fontFamily: TenantFontFamilySchema,
  visualStyle: z.string().min(1),
  icon: z.string().min(1),
  banner: z.string().min(1),
});

const SafeAssetUrlSchema = z.url().refine((value) => value.startsWith('https://'), {
  message: 'A URL deve usar HTTPS.',
});

export const TenantBrandingSchema = BusinessThemeSchema.pick({
  primaryColor: true,
  secondaryColor: true,
  accentColor: true,
  backgroundColor: true,
  surfaceColor: true,
  textColor: true,
  mutedTextColor: true,
  borderColor: true,
  borderRadius: true,
  fontFamily: true,
}).extend({
  useProfileDefaults: z.boolean(),
  logoUrl: SafeAssetUrlSchema.nullable(),
  faviconUrl: SafeAssetUrlSchema.nullable(),
  bannerUrl: SafeAssetUrlSchema.nullable(),
  pwaIconUrl: SafeAssetUrlSchema.nullable(),
  splashUrl: SafeAssetUrlSchema.nullable(),
});
export type TenantBranding = z.infer<typeof TenantBrandingSchema>;

export const UpdateTenantBrandingRequestSchema = TenantBrandingSchema.partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Informe ao menos uma altera\u00e7\u00e3o.');

const TerminologyOverrideValueSchema = z
  .string()
  .trim()
  .max(80)
  .transform((value) => (value === '' ? null : value))
  .nullable();
export const TenantTerminologyOverridesSchema = z
  .object({
    professionalSingular: TerminologyOverrideValueSchema.optional(),
    professionalPlural: TerminologyOverrideValueSchema.optional(),
    customerSingular: TerminologyOverrideValueSchema.optional(),
    customerPlural: TerminologyOverrideValueSchema.optional(),
    serviceSingular: TerminologyOverrideValueSchema.optional(),
    servicePlural: TerminologyOverrideValueSchema.optional(),
    appointmentSingular: TerminologyOverrideValueSchema.optional(),
    appointmentPlural: TerminologyOverrideValueSchema.optional(),
    unitSingular: TerminologyOverrideValueSchema.optional(),
    unitPlural: TerminologyOverrideValueSchema.optional(),
  })
  .strict();
export type TenantTerminologyOverrides = z.infer<typeof TenantTerminologyOverridesSchema>;

export const UpdateTenantTerminologyRequestSchema = TenantTerminologyOverridesSchema.refine(
  (value) => Object.keys(value).length > 0,
  'Informe ao menos uma altera\u00e7\u00e3o.',
);

export const TenantExperienceResponseSchema = z.object({
  profile: BusinessProfileCodeSchema,
  branding: TenantBrandingSchema,
  terminology: BusinessTerminologySchema,
});

const genericTerminology = {
  professional: { singular: 'Profissional', plural: 'Profissionais' },
  customer: { singular: 'Cliente', plural: 'Clientes' },
  service: { singular: 'Serviço', plural: 'Serviços' },
  appointment: { singular: 'Agendamento', plural: 'Agendamentos' },
  unit: { singular: 'Unidade', plural: 'Unidades' },
} as const;
const genericTheme = {
  primaryColor: '#2563EB',
  secondaryColor: '#1E40AF',
  accentColor: '#F59E0B',
  backgroundColor: '#F8FAFC',
  surfaceColor: '#FFFFFF',
  textColor: '#0F172A',
  mutedTextColor: '#475569',
  borderColor: '#CBD5E1',
  borderRadius: '0.75rem',
  fontFamily: 'system-ui',
  visualStyle: 'professional',
  icon: 'briefcase',
  banner: 'abstract',
} as const;

const profileTerminology: Partial<Record<BusinessProfileCode, BusinessTerminology>> = {
  BARBERSHOP: {
    professional: { singular: 'Barbeiro', plural: 'Barbeiros' },
    customer: { singular: 'Cliente', plural: 'Clientes' },
    service: { singular: 'Servi\u00e7o', plural: 'Servi\u00e7os' },
    appointment: { singular: 'Hor\u00e1rio', plural: 'Hor\u00e1rios' },
    unit: { singular: 'Barbearia', plural: 'Barbearias' },
  },
  MEDICAL_CLINIC: {
    professional: { singular: 'M\u00e9dico', plural: 'M\u00e9dicos' },
    customer: { singular: 'Paciente', plural: 'Pacientes' },
    service: { singular: 'Consulta', plural: 'Consultas' },
    appointment: { singular: 'Consulta', plural: 'Consultas' },
    unit: { singular: 'Unidade', plural: 'Unidades' },
  },
  PSYCHOLOGY: {
    professional: { singular: 'Psic\u00f3logo', plural: 'Psic\u00f3logos' },
    customer: { singular: 'Paciente', plural: 'Pacientes' },
    service: { singular: 'Sess\u00e3o', plural: 'Sess\u00f5es' },
    appointment: { singular: 'Sess\u00e3o', plural: 'Sess\u00f5es' },
    unit: { singular: 'Consult\u00f3rio', plural: 'Consult\u00f3rios' },
  },
  NUTRITION: {
    professional: { singular: 'Nutricionista', plural: 'Nutricionistas' },
    customer: { singular: 'Paciente', plural: 'Pacientes' },
    service: { singular: 'Consulta', plural: 'Consultas' },
    appointment: { singular: 'Consulta', plural: 'Consultas' },
    unit: { singular: 'Consult\u00f3rio', plural: 'Consult\u00f3rios' },
  },
  DENTISTRY: {
    professional: { singular: 'Dentista', plural: 'Dentistas' },
    customer: { singular: 'Paciente', plural: 'Pacientes' },
    service: { singular: 'Procedimento', plural: 'Procedimentos' },
    appointment: { singular: 'Consulta', plural: 'Consultas' },
    unit: { singular: 'Cl\u00ednica', plural: 'Cl\u00ednicas' },
  },
  PET_CARE: {
    professional: { singular: 'Especialista', plural: 'Especialistas' },
    customer: { singular: 'Tutor', plural: 'Tutores' },
    service: { singular: 'Servi\u00e7o', plural: 'Servi\u00e7os' },
    appointment: { singular: 'Atendimento', plural: 'Atendimentos' },
    unit: { singular: 'Unidade', plural: 'Unidades' },
  },
  PERSONAL_TRAINER: {
    professional: { singular: 'Personal trainer', plural: 'Personal trainers' },
    customer: { singular: 'Aluno', plural: 'Alunos' },
    service: { singular: 'Treino', plural: 'Treinos' },
    appointment: { singular: 'Aula', plural: 'Aulas' },
    unit: { singular: 'Local de treino', plural: 'Locais de treino' },
  },
  CONSULTING: {
    professional: { singular: 'Consultor', plural: 'Consultores' },
    customer: { singular: 'Cliente', plural: 'Clientes' },
    service: { singular: 'Consultoria', plural: 'Consultorias' },
    appointment: { singular: 'Reuni\u00e3o', plural: 'Reuni\u00f5es' },
    unit: { singular: 'Escrit\u00f3rio', plural: 'Escrit\u00f3rios' },
  },
};

const profileRecommendedFeatures: Partial<Record<BusinessProfileCode, TenantFeatureCode[]>> = {
  BARBERSHOP: ['MULTIPLE_UNITS', 'PROFESSIONAL_SELECTION', 'CUSTOMER_SELF_BOOKING'],
  BEAUTY_SALON: ['MULTIPLE_UNITS', 'PROFESSIONAL_SELECTION', 'CUSTOMER_SELF_BOOKING'],
  AESTHETIC_CLINIC: ['PROFESSIONAL_SELECTION', 'CUSTOMER_SELF_BOOKING', 'BEFORE_AFTER_IMAGES'],
  MEDICAL_CLINIC: ['MULTIPLE_UNITS', 'PROFESSIONAL_SELECTION', 'MEDICAL_RECORDS'],
  PSYCHOLOGY: ['PROFESSIONAL_SELECTION', 'MEDICAL_RECORDS', 'RECURRING_APPOINTMENTS'],
  NUTRITION: ['PROFESSIONAL_SELECTION', 'MEDICAL_RECORDS', 'RECURRING_APPOINTMENTS'],
  DENTISTRY: ['MULTIPLE_UNITS', 'PROFESSIONAL_SELECTION', 'MEDICAL_RECORDS'],
  STUDIO: ['PORTFOLIO', 'CUSTOMER_SELF_BOOKING'],
  TATTOO_STUDIO: ['PORTFOLIO', 'CUSTOMER_SELF_BOOKING', 'BEFORE_AFTER_IMAGES'],
  PET_CARE: ['MULTIPLE_UNITS', 'CUSTOMER_SELF_BOOKING'],
  SPA: ['PROFESSIONAL_SELECTION', 'CUSTOMER_SELF_BOOKING', 'PACKAGES'],
  MASSAGE: ['PROFESSIONAL_SELECTION', 'CUSTOMER_SELF_BOOKING', 'PACKAGES'],
  PERSONAL_TRAINER: ['PROFESSIONAL_SELECTION', 'RECURRING_APPOINTMENTS', 'GROUP_APPOINTMENTS'],
  CONSULTING: ['CUSTOMER_SELF_BOOKING', 'RESOURCE_BOOKING'],
};

type ProfileCustomField = z.input<typeof CreateTenantCustomFieldRequestSchema>;
const profileCustomFields: Partial<Record<BusinessProfileCode, ProfileCustomField[]>> = {
  PSYCHOLOGY: [
    { key: 'crp', label: 'CRP', type: 'TEXT', scope: 'PROFESSIONAL', required: true },
    {
      key: 'modalidade',
      label: 'Modalidade',
      type: 'SELECT',
      scope: 'APPOINTMENT',
      options: ['Presencial', 'Online'],
    },
  ],
  DENTISTRY: [
    { key: 'cro', label: 'CRO', type: 'TEXT', scope: 'PROFESSIONAL', required: true },
    { key: 'especialidade', label: 'Especialidade', type: 'TEXT', scope: 'PROFESSIONAL' },
  ],
  NUTRITION: [
    { key: 'crn', label: 'CRN', type: 'TEXT', scope: 'PROFESSIONAL', required: true },
    { key: 'area_atuacao', label: 'Área de atuação', type: 'TEXT', scope: 'PROFESSIONAL' },
  ],
  MEDICAL_CLINIC: [
    { key: 'conselho', label: 'Conselho', type: 'TEXT', scope: 'PROFESSIONAL', required: true },
    { key: 'especialidade', label: 'Especialidade', type: 'TEXT', scope: 'PROFESSIONAL' },
  ],
  BARBERSHOP: [
    {
      key: 'especialidades',
      label: 'Especialidades',
      type: 'MULTISELECT',
      scope: 'PROFESSIONAL',
      options: ['Corte', 'Barba'],
    },
    { key: 'portfolio', label: 'Portfólio', type: 'BOOLEAN', scope: 'PROFESSIONAL' },
  ],
};

export const BusinessProfileCatalog = Object.freeze(
  Object.fromEntries(
    BusinessProfileCodeSchema.options.map((code) => [
      code,
      {
        code,
        publicName: BusinessProfileLabels[code],
        description: 'Perfil operacional para negócios com atendimento agendado.',
        category: code.includes('CLINIC') ? 'HEALTH' : 'SERVICES',
        terminology: profileTerminology[code] ?? genericTerminology,
        theme: genericTheme,
        recommendedFeatures: profileRecommendedFeatures[code] ?? [],
        recommendedCustomFields: profileCustomFields[code] ?? [],
        defaultAppointmentDurationMinutes: 60,
        defaultAppointmentIntervalMinutes: 15,
        onboardingTemplate: 'STANDARD',
      },
    ]),
  ) as Record<
    BusinessProfileCode,
    {
      code: BusinessProfileCode;
      publicName: string;
      description: string;
      category: string;
      terminology: z.infer<typeof BusinessTerminologySchema>;
      theme: z.infer<typeof BusinessThemeSchema>;
      recommendedFeatures: TenantFeatureCode[];
      recommendedCustomFields: ProfileCustomField[];
      defaultAppointmentDurationMinutes: number;
      defaultAppointmentIntervalMinutes: number;
      onboardingTemplate: string;
    }
  >,
);
