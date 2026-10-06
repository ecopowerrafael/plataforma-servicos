import { z } from 'zod';

import {
  CustomerMembershipChargeStatusSchema,
  CustomerMembershipStatusSchema,
} from './customer-membership.js';
import { PaymentGatewayChargeStatusSchema } from './payment-gateway.js';

export const CustomerMembershipPaymentChargeSchema = z.object({
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  amountCents: z.number().int().nonnegative(),
  status: CustomerMembershipChargeStatusSchema,
  dueAt: z.string().datetime(),
  paidAt: z.string().datetime().nullable(),
});

export const CustomerMembershipPaymentGatewaySchema = z.object({
  provider: z.string(),
  status: PaymentGatewayChargeStatusSchema,
  amountCents: z.number().int().nonnegative(),
  currency: z.string(),
  pixCopyPaste: z.string().nullable(),
  lastCheckedAt: z.string().datetime().nullable(),
  canceledAt: z.string().datetime().nullable(),
});

export const CustomerMembershipPaymentResponseSchema = z.object({
  membershipStatus: CustomerMembershipStatusSchema,
  charge: CustomerMembershipPaymentChargeSchema.nullable(),
  gateway: CustomerMembershipPaymentGatewaySchema.nullable(),
  canGenerateGatewayCharge: z.boolean(),
  canRefreshGatewayCharge: z.boolean(),
});

export type CustomerMembershipPaymentResponse = z.infer<
  typeof CustomerMembershipPaymentResponseSchema
>;
