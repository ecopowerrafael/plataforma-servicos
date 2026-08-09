import { z } from 'zod';

import { NotificationKindSchema } from './notification.js';

export const NotificationTemplateEntrySchema = z.object({
  kind: NotificationKindSchema,
  subject: z.string(),
  body: z.string(),
  isCustom: z.boolean(),
});

export const NotificationTemplateListResponseSchema = z.object({
  items: z.array(NotificationTemplateEntrySchema),
});

export const UpdateNotificationTemplateRequestSchema = z
  .object({
    subject: z.string().trim().min(1).max(255).nullable(),
    body: z.string().trim().min(1).max(4000).nullable(),
  })
  .strict();

export type NotificationTemplateEntry = z.infer<typeof NotificationTemplateEntrySchema>;
