import { z } from 'zod';

export const CouponDiscountTypeSchema = z.enum(['FIXED', 'PERCENTAGE']);

const MoneyPublicSchema = z.string().regex(/^\d+$/u);
const CouponCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_-]{3,40}$/u);

export const CreateCouponRequestSchema = z
  .object({
    code: CouponCodeSchema,
    discountType: CouponDiscountTypeSchema,
    discountValue: z.coerce.number().int().min(1),
    active: z.boolean().default(true),
    validFrom: z.iso.datetime({ offset: true }).nullable().optional(),
    validUntil: z.iso.datetime({ offset: true }).nullable().optional(),
    maxUses: z.coerce.number().int().min(1).nullable().optional(),
    maxUsesPerCustomer: z.coerce.number().int().min(1).nullable().optional(),
  })
  .strict()
  .refine(
    (value) => value.discountType !== 'PERCENTAGE' || value.discountValue <= 100,
    'Desconto percentual não pode ser maior que 100.',
  );

export const UpdateCouponRequestSchema = z
  .object({
    discountType: CouponDiscountTypeSchema,
    discountValue: z.coerce.number().int().min(1),
    active: z.boolean(),
    validFrom: z.iso.datetime({ offset: true }).nullable().optional(),
    validUntil: z.iso.datetime({ offset: true }).nullable().optional(),
    maxUses: z.coerce.number().int().min(1).nullable().optional(),
    maxUsesPerCustomer: z.coerce.number().int().min(1).nullable().optional(),
  })
  .strict()
  .refine(
    (value) => value.discountType !== 'PERCENTAGE' || value.discountValue <= 100,
    'Desconto percentual não pode ser maior que 100.',
  );

export const CouponPublicSchema = z.object({
  publicId: z.uuid(),
  code: z.string(),
  discountType: CouponDiscountTypeSchema,
  discountValue: z.number().int(),
  active: z.boolean(),
  validFrom: z.iso.datetime({ offset: true }).nullable(),
  validUntil: z.iso.datetime({ offset: true }).nullable(),
  maxUses: z.number().int().nullable(),
  maxUsesPerCustomer: z.number().int().nullable(),
  usageCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const CouponListResponseSchema = z.object({ items: z.array(CouponPublicSchema) });

export const RedeemCouponRequestSchema = z.object({ code: CouponCodeSchema }).strict();

export const CouponRedemptionPublicSchema = z.object({
  publicId: z.uuid(),
  couponCode: z.string(),
  appointmentPublicId: z.uuid(),
  discountAmountCents: MoneyPublicSchema,
  canceledAt: z.iso.datetime({ offset: true }).nullable(),
  canceledReason: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});

export const CouponRedemptionListResponseSchema = z.object({
  items: z.array(CouponRedemptionPublicSchema),
});

export type CreateCouponRequest = z.infer<typeof CreateCouponRequestSchema>;
export type UpdateCouponRequest = z.infer<typeof UpdateCouponRequestSchema>;
export type CouponPublic = z.infer<typeof CouponPublicSchema>;
export type RedeemCouponRequest = z.infer<typeof RedeemCouponRequestSchema>;
export type CouponRedemptionPublic = z.infer<typeof CouponRedemptionPublicSchema>;
