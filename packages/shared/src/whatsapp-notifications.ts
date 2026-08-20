import { z } from 'zod';

export const WhatsAppButtonSchema = z.object({
  actionKey: z.string(),
  label: z.string(),
  enabled: z.boolean(),
  order: z.number(),
});

export const WhatsAppMessageConfigSchema = z.object({
  kind: z.string(),
  title: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  body: z.string(),
  buttons: z.array(WhatsAppButtonSchema),
  allowedActions: z.array(z.string()),
  isCustomized: z.boolean(),
  placeholders: z.array(z.string()),
});

export const WhatsAppMessagesListResponseSchema = z.object({
  items: z.array(WhatsAppMessageConfigSchema),
});

export const UpdateWhatsAppMessageSchema = z
  .object({
    enabled: z.boolean().optional(),
    body: z.string().trim().min(1).max(4000).optional(),
    buttons: z
      .array(
        z.object({
          actionKey: z.string(),
          label: z.string(),
          enabled: z.boolean(),
          order: z.number(),
        }),
      )
      .optional(),
  })
  .strict();

export const WhatsAppReminderConfigSchema = z.object({
  dayBeforeEnabled: z.boolean(),
  dayBeforeDaysBefore: z.number().int().min(1).max(30),
  dayBeforeHour: z.number().int().min(0).max(23),
  dayBeforeMinute: z.number().int().min(0).max(59),
  upcomingEnabled: z.boolean(),
  upcomingMinutesBefore: z.number().int().min(1).max(1440),
});

export const UpdateWhatsAppReminderConfigSchema = z
  .object({
    dayBeforeEnabled: z.boolean().optional(),
    dayBeforeDaysBefore: z.number().int().min(1).max(30).optional(),
    dayBeforeHour: z.number().int().min(0).max(23).optional(),
    dayBeforeMinute: z.number().int().min(0).max(59).optional(),
    upcomingEnabled: z.boolean().optional(),
    upcomingMinutesBefore: z.number().int().min(1).max(1440).optional(),
  })
  .strict();

export type WhatsAppButton = z.infer<typeof WhatsAppButtonSchema>;
export type WhatsAppMessageConfig = z.infer<typeof WhatsAppMessageConfigSchema>;
export type WhatsAppMessagesListResponse = z.infer<typeof WhatsAppMessagesListResponseSchema>;
export type UpdateWhatsAppMessage = z.infer<typeof UpdateWhatsAppMessageSchema>;
export type WhatsAppReminderConfig = z.infer<typeof WhatsAppReminderConfigSchema>;
export type UpdateWhatsAppReminderConfig = z.infer<typeof UpdateWhatsAppReminderConfigSchema>;
