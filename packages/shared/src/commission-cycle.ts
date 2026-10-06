import { z } from 'zod';

export const CommissionCycleAllocationSchema = z.object({
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
