import { z } from 'zod';

import { PaymentKindSchema } from './payment.js';

export const PaymentGatewayEnvironmentSchema = z.enum(['SANDBOX', 'PRODUCTION']);
export const PaymentGatewayChargeStatusSchema = z.enum([
  'PENDING',
  'PROCESSING',
  'PAID',
  'FAILED',
  'CANCELED',
  'EXPIRED',
  'REFUNDED',
]);

const MoneyInputSchema = z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const MoneyPublicSchema = z.string().regex(/^\d+$/u);

export const UpsertPaymentGatewayConfigRequestSchema = z
  .object({
    provider: z.string().trim().min(2).max(64),
    active: z.boolean(),
    environment: PaymentGatewayEnvironmentSchema,
    credentials: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const GatewayConfigQuerySchema = z.object({ provider: z.string().trim().min(2).max(64) });

export const PaymentGatewayConfigPublicSchema = z.object({
  publicId: z.uuid(),
  provider: z.string(),
  active: z.boolean(),
  environment: PaymentGatewayEnvironmentSchema,
  hasCredentials: z.boolean(),
  providerImplemented: z.boolean(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const CreateGatewayChargeRequestSchema = z
  .object({
    amountCents: MoneyInputSchema,
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/u)
      .default('BRL'),
    idempotencyKey: z.string().trim().min(8).max(191),
    description: z.string().trim().min(1).max(500).nullable().optional(),
    kind: PaymentKindSchema.default('PAYMENT'),
  })
  .strict();

export const CancelGatewayChargeRequestSchema = z
  .object({ reason: z.string().trim().min(3).max(500) })
  .strict();

export const PaymentGatewayChargePublicSchema = z.object({
  publicId: z.uuid(),
  appointmentPublicId: z.uuid(),
  paymentPublicId: z.uuid().nullable(),
  provider: z.string(),
  environment: PaymentGatewayEnvironmentSchema,
  kind: PaymentKindSchema,
  externalId: z.string().nullable(),
  status: PaymentGatewayChargeStatusSchema,
  amountCents: MoneyPublicSchema,
  currency: z.string(),
  idempotencyKey: z.string(),
  pixCopyPaste: z.string().nullable(),
  lastCheckedAt: z.iso.datetime({ offset: true }).nullable(),
  canceledAt: z.iso.datetime({ offset: true }).nullable(),
  canceledReason: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});

export const GatewayChargeListResponseSchema = z.object({
  items: z.array(PaymentGatewayChargePublicSchema),
});

export type UpsertPaymentGatewayConfigRequest = z.infer<
  typeof UpsertPaymentGatewayConfigRequestSchema
>;
export type GatewayConfigQuery = z.infer<typeof GatewayConfigQuerySchema>;
export type PaymentGatewayConfigPublic = z.infer<typeof PaymentGatewayConfigPublicSchema>;
export type CreateGatewayChargeRequest = z.infer<typeof CreateGatewayChargeRequestSchema>;
export type PaymentGatewayChargePublic = z.infer<typeof PaymentGatewayChargePublicSchema>;
export type PaymentGatewayEnvironment = z.infer<typeof PaymentGatewayEnvironmentSchema>;
export type PaymentGatewayChargeStatus = z.infer<typeof PaymentGatewayChargeStatusSchema>;
