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

// ---------------------------------------------------------------------
// Financeiro — analytics read-only (Fase 1). Two distinct concepts, never
// mixed: "received" (PlatformSubscriptionCharge, status=PAID, paidAt!=null)
// vs "contracted" (TenantSubscription.priceCents/billingCycle, an estimate,
// never a receipt).
// ---------------------------------------------------------------------

const MoneyCentsSchema = z.string().regex(/^\d+$/u);
const FinancePeriodQuerySchema = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

export const PlatformFinanceMonthlyReceiptSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/u),
  amountCents: MoneyCentsSchema,
});
export const PlatformFinancePlanBreakdownSchema = z.object({
  planPublicId: z.uuid(),
  planName: z.string(),
  activeSubscriptions: z.number().int().nonnegative(),
  mrrContractedCents: MoneyCentsSchema,
  receivedThisMonthCents: MoneyCentsSchema,
});
export const PlatformFinanceReceiptItemSchema = z.object({
  publicId: z.uuid(),
  createdAt: z.iso.datetime({ offset: true }),
  tenantPublicId: z.uuid(),
  tenantDisplayName: z.string(),
  planPublicId: z.uuid().nullable(),
  planName: z.string().nullable(),
  amountCents: MoneyCentsSchema,
  currency: z.string(),
  provider: PlatformPaymentProviderSchema,
  status: PaymentGatewayChargeStatusSchema,
  paidAt: z.iso.datetime({ offset: true }).nullable(),
  externalId: z.string().nullable(),
});
export const PlatformFinanceDashboardSchema = z.object({
  currency: z.string(),
  receivedThisMonthCents: MoneyCentsSchema,
  receivedLastMonthCents: MoneyCentsSchema,
  monthOverMonthChangePercent: z.number().nullable(),
  mrrContractedCents: MoneyCentsSchema,
  mrrAtRiskCents: MoneyCentsSchema,
  paymentsReceivedThisMonth: z.number().int().nonnegative(),
  averageTicketCents: MoneyCentsSchema.nullable(),
  pastDueSubscriptions: z.number().int().nonnegative(),
  suspendedSubscriptions: z.number().int().nonnegative(),
  newSubscribersThisMonth: z.number().int().nonnegative(),
  cancellationsThisMonth: z.number().int().nonnegative(),
  monthlyReceipts: z.array(PlatformFinanceMonthlyReceiptSchema),
  byPlan: z.array(PlatformFinancePlanBreakdownSchema),
  recentReceipts: z.array(PlatformFinanceReceiptItemSchema),
  disclaimer: z.string(),
});
export const PlatformFinanceReceiptsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    tenantPublicId: z.uuid().optional(),
    planPublicId: z.uuid().optional(),
    provider: PlatformPaymentProviderSchema.optional(),
    status: PaymentGatewayChargeStatusSchema.optional(),
    format: z.enum(['json', 'csv']).default('json'),
  })
  .strict();
export const PlatformFinanceReceiptsResponseSchema = z.object({
  items: z.array(PlatformFinanceReceiptItemSchema),
  page: z.object({
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});
export const PlatformFinanceSubscriptionsQuerySchema = z
  .object({
    segment: z.enum(['new', 'canceled']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    format: z.enum(['json', 'csv']).default('json'),
    ...FinancePeriodQuerySchema.shape,
  })
  .strict();
export const PlatformFinanceSubscriptionsSegmentItemSchema = z.object({
  publicId: z.uuid(),
  tenantPublicId: z.uuid(),
  tenantDisplayName: z.string(),
  planPublicId: z.uuid(),
  planName: z.string(),
  priceCents: MoneyCentsSchema,
  billingCycle: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
  canceledAt: z.iso.datetime({ offset: true }).nullable(),
});
export const PlatformFinanceSubscriptionsResponseSchema = z.object({
  active: z.number().int().nonnegative(),
  trialing: z.number().int().nonnegative(),
  newThisMonth: z.number().int().nonnegative(),
  canceledThisMonth: z.number().int().nonnegative(),
  mrrContractedCents: MoneyCentsSchema,
  currency: z.string(),
  byPlan: z.array(
    z.object({
      planPublicId: z.uuid(),
      planName: z.string(),
      activeSubscriptions: z.number().int().nonnegative(),
      mrrContractedCents: MoneyCentsSchema,
    }),
  ),
  segment: z
    .object({
      items: z.array(PlatformFinanceSubscriptionsSegmentItemSchema),
      page: z.object({
        page: z.number().int().min(1),
        limit: z.number().int().min(1).max(100),
        total: z.number().int().nonnegative(),
        totalPages: z.number().int().nonnegative(),
      }),
    })
    .nullable(),
});
export const PlatformFinanceDelinquencyQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(['PAST_DUE', 'SUSPENDED']).optional(),
    bucket: z.enum(['1-7', '8-15', '16-30', '30+']).optional(),
    format: z.enum(['json', 'csv']).default('json'),
  })
  .strict();
export const PlatformFinanceDelinquencyItemSchema = z.object({
  publicId: z.uuid(),
  tenantPublicId: z.uuid(),
  tenantDisplayName: z.string(),
  planPublicId: z.uuid(),
  planName: z.string(),
  priceCents: MoneyCentsSchema,
  currency: z.string(),
  currentPeriodEndsAt: z.iso.datetime({ offset: true }),
  daysSincePeriodEnd: z.number().int(),
  graceEndsAt: z.iso.datetime({ offset: true }).nullable(),
  status: z.enum(['PAST_DUE', 'SUSPENDED']),
});
export const PlatformFinanceDelinquencyResponseSchema = z.object({
  summary: z.object({
    pastDueCount: z.number().int().nonnegative(),
    suspendedCount: z.number().int().nonnegative(),
    pastDueContractedCents: MoneyCentsSchema,
    suspendedContractedCents: MoneyCentsSchema,
    buckets: z.object({
      d1_7: z.number().int().nonnegative(),
      d8_15: z.number().int().nonnegative(),
      d16_30: z.number().int().nonnegative(),
      d30Plus: z.number().int().nonnegative(),
    }),
  }),
  currency: z.string(),
  items: z.array(PlatformFinanceDelinquencyItemSchema),
  page: z.object({
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});
