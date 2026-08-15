import { z } from 'zod';

export const NotificationChannelSchema = z.enum(['EMAIL', 'PUSH', 'WHATSAPP', 'WEBHOOK']);
export const NotificationStatusSchema = z.enum([
  'PENDING',
  'PROCESSING',
  'SENT',
  'FAILED',
  'SKIPPED',
]);

export const NotificationKinds = [
  'appointment.booking_confirmed',
  'appointment.booking_canceled',
  'appointment.reminder',
  'customer.recovery.inactive',
  'customer.recovery.canceled',
  'customer.recovery.no_show',
  'customer.recovery.post_service',
  'customer.recovery.birthday',
] as const;
export const NotificationKindSchema = z.enum(NotificationKinds);

/**
 * Notificações transacionais: fazem parte do próprio serviço contratado
 * (o agendamento) e por isso não dependem de opt-in de comunicação. Toda a
 * classificação vive aqui — nenhum canal decide isso por conta própria.
 * O que não estiver nesta lista é marketing/automação e continua exigindo
 * `acceptsCommunications`.
 */
export const TransactionalNotificationKinds = [
  'appointment.booking_confirmed',
  'appointment.booking_canceled',
  'appointment.reminder',
] as const satisfies readonly (typeof NotificationKinds)[number][];

export function isTransactionalNotification(kind: string): boolean {
  return (TransactionalNotificationKinds as readonly string[]).includes(kind);
}

export const NotificationLogPublicSchema = z.object({
  publicId: z.uuid(),
  channel: NotificationChannelSchema,
  kind: z.string(),
  targetType: z.string(),
  targetPublicId: z.uuid().nullable(),
  recipient: z.string(),
  subject: z.string(),
  status: NotificationStatusSchema,
  attempts: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  sentAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});

export const NotificationListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: NotificationStatusSchema.optional(),
    kind: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

export const NotificationListResponseSchema = z.object({
  items: z.array(NotificationLogPublicSchema),
  page: z.object({
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});

export type NotificationLogPublic = z.infer<typeof NotificationLogPublicSchema>;
export type NotificationListQuery = z.infer<typeof NotificationListQuerySchema>;

export const CampaignAudienceSchema = z.enum(['CUSTOMERS', 'PROFESSIONALS']);
export const CampaignRecipientModeSchema = z.enum(['ALL', 'SELECTED']);
export const CreateNotificationCampaignRequestSchema = z
  .object({
    audience: CampaignAudienceSchema,
    recipientMode: CampaignRecipientModeSchema,
    recipientPublicIds: z.array(z.uuid()).max(500).default([]),
    idempotencyKey: z.uuid(),
    channel: z.enum(['PUSH', 'WHATSAPP']),
    title: z.string().trim().min(1).max(160).optional(),
    message: z.string().trim().min(1).max(4000),
    whatsappRiskAcknowledged: z.boolean().default(false),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.recipientMode === 'SELECTED' && value.recipientPublicIds.length === 0)
      context.addIssue({
        code: 'custom',
        path: ['recipientPublicIds'],
        message: 'Selecione ao menos uma pessoa.',
      });
    if (value.channel === 'PUSH' && (value.title?.trim() ?? '') === '')
      context.addIssue({
        code: 'custom',
        path: ['title'],
        message: 'Informe um título para a notificação push.',
      });
  });

export const NotificationCampaignSummarySchema = z.object({
  publicId: z.uuid(),
  audience: CampaignAudienceSchema,
  channel: z.enum(['PUSH', 'WHATSAPP']),
  title: z.string(),
  message: z.string(),
  status: z.enum(['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED']),
  recipientCount: z.number().int().nonnegative(),
  eligibleCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  deliveryCount: z.number().int().nonnegative(),
  queued: z.number().int().nonnegative(),
  sent: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  createdAt: z.iso.datetime({ offset: true }),
});
export const NotificationCampaignListResponseSchema = z.object({
  items: z.array(NotificationCampaignSummarySchema),
});
export type NotificationCampaignSummary = z.infer<typeof NotificationCampaignSummarySchema>;
