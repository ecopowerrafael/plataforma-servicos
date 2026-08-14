import { z } from 'zod';

import { PaymentGatewayChargeStatusSchema, PaymentGatewayEnvironmentSchema } from './payment-gateway.js';

export const PlatformPaymentProviderSchema=z.enum(['pix-local','mercadopago']);
export const PlatformPaymentConfigInputSchema=z.object({provider:PlatformPaymentProviderSchema,active:z.boolean(),environment:PaymentGatewayEnvironmentSchema,credentials:z.record(z.string(),z.unknown()).optional()}).strict();
export const PlatformPaymentConfigSchema=z.object({provider:PlatformPaymentProviderSchema,active:z.boolean(),environment:PaymentGatewayEnvironmentSchema,hasCredentials:z.boolean(),keyType:z.string().nullable().optional(),receiverName:z.string().nullable().optional(),city:z.string().nullable().optional(),updatedAt:z.iso.datetime({offset:true})});
export const PlatformFinanceOverviewSchema=z.object({configs:z.array(PlatformPaymentConfigSchema),manualActivationEnabled:z.boolean()});
export const PlatformManualActivationInputSchema=z.object({active:z.boolean()}).strict();
export const PlatformChargeSchema=z.object({publicId:z.uuid(),subscriptionPublicId:z.uuid(),provider:PlatformPaymentProviderSchema,environment:PaymentGatewayEnvironmentSchema,externalId:z.string().nullable(),status:PaymentGatewayChargeStatusSchema,amountCents:z.string(),currency:z.string(),pixCopyPaste:z.string().nullable(),paidAt:z.iso.datetime({offset:true}).nullable(),createdAt:z.iso.datetime({offset:true})});
export const PlatformChargeResponseSchema=z.object({charge:PlatformChargeSchema,qrCodeDataUrl:z.string().optional()});
export const PlatformSubscriptionBillingSchema=z.object({methods:z.array(PlatformPaymentProviderSchema),manualActivationEnabled:z.boolean(),latestCharge:PlatformChargeSchema.nullable()});
export const CreatePlatformChargeSchema=z.object({provider:PlatformPaymentProviderSchema}).strict();
