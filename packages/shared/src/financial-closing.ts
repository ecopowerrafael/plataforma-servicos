import { z } from 'zod';

export const FinancialClosingStatusSchema = z.enum(['ACTIVE', 'CANCELED']);

const MoneyPublicSchema = z.string().regex(/^\d+$/u);
const SignedMoneyPublicSchema = z.string().regex(/^-?\d+$/u);

export const CreateFinancialClosingRequestSchema = z
  .object({
    unitPublicId: z.uuid().nullable().optional(),
    periodFrom: z.iso.datetime({ offset: true }),
    periodTo: z.iso.datetime({ offset: true }),
  })
  .strict()
  .refine((value) => new Date(value.periodFrom) < new Date(value.periodTo), {
    message: 'O início do período deve ser anterior ao fim.',
    path: ['periodTo'],
  });

export const CancelFinancialClosingRequestSchema = z
  .object({ reason: z.string().trim().min(3).max(500) })
  .strict();

export const FinancialClosingQuerySchema = z
  .object({
    unitPublicId: z.uuid().optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

export const PaymentMethodBreakdownItemSchema = z.object({
  paymentMethodPublicId: z.uuid(),
  paymentMethodName: z.string(),
  totalCents: MoneyPublicSchema,
  count: z.number().int().min(0),
});

export const FinancialClosingPublicSchema = z.object({
  publicId: z.uuid(),
  unitPublicId: z.uuid().nullable(),
  periodFrom: z.iso.datetime({ offset: true }),
  periodTo: z.iso.datetime({ offset: true }),
  totalReceivedCents: MoneyPublicSchema,
  totalCanceledCents: MoneyPublicSchema,
  depositTotalCents: MoneyPublicSchema,
  manualInCents: MoneyPublicSchema,
  manualOutCents: MoneyPublicSchema,
  cashMovementsNetCents: SignedMoneyPublicSchema,
  commissionsTotalCents: MoneyPublicSchema,
  balanceCents: SignedMoneyPublicSchema,
  paymentMethodBreakdown: z.array(PaymentMethodBreakdownItemSchema),
  status: FinancialClosingStatusSchema,
  closedAt: z.iso.datetime({ offset: true }),
  closedByEmail: z.string().nullable(),
  canceledAt: z.iso.datetime({ offset: true }).nullable(),
  canceledReason: z.string().nullable(),
});

export const FinancialClosingListResponseSchema = z.object({
  items: z.array(FinancialClosingPublicSchema),
});

export type CreateFinancialClosingRequest = z.infer<typeof CreateFinancialClosingRequestSchema>;
export type FinancialClosingQuery = z.infer<typeof FinancialClosingQuerySchema>;
export type FinancialClosingPublic = z.infer<typeof FinancialClosingPublicSchema>;
