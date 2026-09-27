import { z } from 'zod';
export const RecoveryRuleSchema = z.enum([
  'INACTIVE',
  'CANCELED_NO_REBOOK',
  'NO_SHOW_NO_REBOOK',
  'POST_SERVICE_NO_RETURN',
  'BIRTHDAY',
]);
export const UpdateRecoveryRuleSchema = z
  .object({ active: z.boolean(), days: z.coerce.number().int().min(1).max(730).default(30) })
  .strict();
export const RecoveryRulePublicSchema = z.object({
  publicId: z.uuid(),
  rule: RecoveryRuleSchema,
  active: z.boolean(),
  days: z.number().int(),
});
export const RecoveryRuleListResponseSchema = z.object({
  items: z.array(RecoveryRulePublicSchema),
});
export const RecoveryEligibleCustomerSchema = z.object({
  customerPublicId: z.uuid(),
  name: z.string(),
  rule: RecoveryRuleSchema,
  referenceAt: z.iso.datetime({ offset: true }).nullable(),
  /* Contexto operacional resolvido junto da elegibilidade, sem consulta por cliente. */
  phone: z.string().nullable().default(null),
  daysSinceReference: z.number().int().nonnegative().nullable().default(null),
  lastServiceName: z.string().nullable().default(null),
  lastProfessionalName: z.string().nullable().default(null),
  nextAppointmentAt: z.iso.datetime({ offset: true }).nullable().default(null),
});
export const RecoveryEligibleListResponseSchema = z.object({
  items: z.array(RecoveryEligibleCustomerSchema),
  /* Elegíveis por régua, na mesma passagem — evita uma consulta por régua. */
  counts: z
    .object({
      INACTIVE: z.number().int().nonnegative(),
      CANCELED_NO_REBOOK: z.number().int().nonnegative(),
      NO_SHOW_NO_REBOOK: z.number().int().nonnegative(),
      POST_SERVICE_NO_RETURN: z.number().int().nonnegative(),
      BIRTHDAY: z.number().int().nonnegative(),
    })
    .partial()
    .default({}),
});
export const RecoveryExecutionSchema = z.object({
  publicId: z.uuid(),
  customerPublicId: z.uuid(),
  customerName: z.string().default(''),
  rule: RecoveryRuleSchema,
  periodKey: z.string(),
  status: z.enum(['SENT', 'SKIPPED', 'FAILED']),
  error: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});
export const RecoveryExecutionListResponseSchema = z.object({
  items: z.array(RecoveryExecutionSchema),
});
export const RecoveryRunResponseSchema = z.object({ processed: z.number().int().nonnegative() });
export type UpdateRecoveryRule = z.infer<typeof UpdateRecoveryRuleSchema>;
