import { z } from 'zod';

const MoneyPublicSchema = z.string().regex(/^\d+$/u);
const SignedMoneyPublicSchema = z.string().regex(/^-?\d+$/u);

export const FinancialReportQuerySchema = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    unitPublicId: z.uuid().optional(),
    professionalPublicId: z.uuid().optional(),
    compareWithPrevious: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => value === 'true'),
  })
  .strict();

export const FinancialReportBreakdownItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  totalCents: MoneyPublicSchema,
  count: z.number().int().min(0),
});

export const FinancialReportSummarySchema = z.object({
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
  grossRevenueCents: MoneyPublicSchema,
  netRevenueCents: SignedMoneyPublicSchema,
  paymentsReceivedCents: MoneyPublicSchema,
  paymentsReceivedCount: z.number().int().min(0),
  paymentsCanceledCents: MoneyPublicSchema,
  paymentsCanceledCount: z.number().int().min(0),
  depositsCents: MoneyPublicSchema,
  depositsCount: z.number().int().min(0),
  pendingBalanceCents: MoneyPublicSchema,
  pendingBalanceCount: z.number().int().min(0),
  cashManualInCents: MoneyPublicSchema,
  cashManualOutCents: MoneyPublicSchema,
  cashMovementsNetCents: SignedMoneyPublicSchema,
  commissionsCents: MoneyPublicSchema,
  commissionsCount: z.number().int().min(0),
  canceledAppointmentsCount: z.number().int().min(0),
  canceledAppointmentsLostRevenueCents: MoneyPublicSchema,
  noShowAppointmentsCount: z.number().int().min(0),
  noShowAppointmentsLostRevenueCents: MoneyPublicSchema,
});

export const FinancialReportComparisonSchema = z.object({
  previous: FinancialReportSummarySchema,
  deltaGrossRevenueCents: SignedMoneyPublicSchema,
  deltaGrossRevenuePercent: z.number().nullable(),
});

export const FinancialReportResponseSchema = z.object({
  summary: FinancialReportSummarySchema,
  byPaymentMethod: z.array(FinancialReportBreakdownItemSchema),
  byService: z.array(FinancialReportBreakdownItemSchema),
  byProfessional: z.array(FinancialReportBreakdownItemSchema),
  byUnit: z.array(FinancialReportBreakdownItemSchema),
  comparison: FinancialReportComparisonSchema.nullable(),
});

export type FinancialReportQuery = z.infer<typeof FinancialReportQuerySchema>;
export type FinancialReportSummary = z.infer<typeof FinancialReportSummarySchema>;
export type FinancialReportResponse = z.infer<typeof FinancialReportResponseSchema>;
