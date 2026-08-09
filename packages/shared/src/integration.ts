import { z } from 'zod';

export const UpsertWhatsAppConfigSchema = z
  .object({
    active: z.boolean(),
    phoneNumberId: z.string().trim().min(1).max(80),
    businessAccountId: z.string().trim().min(1).max(80),
    accessToken: z.string().trim().min(20).max(4096).optional(),
    apiVersion: z
      .string()
      .regex(/^v\d+\.\d+$/u)
      .default('v23.0'),
  })
  .strict();
export const WhatsAppConfigSchema = z.object({
  configured: z.boolean(),
  active: z.boolean(),
  phoneNumberId: z.string().nullable(),
  businessAccountId: z.string().nullable(),
  apiVersion: z.string().nullable(),
});
export const IntegrationEventSchema = z.enum(['notification.queued']);
export const UpsertExternalIntegrationSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    endpoint: z.url().refine((url) => url.startsWith('https://'), 'A URL deve utilizar HTTPS.'),
    secret: z.string().min(16).max(4096).nullable().optional(),
    events: z.array(IntegrationEventSchema).min(1),
    active: z.boolean(),
  })
  .strict();
export const ExternalIntegrationSchema = z.object({
  publicId: z.uuid(),
  name: z.string(),
  endpoint: z.url(),
  events: z.array(IntegrationEventSchema),
  active: z.boolean(),
  hasSecret: z.boolean(),
});
export const ExternalIntegrationListSchema = z.object({
  items: z.array(ExternalIntegrationSchema),
});
