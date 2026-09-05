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
/**
 * Conexão do WhatsApp provisionada pelo painel. O tenant nunca vê instanceId,
 * token nem qualquer credencial do provedor.
 */
export const WhatsAppConnectionStateSchema = z.enum([
  'NOT_CREATED',
  'CREATED',
  'WAITING_QR',
  'CONNECTED',
  'DISCONNECTED',
  'ERROR',
]);
export const WhatsAppConnectionSchema = z.object({
  available: z.boolean(),
  provisioned: z.boolean(),
  state: WhatsAppConnectionStateSchema,
  connectedPhone: z.string().nullable(),
  connectedName: z.string().nullable(),
  connectedAt: z.iso.datetime({ offset: true }).nullable(),
  lastStatusCheckAt: z.iso.datetime({ offset: true }).nullable(),
  /** Instância configurada manualmente antes do provisionamento automático. */
  legacy: z.boolean(),
});
/** QR é temporário: vem na resposta e não é persistido em lugar nenhum. */
export const WhatsAppQrCodeSchema = z.object({
  qrCode: z.string().min(1),
  connection: WhatsAppConnectionSchema,
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
  .object({
    phone: z.string().trim().min(10).max(20),
  })
  .strict();
export const WhatsAppOperationResultSchema = z.object({
  ok: z.boolean(),
  httpStatus: z.number().int().nullable(),
  externalCode: z.string().nullable(),
  message: z.string(),
  externalMessageId: z.string().nullable(),
  queuedId: z.string().nullable(),
});
export const WhatsAppButtonTestResponseSchema = z.object({
  externalMessageId: z.string().nullable(),
  status: z.enum(['QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED']),
  httpStatus: z.number().int().nullable(),
  errorCode: z.string().nullable(),
  message: z.string(),
  actionIds: z.array(z.string()),
});
export const WhatsAppWebhookConfigResponseSchema = z.object({
  received: WhatsAppOperationResultSchema,
  status: WhatsAppOperationResultSchema,
  webhookUrl: z.string(),
});
export const WhatsAppMessageStatusSchema = z.enum([
  'QUEUED',
  'SENT',
  'DELIVERED',
  'READ',
  'FAILED',
]);
export const WhatsAppLastMessageSchema = z.object({
  externalMessageId: z.string().nullable(),
  status: WhatsAppMessageStatusSchema,
  maskedPhone: z.string().nullable(),
  sentAt: z.iso.datetime({ offset: true }),
  deliveredAt: z.iso.datetime({ offset: true }).nullable(),
  readAt: z.iso.datetime({ offset: true }).nullable(),
  failedAt: z.iso.datetime({ offset: true }).nullable(),
  errorCode: z.string().nullable(),
});
export const WhatsAppInboundEventSchema = z.object({
  publicId: z.uuid(),
  eventType: z.string().nullable(),
  messageType: z.string().nullable(),
  maskedPhone: z.string().nullable(),
  externalMessageId: z.string().nullable(),
  actionId: z.string().nullable(),
  text: z.string().nullable(),
  receivedAt: z.iso.datetime({ offset: true }),
  payload: z.unknown(),
});
export const WhatsAppConversationSummarySchema = z.object({
  maskedPhone: z.string().nullable(),
  status: z.string(),
  currentFlow: z.string(),
  lastInboundAt: z.iso.datetime({ offset: true }),
});
export const WhatsAppLastInboundEventSchema = z.object({
  event: WhatsAppInboundEventSchema.nullable(),
  lastMessage: WhatsAppLastMessageSchema.nullable(),
  lastConversation: WhatsAppConversationSummarySchema.nullable(),
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
export const WhatsAppControlTestResponseSchema = z.object({
  phoneCheck: WhatsAppProbeSchema,
  text: WhatsAppOperationResultSchema,
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
