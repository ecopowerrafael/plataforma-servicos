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
});
export const RecoveryEligibleListResponseSchema = z.object({
  items: z.array(RecoveryEligibleCustomerSchema),
});
export const RecoveryExecutionSchema = z.object({
  publicId: z.uuid(),
  customerPublicId: z.uuid(),
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
