import { z } from 'zod';

import {
  PaymentGatewayChargePublicSchema,
  PaymentGatewayEnvironmentSchema,
} from './payment-gateway.js';
import { PaymentKindSchema } from './payment.js';

export const PixKeyTypeSchema = z.enum(['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'RANDOM']);

const MoneyPublicSchema = z.string().regex(/^\d+$/u);

export const UpsertPayLocalOptionRequestSchema = z.object({ active: z.boolean() }).strict();

export const UpsertPixLocalConfigRequestSchema = z
  .object({
    active: z.boolean(),
    keyType: PixKeyTypeSchema,
    key: z.string().trim().min(1).max(140),
    receiverName: z.string().trim().min(1).max(25),
    city: z.string().trim().min(1).max(15),
    description: z.string().trim().max(72).nullable().optional(),
  })
  .strict();

export const UpsertMercadoPagoConfigRequestSchema = z
  .object({
    active: z.boolean(),
    environment: PaymentGatewayEnvironmentSchema,
    accessToken: z.string().trim().min(1).optional(),
    webhookSecret: z.string().trim().min(1).optional(),
  })
  .strict();

export const PayLocalOptionPublicSchema = z.object({ active: z.boolean() });

export const PixLocalOptionPublicSchema = z.object({
  active: z.boolean(),
  hasCredentials: z.boolean(),
  keyType: PixKeyTypeSchema.nullable(),
  receiverName: z.string().nullable(),
  city: z.string().nullable(),
});

export const MercadoPagoOptionPublicSchema = z.object({
  active: z.boolean(),
  hasCredentials: z.boolean(),
  environment: PaymentGatewayEnvironmentSchema,
  providerImplemented: z.boolean(),
});

export const TenantPaymentOptionsOverviewSchema = z.object({
  payLocal: PayLocalOptionPublicSchema,
  pixLocal: PixLocalOptionPublicSchema,
  mercadoPago: MercadoPagoOptionPublicSchema,
});

export const AppointmentPaymentOptionsResponseSchema = z.object({
  payLocalAvailable: z.boolean(),
  pixLocalAvailable: z.boolean(),
  mercadoPagoAvailable: z.boolean(),
  depositRequired: z.boolean(),
  depositAmountCents: MoneyPublicSchema.nullable(),
  depositPaidCents: MoneyPublicSchema,
  balanceCents: MoneyPublicSchema,
});

export const CreateOnlineChargeRequestSchema = z
  .object({ kind: PaymentKindSchema.default('PAYMENT') })
  .strict();

export const PixChargeResponseSchema = z.object({
  charge: PaymentGatewayChargePublicSchema,
  qrCodeDataUrl: z.string(),
});

export const QrCodeResponseSchema = z.object({ qrCodeDataUrl: z.string() });

export type UpsertPayLocalOptionRequest = z.infer<typeof UpsertPayLocalOptionRequestSchema>;
export type UpsertPixLocalConfigRequest = z.infer<typeof UpsertPixLocalConfigRequestSchema>;
export type UpsertMercadoPagoConfigRequest = z.infer<typeof UpsertMercadoPagoConfigRequestSchema>;
export type TenantPaymentOptionsOverview = z.infer<typeof TenantPaymentOptionsOverviewSchema>;
export type AppointmentPaymentOptionsResponse = z.infer<
  typeof AppointmentPaymentOptionsResponseSchema
>;
export type CreateOnlineChargeRequest = z.infer<typeof CreateOnlineChargeRequestSchema>;
