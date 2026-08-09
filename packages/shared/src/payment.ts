import { z } from 'zod';

import { DepositTypeSchema } from './appointment.js';

export const PaymentKindSchema = z.enum(['PAYMENT', 'DEPOSIT']);
export const PaymentStatusSchema = z.enum(['PAID', 'CANCELED']);

const MoneyInputSchema = z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const MoneyPublicSchema = z.string().regex(/^\d+$/u);

export const CreatePaymentRequestSchema = z
  .object({
    paymentMethodPublicId: z.uuid(),
    kind: PaymentKindSchema.default('PAYMENT'),
    amountCents: MoneyInputSchema,
    notes: z.string().trim().min(1).max(500).nullable().optional(),
  })
  .strict();

export const CancelPaymentRequestSchema = z
  .object({ reason: z.string().trim().min(3).max(500) })
  .strict();

export const PaymentPublicSchema = z.object({
  publicId: z.uuid(),
  appointmentPublicId: z.uuid(),
  paymentMethodPublicId: z.uuid(),
  paymentMethodName: z.string(),
  kind: PaymentKindSchema,
  status: PaymentStatusSchema,
  amountCents: MoneyPublicSchema,
  notes: z.string().nullable(),
  canceledAt: z.iso.datetime({ offset: true }).nullable(),
  canceledReason: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});

export const AppointmentPaymentsResponseSchema = z.object({
  items: z.array(PaymentPublicSchema),
  summary: z.object({
    priceCents: MoneyPublicSchema,
    totalPaidCents: MoneyPublicSchema,
    balanceCents: MoneyPublicSchema,
    depositType: DepositTypeSchema.nullable(),
    depositPercentage: z.number().int().min(1).max(100).nullable(),
    depositAmountCents: MoneyPublicSchema.nullable(),
    depositPaidCents: MoneyPublicSchema,
    couponDiscountCents: MoneyPublicSchema,
    loyaltyDiscountCents: MoneyPublicSchema,
  }),
});

export type CreatePaymentRequest = z.infer<typeof CreatePaymentRequestSchema>;
export type PaymentPublic = z.infer<typeof PaymentPublicSchema>;
