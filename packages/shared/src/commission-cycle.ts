import { z } from 'zod';

export const CommissionCycleAllocationSchema = z.object({
  allocationPublicId: z.uuid().nullable(),
  professionalPublicId: z.uuid(),
  professionalName: z.string().min(1),
  points: z.number().int().nonnegative(),
  amountCents: z.string().regex(/^\d+$/u),
});

export const CommissionCycleSchema = z.object({
  publicId: z.uuid(),
  periodStart: z.string().datetime({ offset: true }),
  periodEnd: z.string().datetime({ offset: true }),
  status: z.enum(['OPEN', 'CLOSED']),
  readyToClose: z.boolean(),
  closingDay: z.number().int().min(1).max(31),
  teamPercentBps: z.number().int().min(0).max(10000),
  effectiveFrom: z.string().datetime({ offset: true }).nullable(),
  eligibleRevenueCents: z.string().regex(/^\d+$/u),
  poolCents: z.string().regex(/^\d+$/u),
  totalPoints: z.number().int().nonnegative(),
  distributedCents: z.string().regex(/^\d+$/u),
  allocations: z.array(CommissionCycleAllocationSchema),
  closedAt: z.string().datetime({ offset: true }).nullable(),
});

export const CommissionCycleListResponseSchema = z.object({
  items: z.array(CommissionCycleSchema),
});

export type CommissionCycle = z.infer<typeof CommissionCycleSchema>;
export type CommissionCycleListResponse = z.infer<typeof CommissionCycleListResponseSchema>;

export const ProfessionalCommissionCycleSchema = z.object({
  publicId: z.uuid(),
  periodStart: z.string().datetime({ offset: true }),
  periodEnd: z.string().datetime({ offset: true }),
  status: z.enum(['OPEN', 'CLOSED']),
  readyToClose: z.boolean(),
  myPoints: z.number().int().nonnegative(),
  totalPoints: z.number().int().nonnegative(),
  myShareBps: z.number().int().nonnegative().max(10000),
  poolCents: z.string().regex(/^\d+$/u),
  myEstimatedAmountCents: z.string().regex(/^\d+$/u),
  myFinalAmountCents: z.string().regex(/^\d+$/u).nullable(),
  closedAt: z.string().datetime({ offset: true }).nullable(),
});

export const ProfessionalCommissionCycleListResponseSchema = z.object({
  items: z.array(ProfessionalCommissionCycleSchema),
});

export type ProfessionalCommissionCycle = z.infer<typeof ProfessionalCommissionCycleSchema>;
export type ProfessionalCommissionCycleListResponse = z.infer<typeof ProfessionalCommissionCycleListResponseSchema>;
