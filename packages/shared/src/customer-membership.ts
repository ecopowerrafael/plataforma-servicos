import { z } from 'zod';

export const MembershipBillingIntervalSchema = z.enum([
  'MONTHLY',
  'QUARTERLY',
  'SEMIANNUAL',
  'ANNUAL',
]);
export type MembershipBillingInterval = z.infer<typeof MembershipBillingIntervalSchema>;

export const MembershipBenefitTypeSchema = z.enum(['QUANTITY', 'UNLIMITED', 'DISCOUNT']);
export type MembershipBenefitType = z.infer<typeof MembershipBenefitTypeSchema>;

// Plan Benefit
export const CustomerMembershipBenefitPublicSchema = z.object({
  publicId: z.string().uuid(),
  servicePublicId: z.string().uuid(),
  serviceName: z.string(),
  type: MembershipBenefitTypeSchema,
  quantityPerCycle: z.number().int().nonnegative().nullable(),
  discountPercent: z.number().int().min(0).max(100).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CustomerMembershipBenefitPublic = z.infer<
  typeof CustomerMembershipBenefitPublicSchema
>;

export const CustomerMembershipBenefitListResponseSchema = z.object({
  items: z.array(CustomerMembershipBenefitPublicSchema),
});

export const CreateCustomerMembershipBenefitRequestSchema = z.object({
  servicePublicId: z.string().uuid(),
  type: MembershipBenefitTypeSchema,
  quantityPerCycle: z.number().int().nonnegative().nullable().optional(),
  discountPercent: z.number().int().min(0).max(100).nullable().optional(),
});
export type CreateCustomerMembershipBenefitRequest = z.infer<
  typeof CreateCustomerMembershipBenefitRequestSchema
>;

export const UpdateCustomerMembershipBenefitRequestSchema =
  CreateCustomerMembershipBenefitRequestSchema;
export type UpdateCustomerMembershipBenefitRequest = z.infer<
  typeof UpdateCustomerMembershipBenefitRequestSchema
>;

// Plan
export const CustomerMembershipPlanPublicSchema = z.object({
  publicId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  priceCents: z.number().int().nonnegative(),
  billingInterval: MembershipBillingIntervalSchema,
  active: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  benefits: z.array(CustomerMembershipBenefitPublicSchema),
});
export type CustomerMembershipPlanPublic = z.infer<typeof CustomerMembershipPlanPublicSchema>;

export const CustomerMembershipPlanListResponseSchema = z.object({
  items: z.array(CustomerMembershipPlanPublicSchema),
});

export const CreateCustomerMembershipPlanRequestSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(5000).nullable().optional(),
  priceCents: z.number().int().nonnegative(),
  billingInterval: z.literal('MONTHLY'), // V1: Only MONTHLY supported
  active: z.boolean().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});
export type CreateCustomerMembershipPlanRequest = z.infer<
  typeof CreateCustomerMembershipPlanRequestSchema
>;

export const UpdateCustomerMembershipPlanRequestSchema = CreateCustomerMembershipPlanRequestSchema;
export type UpdateCustomerMembershipPlanRequest = z.infer<
  typeof UpdateCustomerMembershipPlanRequestSchema
>;

// Membership
export const CustomerMembershipStatusSchema = z.enum([
  'PENDING',
  'ACTIVE',
  'PAST_DUE',
  'PAUSED',
  'CANCELED',
  'EXPIRED',
]);
export type CustomerMembershipStatus = z.infer<typeof CustomerMembershipStatusSchema>;

export const CustomerMembershipPublicSchema = z.object({
  publicId: z.string().uuid(),
  customerPublicId: z.string().uuid(),
  planPublicId: z.string().uuid(),
  planName: z.string(),
  status: CustomerMembershipStatusSchema,
  startedAt: z.string().datetime().nullable(),
  currentPeriodStart: z.string().datetime().nullable(),
  currentPeriodEnd: z.string().datetime().nullable(),
  nextBillingAt: z.string().datetime().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CustomerMembershipPublic = z.infer<typeof CustomerMembershipPublicSchema>;

export const CreateCustomerMembershipRequestSchema = z.object({
  planPublicId: z.string().uuid(),
});
export type CreateCustomerMembershipRequest = z.infer<
  typeof CreateCustomerMembershipRequestSchema
>;

// Charge
export const CustomerMembershipChargeStatusSchema = z.enum([
  'PENDING',
  'PAID',
  'FAILED',
]);
export type CustomerMembershipChargeStatus = z.infer<
  typeof CustomerMembershipChargeStatusSchema
>;

export const CustomerMembershipChargePublicSchema = z.object({
  publicId: z.string().uuid(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  amountCents: z.number().int().nonnegative(),
  status: CustomerMembershipChargeStatusSchema,
  dueAt: z.string().datetime(),
  paidAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CustomerMembershipChargePublic = z.infer<
  typeof CustomerMembershipChargePublicSchema
>;

export const CustomerMembershipChargeListResponseSchema = z.object({
  items: z.array(CustomerMembershipChargePublicSchema),
});
