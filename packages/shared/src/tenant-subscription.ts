import { z } from 'zod';

import {
  CommercialPlanPublicSchema,
  PlanLimitPublicSchema,
  SubscriptionPublicSchema,
} from './platform.js';
import { TenantCommercialStatusSchema } from './tenant-commercial.js';

export const TenantPlanLimitUsageSchema = PlanLimitPublicSchema.extend({
  usage: z.number().int().nonnegative().nullable(),
});

export const TenantSubscriptionResponseSchema = z.object({
  subscription: SubscriptionPublicSchema,
  plan: CommercialPlanPublicSchema.omit({ limits: true }),
  limits: z.array(TenantPlanLimitUsageSchema),
  commercial: TenantCommercialStatusSchema,
  scheduledChange: z.object({
    plan: CommercialPlanPublicSchema.omit({ limits: true }),
    billingCycle: z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL']),
    effectiveAt: z.string().datetime(),
  }).nullable(),
});

export const SubscriptionChangePreviewSchema = z.object({
  changeType: z.enum(['UPGRADE', 'DOWNGRADE']), effectiveAt: z.string().datetime().nullable(),
  currentPlan: z.object({ publicId: z.uuid(), name: z.string(), billingCycle: z.string(), priceCents: z.string(), currency: z.string() }),
  targetPlan: z.object({ publicId: z.uuid(), name: z.string(), billingCycle: z.string(), priceCents: z.string(), currency: z.string() }),
  gainedFeatures: z.array(z.object({ key: z.string(), label: z.string() })), lostFeatures: z.array(z.object({ key: z.string(), label: z.string() })),
  increasedLimits: z.array(z.object({ key: z.string(), label: z.string(), currentValue: z.string().nullable(), targetValue: z.string().nullable() })), reducedLimits: z.array(z.object({ key: z.string(), label: z.string(), currentValue: z.string().nullable(), targetValue: z.string().nullable() })),
  usageConflicts: z.array(z.object({ key: z.string(), label: z.string(), currentUsage: z.number(), targetLimit: z.number() })),
});
