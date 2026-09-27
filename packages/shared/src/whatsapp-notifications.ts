import { z } from 'zod';

export const WhatsAppButtonSchema = z.object({
  actionKey: z.string(),
  label: z.string(),
  enabled: z.boolean(),
  order: z.number(),
});

export const WhatsAppMessageConfigSchema = z.object({
  kind: z.string(),
  enabled: z.boolean(),
  body: z.string().nullable(),
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

/**
 * Assistente automático — configuração de saudação e menu.
 */

const ALLOWED_ASSISTANT_ACTION_IDS = [
  'MAIN_MENU_BOOK',
  'MAIN_MENU_QUERY',
  'MAIN_MENU_RESCHEDULE',
  'MAIN_MENU_CANCEL',
  'MAIN_MENU_OTHER',
] as const;

export const WhatsAppAssistantMenuButtonSchema = z.object({
  actionId: z.enum(ALLOWED_ASSISTANT_ACTION_IDS),
  label: z.string(),
  enabled: z.boolean(),
  order: z.number(),
});

export const WhatsAppAssistantGreetingSchema = z.object({
  enabled: z.boolean(),
  newCustomerBody: z.string(),
  returningCustomerBody: z.string(),
});

export const WhatsAppAssistantMenuSchema = z.object({
  buttons: z.array(WhatsAppAssistantMenuButtonSchema),
});

export const WhatsAppAssistantConfigSchema = z.object({
  greeting: WhatsAppAssistantGreetingSchema,
  menu: WhatsAppAssistantMenuSchema,
});

export const WhatsAppAssistantConfigResponseSchema = z.object({
  config: WhatsAppAssistantConfigSchema,
  isCustomized: z.boolean(),
});

export type WhatsAppAssistantMenuButton = z.infer<typeof WhatsAppAssistantMenuButtonSchema>;
export type WhatsAppAssistantGreeting = z.infer<typeof WhatsAppAssistantGreetingSchema>;
export type WhatsAppAssistantMenu = z.infer<typeof WhatsAppAssistantMenuSchema>;
export type WhatsAppAssistantConfig = z.infer<typeof WhatsAppAssistantConfigSchema>;
export type WhatsAppAssistantConfigResponse = z.infer<typeof WhatsAppAssistantConfigResponseSchema>;
