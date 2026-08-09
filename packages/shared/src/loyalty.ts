import { z } from 'zod';

export const LoyaltyTypeSchema = z.enum(['POINTS', 'CASHBACK']);
export const LoyaltyDirectionSchema = z.enum(['CREDIT', 'DEBIT']);
export const LoyaltyReasonSchema = z.enum(['EARNED', 'REDEEMED', 'EXPIRED', 'REVERSED']);

const MoneyPublicSchema = z.string().regex(/^\d+$/u);

export const UpsertLoyaltyRuleRequestSchema = z
  .object({
    active: z.boolean(),
    earnRate: z.coerce.number().int().min(1),
    minEligibleAmountCents: z.coerce.number().int().min(0).default(0),
    redeemRateCentsPerPoint: z.coerce.number().int().min(1).nullable().optional(),
    expirationDays: z.coerce.number().int().min(1).nullable().optional(),
  })
  .strict();

export const LoyaltyRulePublicSchema = z.object({
  publicId: z.uuid(),
  type: LoyaltyTypeSchema,
  active: z.boolean(),
  earnRate: z.number().int(),
  minEligibleAmountCents: MoneyPublicSchema,
  redeemRateCentsPerPoint: z.number().int().nullable(),
  expirationDays: z.number().int().nullable(),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const LoyaltyRuleListResponseSchema = z.object({ items: z.array(LoyaltyRulePublicSchema) });

export const LoyaltyLedgerEntryPublicSchema = z.object({
  publicId: z.uuid(),
  type: LoyaltyTypeSchema,
  direction: LoyaltyDirectionSchema,
  reason: LoyaltyReasonSchema,
  amount: MoneyPublicSchema,
  discountCentsApplied: MoneyPublicSchema.nullable(),
  sourcePaymentPublicId: z.uuid().nullable(),
  sourceAppointmentPublicId: z.uuid().nullable(),
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});

export const LoyaltyLedgerListResponseSchema = z.object({
  items: z.array(LoyaltyLedgerEntryPublicSchema),
});

export const LoyaltyBalanceSchema = z.object({
  type: LoyaltyTypeSchema,
  balance: MoneyPublicSchema,
});

export const LoyaltyAccountSummarySchema = z.object({
  balances: z.array(LoyaltyBalanceSchema),
  recentEntries: z.array(LoyaltyLedgerEntryPublicSchema),
});

export const RedeemLoyaltyRequestSchema = z
  .object({ type: LoyaltyTypeSchema, amount: z.coerce.number().int().min(1) })
  .strict();

export const CancelLoyaltyRedemptionRequestSchema = z
  .object({ reason: z.string().trim().min(3).max(500) })
  .strict();

export type UpsertLoyaltyRuleRequest = z.infer<typeof UpsertLoyaltyRuleRequestSchema>;
export type LoyaltyRulePublic = z.infer<typeof LoyaltyRulePublicSchema>;
export type LoyaltyLedgerEntryPublic = z.infer<typeof LoyaltyLedgerEntryPublicSchema>;
export type LoyaltyAccountSummary = z.infer<typeof LoyaltyAccountSummarySchema>;
export type RedeemLoyaltyRequest = z.infer<typeof RedeemLoyaltyRequestSchema>;
