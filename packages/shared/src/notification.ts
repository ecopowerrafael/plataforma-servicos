import { z } from 'zod';

export const NotificationChannelSchema = z.enum(['EMAIL', 'PUSH']);
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
