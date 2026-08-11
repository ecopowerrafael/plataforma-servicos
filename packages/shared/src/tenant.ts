import { z } from 'zod';

import { BusinessProfileCodeSchema } from './business-profile.js';

export const RESERVED_TENANT_SLUGS = [
  'admin',
  'api',
  'app',
  'health',
  'login',
  'logout',
  'public',
  'ready',
  'support',
  'system',
  'www',
] as const;

const reservedTenantSlugs = new Set<string>(RESERVED_TENANT_SLUGS);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const localePattern = /^[a-z]{2,3}(?:-[A-Z]{2})?$/u;

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: value }).format();
    return !/^[+-]\d{2}:?\d{2}$/u.test(value);
  } catch {
    return false;
  }
}

function isCanonicalLocale(value: string): boolean {
  try {
    return new Intl.Locale(value).toString() === value;
  } catch {
    return false;
  }
}

const NormalizedSlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(63)
  .transform((value) => value.toLowerCase())
  .pipe(z.string().regex(slugPattern, 'O slug possui formato inválido.'));

const RequiredNameSchema = (maximumLength: number) => z.string().trim().min(2).max(maximumLength);

const OptionalAddressFieldSchema = (maximumLength: number) =>
  z.string().trim().min(1).max(maximumLength).optional();

export const TenantStatusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'INACTIVE', 'PENDING']);
export const BusinessUnitStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);
export const WeekStartsOnSchema = z.enum(['SUNDAY', 'MONDAY']);
export const TimeFormatSchema = z.enum(['24H', '12H']);
export const SupportedCurrencySchema = z.enum(['BRL', 'EUR', 'USD']);
export const TenantPublicIdSchema = z.uuid();

export const TimeZoneSchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .refine(isValidTimeZone, 'O timezone deve ser um identificador IANA válido.');

export const LocaleSchema = z
  .string()
  .trim()
  .min(2)
  .max(16)
  .regex(localePattern, 'O locale possui formato inválido.')
  .refine(isCanonicalLocale, 'O locale deve utilizar a forma canônica.');

export const TenantSlugSchema = NormalizedSlugSchema.refine(
  (slug) => !reservedTenantSlugs.has(slug),
  'O slug informado é reservado.',
);

export const TenantSlugOutputSchema = z
  .string()
  .min(2)
  .max(63)
  .regex(slugPattern)
  .refine((slug) => !reservedTenantSlugs.has(slug));

export const BusinessUnitSlugSchema = NormalizedSlugSchema;

export const AppointmentIntervalSchema = z.union([
  z.literal(5),
  z.literal(10),
  z.literal(15),
  z.literal(20),
  z.literal(30),
  z.literal(60),
]);

export const TenantSettingsInputSchema = z
  .object({
    allowMultipleUnits: z.boolean().default(false),
    defaultAppointmentIntervalMinutes: AppointmentIntervalSchema.default(15),
    minimumAdvanceMinutes: z.number().int().min(0).max(43_200).default(0),
    maximumAdvanceDays: z.number().int().min(1).max(365).default(180),
    weekStartsOn: WeekStartsOnSchema.default('MONDAY'),
    dateFormat: z.literal('DD/MM/YYYY').default('DD/MM/YYYY'),
    timeFormat: TimeFormatSchema.default('24H'),
  })
  .strict();

export const InitialBusinessUnitInputSchema = z
  .object({
    name: RequiredNameSchema(120),
    slug: BusinessUnitSlugSchema,
    postalCode: OptionalAddressFieldSchema(16),
    street: OptionalAddressFieldSchema(160),
    number: OptionalAddressFieldSchema(20),
    complement: OptionalAddressFieldSchema(80),
    district: OptionalAddressFieldSchema(80),
    city: OptionalAddressFieldSchema(100),
    state: OptionalAddressFieldSchema(64),
    countryCode: z
      .string()
      .trim()
      .length(2)
      .transform((value) => value.toUpperCase())
      .pipe(z.string().regex(/^[A-Z]{2}$/u))
      .optional(),
  })
  .strict();

export const BusinessUnitInputSchema = z
  .object({
    name: RequiredNameSchema(120),
    slug: BusinessUnitSlugSchema,
    timezone: TimeZoneSchema.optional(),
    postalCode: OptionalAddressFieldSchema(16),
    street: OptionalAddressFieldSchema(160),
    number: OptionalAddressFieldSchema(20),
    complement: OptionalAddressFieldSchema(80),
    district: OptionalAddressFieldSchema(80),
    city: OptionalAddressFieldSchema(100),
    state: OptionalAddressFieldSchema(64),
    countryCode: z
      .string()
      .trim()
      .length(2)
      .transform((value) => value.toUpperCase())
      .pipe(z.string().regex(/^[A-Z]{2}$/u))
      .optional(),
  })
  .strict();

export const CreateBusinessUnitRequestSchema = BusinessUnitInputSchema;
export const UpdateBusinessUnitRequestSchema = BusinessUnitInputSchema;

export const CreateTenantRequestSchema = z
  .object({
    legalName: RequiredNameSchema(160),
    displayName: RequiredNameSchema(120),
    slug: TenantSlugSchema,
    timezone: TimeZoneSchema,
    locale: LocaleSchema,
    currency: SupportedCurrencySchema,
    settings: TenantSettingsInputSchema.default({
      allowMultipleUnits: false,
      defaultAppointmentIntervalMinutes: 15,
      minimumAdvanceMinutes: 0,
      maximumAdvanceDays: 180,
      weekStartsOn: 'MONDAY',
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24H',
    }),
    initialUnit: InitialBusinessUnitInputSchema,
  })
  .strict();

export const TenantPublicSchema = z.object({
  publicId: TenantPublicIdSchema,
  slug: z.string(),
  displayName: z.string(),
  status: TenantStatusSchema,
  timezone: TimeZoneSchema,
  locale: LocaleSchema,
  currency: SupportedCurrencySchema,
  businessProfile: BusinessProfileCodeSchema.optional(),
});

export const BusinessUnitSchema = z.object({
  publicId: TenantPublicIdSchema,
  name: z.string(),
  slug: z.string(),
  status: BusinessUnitStatusSchema,
  isHeadquarters: z.boolean(),
  timezone: TimeZoneSchema,
  postalCode: z.string().nullable(),
  street: z.string().nullable(),
  number: z.string().nullable(),
  complement: z.string().nullable(),
  district: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  countryCode: z.string().nullable(),
});

export const TenantSettingsSchema = z.object({
  allowMultipleUnits: z.boolean(),
  defaultAppointmentIntervalMinutes: AppointmentIntervalSchema,
  minimumAdvanceMinutes: z.number().int().min(0).max(43_200),
  maximumAdvanceDays: z.number().int().min(1).max(365),
  weekStartsOn: WeekStartsOnSchema,
  dateFormat: z.literal('DD/MM/YYYY'),
  timeFormat: TimeFormatSchema,
});

export const CreateTenantResponseSchema = z.object({
  tenant: TenantPublicSchema,
  settings: TenantSettingsSchema,
  initialUnit: BusinessUnitSchema,
});

export const TenantContextResponseSchema = z.object({ tenant: TenantPublicSchema });
export const TenantIdentitySchema = z.object({
  legalName: z.string().min(2).max(160),
  displayName: z.string().min(2).max(120),
  slug: TenantSlugOutputSchema,
  slugChangeAvailable: z.boolean(),
  businessProfile: BusinessProfileCodeSchema,
  businessTypeCustom: z.string().nullable(),
});
export const UpdateTenantIdentityRequestSchema = z
  .object({
    legalName: RequiredNameSchema(160).optional(),
    displayName: RequiredNameSchema(120).optional(),
    slug: TenantSlugSchema.optional(),
    businessProfile: BusinessProfileCodeSchema.optional(),
    businessTypeCustom: z.string().trim().min(2).max(120).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Informe ao menos uma alteração.');
export type UpdateTenantIdentityRequest = z.infer<typeof UpdateTenantIdentityRequestSchema>;
export const TenantIdentityResponseSchema = z.object({ identity: TenantIdentitySchema });
export const TenantUnitsResponseSchema = z.object({ units: z.array(BusinessUnitSchema) });
export const TenantUnitResponseSchema = z.object({ unit: BusinessUnitSchema });
export const TenantSettingsResponseSchema = z.object({ settings: TenantSettingsSchema });

export const TenantErrorCodeSchema = z.enum([
  'TENANT_HEADER_REQUIRED',
  'TENANT_HEADER_INVALID',
  'TENANT_NOT_FOUND',
  'TENANT_INACTIVE',
  'TENANT_SUSPENDED',
  'TENANT_PENDING',
  'TENANT_SLUG_CONFLICT',
  'BUSINESS_UNIT_SLUG_CONFLICT',
  'TENANT_HEADQUARTERS_CONFLICT',
  'TENANT_STRUCTURE_CONFLICT',
  'BUSINESS_UNIT_NOT_FOUND',
  'BUSINESS_UNIT_LAST_ACTIVE',
  'BUSINESS_UNIT_HEADQUARTERS_INACTIVE',
  'BUSINESS_UNIT_INACTIVE',
]);

export type TenantStatus = z.infer<typeof TenantStatusSchema>;
export type BusinessUnitStatus = z.infer<typeof BusinessUnitStatusSchema>;
export type WeekStartsOn = z.infer<typeof WeekStartsOnSchema>;
export type TimeFormat = z.infer<typeof TimeFormatSchema>;
export type SupportedCurrency = z.infer<typeof SupportedCurrencySchema>;
export type CreateTenantRequest = z.infer<typeof CreateTenantRequestSchema>;
export type TenantPublic = z.infer<typeof TenantPublicSchema>;
export type BusinessUnit = z.infer<typeof BusinessUnitSchema>;
export type BusinessUnitInput = z.infer<typeof BusinessUnitInputSchema>;
export type CreateBusinessUnitRequest = z.infer<typeof CreateBusinessUnitRequestSchema>;
export type UpdateBusinessUnitRequest = z.infer<typeof UpdateBusinessUnitRequestSchema>;
export type TenantSettings = z.infer<typeof TenantSettingsSchema>;
export type CreateTenantResponse = z.infer<typeof CreateTenantResponseSchema>;
export type TenantContextResponse = z.infer<typeof TenantContextResponseSchema>;
export type TenantIdentity = z.infer<typeof TenantIdentitySchema>;
export type TenantUnitsResponse = z.infer<typeof TenantUnitsResponseSchema>;
export type TenantUnitResponse = z.infer<typeof TenantUnitResponseSchema>;
export type TenantSettingsResponse = z.infer<typeof TenantSettingsResponseSchema>;
export type TenantErrorCode = z.infer<typeof TenantErrorCodeSchema>;
