import { z } from 'zod';

export const UpsertWhatsAppConfigSchema = z
  .object({
    active: z.boolean(),
    instanceId: z.string().trim().min(3).max(80),
    token: z.string().trim().min(20).max(4096).optional(),
  })
  .strict();
export const WhatsAppConfigSchema = z.object({
  available: z.boolean(),
  configured: z.boolean(),
  active: z.boolean(),
  instanceId: z.string().nullable(),
  tokenConfigured: z.boolean(),
  connectionStatus: z.enum(['NOT_CONFIGURED', 'INACTIVE', 'CONNECTED', 'ERROR']).nullable(),
  lastValidatedAt: z.iso.datetime({ offset: true }).nullable(),
});
export const WhatsAppConnectionTestSchema = z.object({
  connected: z.boolean(),
  code: z.enum(['WHATSAPP_CONNECTED','WHATSAPP_CREDENTIALS_MISSING','WHATSAPP_INVALID_TOKEN','WHATSAPP_INSTANCE_NOT_FOUND','WHATSAPP_DISCONNECTED','WHATSAPP_ROUTE_UNAVAILABLE','WHATSAPP_RATE_LIMITED','WHATSAPP_TIMEOUT','WHATSAPP_NETWORK_ERROR','WHATSAPP_EXTERNAL_UNAVAILABLE','WHATSAPP_UNEXPECTED_RESPONSE']),
  message: z.string(),
  httpStatus: z.number().int().nullable(),
  externalCode: z.string().nullable(),
});
export const WhatsAppConnectionTestRequestSchema = z.object({ instanceId: z.string().trim().min(3).max(80).optional(), token: z.string().trim().min(20).max(4096).optional() }).strict();
/** Prova de integração: envio de botões e leitura do evento recebido. */
export const WhatsAppButtonTestRequestSchema = z
  .object({ phone: z.string().trim().min(10).max(20) })
  .strict();
export const WhatsAppOperationResultSchema = z.object({
  ok: z.boolean(),
  httpStatus: z.number().int().nullable(),
  externalCode: z.string().nullable(),
  message: z.string(),
  externalMessageId: z.string().nullable(),
});
export const WhatsAppButtonTestResponseSchema = WhatsAppOperationResultSchema.extend({
  actionIds: z.array(z.string()),
});
export const WhatsAppWebhookConfigResponseSchema = WhatsAppOperationResultSchema.extend({
  webhookUrl: z.string(),
});
export const WhatsAppInboundEventSchema = z.object({
  publicId: z.uuid(),
  eventType: z.string().nullable(),
  messageType: z.string().nullable(),
  maskedPhone: z.string().nullable(),
  externalMessageId: z.string().nullable(),
  actionId: z.string().nullable(),
  receivedAt: z.iso.datetime({ offset: true }),
  payload: z.unknown(),
});
export const WhatsAppLastInboundEventSchema = z.object({
  event: WhatsAppInboundEventSchema.nullable(),
});
const WhatsAppProbeSchema = z.object({
  ok: z.boolean(),
  httpStatus: z.number().int().nullable(),
  message: z.string(),
  payload: z.unknown(),
});
export const WhatsAppInstanceDiagnosticsSchema = z.object({
  instance: WhatsAppProbeSchema,
  queue: WhatsAppProbeSchema,
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
