import { z } from 'zod';

import { NotificationKindSchema } from './notification.js';

export const NotificationTemplateEntrySchema = z.object({
  kind: NotificationKindSchema,
  subject: z.string(),
  body: z.string(),
  title: z.string(),
  intro: z.string(),
  afterText: z.string(),
  ctaLabel: z.string(),
  whatsappBody: z.string(),
  isCustom: z.boolean(),
});

export const NotificationTemplateListResponseSchema = z.object({
  items: z.array(NotificationTemplateEntrySchema),
});

export const UpdateNotificationTemplateRequestSchema = z
  .object({
    subject: z.string().trim().min(1).max(255).nullable(),
    body: z.string().trim().min(1).max(4000).nullable(),
    title: z.string().trim().min(1).max(160).nullable().optional(),
    intro: z.string().trim().min(1).max(1000).nullable().optional(),
    afterText: z.string().trim().min(1).max(1000).nullable().optional(),
    ctaLabel: z.string().trim().min(1).max(80).nullable().optional(),
    whatsappBody: z.string().trim().min(1).max(4000).nullable().optional(),
  })
  .strict();

export type NotificationTemplateEntry = z.infer<typeof NotificationTemplateEntrySchema>;
