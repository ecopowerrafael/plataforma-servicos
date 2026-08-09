import { z } from 'zod';

export const AutomationTriggerSchema = z.enum([
  'APPOINTMENT_REMINDER',
  'POST_APPOINTMENT',
  'INACTIVE_CUSTOMER',
  'CUSTOMER_BIRTHDAY',
]);
export const UpdateAutomationRequestSchema = z
  .object({
    active: z.boolean(),
    offsetMinutes: z.coerce.number().int().min(0).max(525_600).default(0),
  })
  .strict();
export const AutomationPublicSchema = z.object({
  publicId: z.uuid(),
  trigger: AutomationTriggerSchema,
  active: z.boolean(),
  offsetMinutes: z.number().int(),
  updatedAt: z.iso.datetime({ offset: true }),
});
export const AutomationListResponseSchema = z.object({ items: z.array(AutomationPublicSchema) });
export type UpdateAutomationRequest = z.infer<typeof UpdateAutomationRequestSchema>;
