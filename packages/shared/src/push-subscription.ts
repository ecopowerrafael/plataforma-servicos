import { z } from 'zod';

export const SubscribePushRequestSchema = z
  .object({
    endpoint: z.url().max(2000),
    keys: z.object({
      p256dh: z.string().trim().min(1).max(255),
      auth: z.string().trim().min(1).max(255),
    }),
    userAgent: z.string().trim().max(255).optional(),
  })
  .strict();

export const UnsubscribePushRequestSchema = z.object({ endpoint: z.url().max(2000) }).strict();

export const PushSubscriptionPublicSchema = z.object({
  publicId: z.uuid(),
  userAgent: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  lastUsedAt: z.iso.datetime({ offset: true }).nullable(),
});

export const PushSubscriptionListResponseSchema = z.object({
  items: z.array(PushSubscriptionPublicSchema),
});

export const VapidPublicKeyResponseSchema = z.object({ publicKey: z.string().nullable() });

export type SubscribePushRequest = z.infer<typeof SubscribePushRequestSchema>;
