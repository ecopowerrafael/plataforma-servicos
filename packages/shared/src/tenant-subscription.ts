import { z } from 'zod';

import {
  CommercialPlanPublicSchema,
  PlanLimitPublicSchema,
  SubscriptionPublicSchema,
} from './platform.js';

export const TenantPlanLimitUsageSchema = PlanLimitPublicSchema.extend({
  usage: z.number().int().nonnegative().nullable(),
});

export const TenantSubscriptionResponseSchema = z.object({
  subscription: SubscriptionPublicSchema,
  plan: CommercialPlanPublicSchema.omit({ limits: true }),
  limits: z.array(TenantPlanLimitUsageSchema),
});
