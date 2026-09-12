import { z } from 'zod';

import { PublicSiteBehaviorSchema } from './platform.js';

const IsoDateSchema = z.iso.datetime({ offset: true });
const CommercialWhatsappSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    const normalized = value.replace(/[^0-9]/gu, '');
    return normalized.length === 0 ? null : normalized;
  },
  z
    .string()
    .regex(/^[1-9][0-9]{7,14}$/u, 'Informe um número válido com DDI e DDD.')
    .nullable(),
);

export const TenantCommercialPolicySchema = z.object({
  publicId: z.uuid(),
  defaultTrialDays: z.number().int().min(0).max(3650),
  graceDays: z.number().int().min(0).max(3650),
  autoSuspendAfterGrace: z.boolean(),
  allowAdminLoginWhileBlocked: z.boolean(),
  allowCalendarReadWhileBlocked: z.boolean(),
  allowAdminChangesWhileBlocked: z.boolean(),
  allowInternalBookingWhileBlocked: z.boolean(),
  allowPublicBookingWhileBlocked: z.boolean(),
  publicSiteBehaviorWhileBlocked: PublicSiteBehaviorSchema,
  adminMessage: z.string(),
  publicMessage: z.string(),
  commercialWhatsapp: z.string().nullable(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});

export const UpdateTenantCommercialPolicyRequestSchema = z
  .object({
    defaultTrialDays: z.coerce.number().int().min(0).max(3650).optional(),
    graceDays: z.coerce.number().int().min(0).max(3650).optional(),
    autoSuspendAfterGrace: z.boolean().optional(),
    allowAdminLoginWhileBlocked: z.boolean().optional(),
    allowCalendarReadWhileBlocked: z.boolean().optional(),
    allowAdminChangesWhileBlocked: z.boolean().optional(),
    allowInternalBookingWhileBlocked: z.boolean().optional(),
    allowPublicBookingWhileBlocked: z.boolean().optional(),
    publicSiteBehaviorWhileBlocked: PublicSiteBehaviorSchema.optional(),
    adminMessage: z.string().trim().min(1).max(1000).optional(),
    publicMessage: z.string().trim().min(1).max(1000).optional(),
    commercialWhatsapp: CommercialWhatsappSchema.optional(),
  })
  .strict();

export const TenantCommercialStateSchema = z.enum([
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'GRACE',
  'SUSPENDED',
  'CANCELED',
  'EXPIRED',
]);

export const TenantCommercialCapabilitiesSchema = z.object({
  canAccessAdmin: z.boolean(),
  canReadCalendar: z.boolean(),
  canManageData: z.boolean(),
  canCreateInternalAppointment: z.boolean(),
  canAcceptPublicBooking: z.boolean(),
  canServePublicSite: z.boolean(),
});

export const TenantCommercialStatusSchema = z.object({
  state: TenantCommercialStateSchema,
  trialDaysRemaining: z.number().int().nonnegative().nullable(),
  trialEndsAt: IsoDateSchema.nullable(),
  currentPeriodEndsAt: IsoDateSchema.nullable(),
  graceEndsAt: IsoDateSchema.nullable(),
  capabilities: TenantCommercialCapabilitiesSchema,
  adminMessage: z.string().nullable(),
  publicMessage: z.string().nullable(),
  publicSiteBehavior: PublicSiteBehaviorSchema,
});

export type TenantCommercialPolicy = z.infer<typeof TenantCommercialPolicySchema>;
export type UpdateTenantCommercialPolicyRequest = z.infer<
  typeof UpdateTenantCommercialPolicyRequestSchema
>;
export type TenantCommercialState = z.infer<typeof TenantCommercialStateSchema>;
export type TenantCommercialCapabilities = z.infer<typeof TenantCommercialCapabilitiesSchema>;
export type TenantCommercialStatus = z.infer<typeof TenantCommercialStatusSchema>;
