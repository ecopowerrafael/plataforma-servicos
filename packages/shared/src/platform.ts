import { z } from 'zod';

import { EmailSchema, UserPublicSchema } from './auth.js';
import { BusinessProfileCodeSchema } from './business-profile.js';
import { BusinessUnitSchema, CreateTenantRequestSchema, TenantPublicSchema } from './tenant.js';

export const PlatformPermissionCodeSchema = z.enum([
  'platform.dashboard.read',
  'platform.tenant.read',
  'platform.tenant.create',
  'platform.tenant.update',
  'platform.tenant.status.manage',
  'platform.plan.read',
  'platform.plan.create',
  'platform.plan.update',
  'platform.plan.status.manage',
  'platform.subscription.read',
  'platform.subscription.create',
  'platform.subscription.update',
  'platform.subscription.status.manage',
  'platform.audit.read',
  'platform.metrics.read',
  'platform.commercial_policy.read',
  'platform.commercial_policy.manage',
]);

export const PlatformAdministratorStatusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'INACTIVE']);
export const CommercialPlanStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']);
export const BillingCycleSchema = z.enum([
  'MONTHLY',
  'QUARTERLY',
  'SEMIANNUAL',
  'ANNUAL',
  'CUSTOM',
]);
export const SubscriptionStatusSchema = z.enum([
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'SUSPENDED',
  'CANCELED',
  'EXPIRED',
]);
export const PublicSiteBehaviorSchema = z.enum(['NORMAL', 'HIDE_BOOKING', 'OFFLINE']);
export const SubscriptionActionSchema = z.enum([
  'CREATED',
  'TRIAL_STARTED',
  'TRIAL_EXTENDED',
  'ACTIVATED',
  'PLAN_CHANGED',
  'SUSPENDED',
  'REACTIVATED',
  'CANCELED',
  'EXPIRED',
  'PRICE_ADJUSTED',
  'PERIOD_ADJUSTED',
]);
export const PlanLimitKeys = [
  'units.max',
  'members.max',
  'professionals.max',
  'services.max',
  'monthly_appointments.max',
  'custom_domain.enabled',
] as const;
export const PlanLimitKeySchema = z.enum(PlanLimitKeys);
export const PlanLimitCatalog = {
  'units.max': { valueType: 'INTEGER', allowsUnlimited: true },
  'members.max': { valueType: 'INTEGER', allowsUnlimited: true },
  'professionals.max': { valueType: 'INTEGER', allowsUnlimited: true },
  'services.max': { valueType: 'INTEGER', allowsUnlimited: true },
  'monthly_appointments.max': { valueType: 'INTEGER', allowsUnlimited: true },
  'custom_domain.enabled': { valueType: 'BOOLEAN', allowsUnlimited: false },
} as const satisfies Record<
  (typeof PlanLimitKeys)[number],
  {
    valueType: 'INTEGER' | 'BOOLEAN';
    allowsUnlimited: boolean;
  }
>;

export const PaginationQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export const PaginationMetaSchema = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1).max(100),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

const MoneyInputSchema = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const MoneyPublicSchema = z.string().regex(/^\d+$/u);
const IsoDateSchema = z.iso.datetime({ offset: true });
const CurrencySchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{3}$/u);

export const PlatformAdministratorPublicSchema = z.object({
  publicId: z.uuid(),
  status: PlatformAdministratorStatusSchema,
  user: UserPublicSchema,
  permissions: z.array(PlatformPermissionCodeSchema),
  lastAccessAt: IsoDateSchema.nullable(),
});
export const PlatformMeResponseSchema = z.object({
  administrator: PlatformAdministratorPublicSchema,
});

export const PlanLimitInputSchema = z
  .object({
    key: PlanLimitKeySchema,
    valueType: z.enum(['INTEGER', 'BOOLEAN', 'STRING']),
    integerValue: z.coerce
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .nullable()
      .optional(),
    booleanValue: z.boolean().nullable().optional(),
    stringValue: z.string().trim().min(1).max(255).nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const definition = PlanLimitCatalog[value.key];
    if (value.valueType !== definition.valueType) {
      context.addIssue({ code: 'custom', message: 'O tipo não corresponde à chave do limite.' });
      return;
    }
    const suppliedValues = [
      value.integerValue !== undefined,
      value.booleanValue !== undefined,
      value.stringValue !== undefined,
    ].filter(Boolean).length;
    if (suppliedValues !== 1) {
      context.addIssue({ code: 'custom', message: 'Informe exatamente um valor para o limite.' });
      return;
    }
    if (value.valueType === 'INTEGER') {
      if (value.integerValue === null && !definition.allowsUnlimited)
        context.addIssue({ code: 'custom', message: 'Este limite não aceita valor ilimitado.' });
      return;
    }
    if (value.booleanValue === null)
      context.addIssue({ code: 'custom', message: 'O limite booleano não aceita valor nulo.' });
  });

export const PlanLimitPublicSchema = z.object({
  key: PlanLimitKeySchema,
  valueType: z.enum(['INTEGER', 'BOOLEAN', 'STRING']),
  integerValue: z.string().regex(/^\d+$/u).nullable(),
  booleanValue: z.boolean().nullable(),
  stringValue: z.string().nullable(),
});
export const PlanBenefitPublicSchema = z.object({
  publicId: z.uuid(),
  text: z.string(),
  sortOrder: z.number().int(),
  enabled: z.boolean(),
});
export const PlanBillingOptionPublicSchema = z.object({
  publicId: z.uuid(),
  billingCycle: z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL']),
  priceCents: MoneyPublicSchema,
  active: z.boolean(),
  sortOrder: z.number().int(),
  recommended: z.boolean(),
});
export const PlanBillingOptionInputSchema = z.object({
  billingCycle: z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL']),
  priceCents: MoneyInputSchema,
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(100).default(0),
  recommended: z.boolean().default(false),
});
export const CommercialPlanPublicSchema = z.object({
  publicId: z.uuid(),
  code: z.string().regex(/^(?:[A-Z][A-Z0-9_]{1,63}|[a-z0-9]+(?:-[a-z0-9]+)*)$/u),
  name: z.string(),
  subtitle: z.string().nullable(),
  shortDescription: z.string().nullable(),
  description: z.string().nullable(),
  status: CommercialPlanStatusSchema,
  billingCycle: BillingCycleSchema,
  priceCents: MoneyPublicSchema,
  monthlyPriceCents: MoneyPublicSchema.nullable().default(null),
  annualPriceCents: MoneyPublicSchema.nullable().default(null),
  billingOptions: z.array(PlanBillingOptionPublicSchema).default([]),
  currency: CurrencySchema,
  trialDays: z.number().int().nonnegative().max(3650).nullable(),
  isPublic: z.boolean(),
  highlighted: z.boolean(),
  badge: z.string().nullable(),
  ctaText: z.string().nullable(),
  sortOrder: z.number().int(),
  limits: z.array(PlanLimitPublicSchema),
  benefits: z.array(PlanBenefitPublicSchema),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
const CommercialPlanRequestObjectSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^(?:[A-Z][A-Z0-9_]{1,63}|[a-z0-9]+(?:-[a-z0-9]+)*)$/u),
    name: z.string().trim().min(2).max(120),
    subtitle: z.string().trim().min(1).max(160).nullable().optional(),
    shortDescription: z.string().trim().min(1).max(240).nullable().optional(),
    description: z.string().trim().min(1).max(500).nullable().optional(),
    billingCycle: BillingCycleSchema,
    priceCents: MoneyInputSchema,
    monthlyPriceCents: MoneyInputSchema.nullable().optional(),
    annualPriceCents: MoneyInputSchema.nullable().optional(),
    billingOptions: z.array(PlanBillingOptionInputSchema).max(4).default([]),
    currency: CurrencySchema.default('BRL'),
    trialDays: z.coerce.number().int().min(0).max(3650).nullable().optional(),
    isPublic: z.boolean().default(false),
    highlighted: z.boolean().default(false),
    badge: z.string().trim().min(1).max(40).nullable().optional(),
    ctaText: z.string().trim().min(1).max(60).nullable().optional(),
    sortOrder: z.coerce.number().int().min(0).max(10_000).default(0),
    limits: z.array(PlanLimitInputSchema).max(9).default([]),
  })
  .strict();
function validateDistinctPlanLimitKeys(
  value: { limits?: readonly { key: string }[] | undefined },
  context: z.RefinementCtx,
): void {
  if (value.limits === undefined) return;
  const keys = value.limits.map(({ key }) => key);
  if (new Set(keys).size !== keys.length)
    context.addIssue({
      code: 'custom',
      path: ['limits'],
      message: 'Um limite não pode repetir a mesma chave.',
    });
}
export const CreateCommercialPlanRequestSchema = CommercialPlanRequestObjectSchema.superRefine(
  validateDistinctPlanLimitKeys,
);
export const UpdateCommercialPlanRequestSchema = CommercialPlanRequestObjectSchema.partial()
  .omit({ code: true })
  .extend({
    code: z
      .string()
      .trim()
      .regex(/^(?:[A-Z][A-Z0-9_]{1,63}|[a-z0-9]+(?:-[a-z0-9]+)*)$/u)
      .optional(),
  })
  .strict()
  .superRefine(validateDistinctPlanLimitKeys);
export const PlanListQuerySchema = PaginationQuerySchema.extend({
  status: CommercialPlanStatusSchema.optional(),
  billingCycle: BillingCycleSchema.optional(),
  isPublic: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  orderBy: z.enum(['createdAt', 'name', 'status']).default('createdAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
}).strict();
export const PlanListResponseSchema = z.object({
  items: z.array(CommercialPlanPublicSchema),
  page: PaginationMetaSchema,
});

export const PublicCommercialPlansResponseSchema = z.object({
  plans: z.array(CommercialPlanPublicSchema),
  defaultTrialDays: z.number().int().nonnegative().max(3650),
});

export const CreatePlanBenefitRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(160),
    sortOrder: z.coerce.number().int().min(0).max(10_000).default(0),
    enabled: z.boolean().default(true),
  })
  .strict();
export const UpdatePlanBenefitRequestSchema = CreatePlanBenefitRequestSchema.partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Informe ao menos uma alteração.');
export const PlanBenefitResponseSchema = z.object({ benefit: PlanBenefitPublicSchema });
export const PlanBenefitListResponseSchema = z.object({
  items: z.array(PlanBenefitPublicSchema),
});

export const SubscriptionPublicSchema = z.object({
  publicId: z.uuid(),
  tenantPublicId: z.uuid(),
  plan: CommercialPlanPublicSchema.pick({ publicId: true, code: true, name: true, status: true }),
  status: SubscriptionStatusSchema,
  startsAt: IsoDateSchema,
  trialEndsAt: IsoDateSchema.nullable(),
  currentPeriodStartsAt: IsoDateSchema,
  currentPeriodEndsAt: IsoDateSchema,
  canceledAt: IsoDateSchema.nullable(),
  suspendedAt: IsoDateSchema.nullable(),
  endsAt: IsoDateSchema.nullable(),
  priceCents: MoneyPublicSchema,
  currency: CurrencySchema,
  billingCycle: BillingCycleSchema,
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export const SubscriptionHistoryPublicSchema = z.object({
  publicId: z.uuid(),
  action: SubscriptionActionSchema,
  previousStatus: SubscriptionStatusSchema.nullable(),
  newStatus: SubscriptionStatusSchema.nullable(),
  reason: z.string().nullable(),
  performedBy: UserPublicSchema.nullable(),
  createdAt: IsoDateSchema,
});
export const CreateSubscriptionRequestSchema = z
  .object({
    planPublicId: z.uuid(),
    billingCycle: BillingCycleSchema.optional(),
    startsAt: IsoDateSchema.optional(),
    currentPeriodEndsAt: IsoDateSchema.optional(),
    trial: z.boolean().default(false),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
export const UpdateSubscriptionRequestSchema = z
  .object({
    currentPeriodEndsAt: IsoDateSchema.optional(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
export const SubscriptionActionRequestSchema = z
  .object({ reason: z.string().trim().min(3).max(500) })
  .strict();
export const ExtendTrialRequestSchema = z
  .object({ trialEndsAt: IsoDateSchema, reason: z.string().trim().min(3).max(500) })
  .strict();
export const ChangePlanRequestSchema = z
  .object({ planPublicId: z.uuid(), billingCycle: BillingCycleSchema.optional(), reason: z.string().trim().min(3).max(500) })
  .strict();
export const SubscriptionListQuerySchema = PaginationQuerySchema.extend({
  status: SubscriptionStatusSchema.optional(),
  planPublicId: z.uuid().optional(),
  tenantPublicId: z.uuid().optional(),
  orderBy: z.enum(['createdAt', 'currentPeriodEndsAt', 'trialEndsAt']).default('createdAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
}).strict();
export const SubscriptionListResponseSchema = z.object({
  items: z.array(SubscriptionPublicSchema),
  page: PaginationMetaSchema,
});
export const SubscriptionDetailResponseSchema = z.object({
  subscription: SubscriptionPublicSchema,
  history: z.array(SubscriptionHistoryPublicSchema),
  historyPage: PaginationMetaSchema,
});

export const PlatformTenantSummarySchema = z.object({
  publicId: z.uuid(),
  displayName: z.string(),
  slug: z.string(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'INACTIVE', 'PENDING']),
  subscription: SubscriptionPublicSchema.pick({
    publicId: true,
    status: true,
    trialEndsAt: true,
    currentPeriodEndsAt: true,
    plan: true,
  }).nullable(),
  unitCount: z.number().int().nonnegative(),
  memberCount: z.number().int().nonnegative(),
  createdAt: IsoDateSchema,
});
export const PlatformTenantListQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'INACTIVE', 'PENDING']).optional(),
  planPublicId: z.uuid().optional(),
  subscriptionStatus: SubscriptionStatusSchema.optional(),
  search: z.string().trim().min(1).max(120).optional(),
  trialActive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  subscriptionExpired: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  orderBy: z
    .enum(['createdAt', 'name', 'status', 'currentPeriodEndsAt', 'trialEndsAt'])
    .default('createdAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
}).strict();
export const PlatformTenantListResponseSchema = z.object({
  items: z.array(PlatformTenantSummarySchema),
  page: PaginationMetaSchema,
});
export const PlatformTenantDetailResponseSchema = z.object({
  tenant: TenantPublicSchema.extend({ legalName: z.string() }),
  settings: z.object({
    allowMultipleUnits: z.boolean(),
    defaultAppointmentIntervalMinutes: z.number(),
    weekStartsOn: z.enum(['SUNDAY', 'MONDAY']),
    dateFormat: z.string(),
    timeFormat: z.enum(['24H', '12H']),
  }),
  units: z.array(BusinessUnitSchema),
  owner: UserPublicSchema.nullable(),
  subscription: SubscriptionPublicSchema.nullable(),
  subscriptionHistory: z.array(SubscriptionHistoryPublicSchema),
  audit: z.array(
    z.object({
      publicId: z.uuid(),
      action: z.string(),
      targetType: z.string(),
      createdAt: IsoDateSchema,
    }),
  ),
  counts: z.object({ units: z.number().int(), members: z.number().int() }),
});
export const UpdatePlatformTenantRequestSchema = z
  .object({
    legalName: z.string().trim().min(2).max(160).optional(),
    displayName: z.string().trim().min(2).max(120).optional(),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
      .min(2)
      .max(63)
      .optional(),
    timezone: z.string().trim().min(3).max(64).optional(),
    locale: z.string().trim().min(2).max(16).optional(),
    currency: CurrencySchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Informe ao menos uma alteração.');
export const TenantStatusActionRequestSchema = z
  .object({ reason: z.string().trim().min(3).max(500), confirm: z.literal(true).optional() })
  .strict();
export const CreatePlatformTenantRequestSchema = CreateTenantRequestSchema.extend({
  businessProfile: BusinessProfileCodeSchema,
  ownerEmail: EmailSchema,
  planPublicId: z.uuid(),
  trial: z.boolean().default(false),
  startsAt: IsoDateSchema.optional(),
}).strict();

export const DashboardQuerySchema = z
  .object({ period: z.enum(['7d', '30d', '90d', '12m']).default('30d') })
  .strict();
export const PlatformDashboardResponseSchema = z.object({
  period: z.enum(['7d', '30d', '90d', '12m']),
  counts: z.object({
    tenants: z.number().int().nonnegative(),
    activeTenants: z.number().int().nonnegative(),
    suspendedTenants: z.number().int().nonnegative(),
    pendingTenants: z.number().int().nonnegative(),
    tenantsCreated: z.number().int().nonnegative(),
    users: z.number().int().nonnegative(),
    activeMembers: z.number().int().nonnegative(),
    units: z.number().int().nonnegative(),
    trialingSubscriptions: z.number().int().nonnegative(),
    activeSubscriptions: z.number().int().nonnegative(),
    pastDueSubscriptions: z.number().int().nonnegative(),
    suspendedSubscriptions: z.number().int().nonnegative(),
    canceledSubscriptions: z.number().int().nonnegative(),
    expiredSubscriptions: z.number().int().nonnegative(),
  }),
  estimatedRevenue: z.object({
    mrrCents: MoneyPublicSchema,
    arrCents: MoneyPublicSchema,
    currency: CurrencySchema,
    disclaimer: z.literal('Valores contratuais estimados; não representam recebimentos.'),
  }),
  byPlan: z.array(
    z.object({
      planPublicId: z.uuid(),
      planName: z.string(),
      subscriptions: z.number().int().nonnegative(),
      estimatedMonthlyCents: MoneyPublicSchema,
    }),
  ),
  recentTenants: z.array(PlatformTenantSummarySchema),
  recentAudit: z.array(
    z.object({
      publicId: z.uuid(),
      action: z.string(),
      targetType: z.string(),
      createdAt: IsoDateSchema,
    }),
  ),
});
export const PlatformAuditQuerySchema = PaginationQuerySchema.extend({
  action: z.string().trim().min(1).max(100).optional(),
  userPublicId: z.uuid().optional(),
  tenantPublicId: z.uuid().optional(),
  targetType: z.string().trim().min(1).max(80).optional(),
  from: IsoDateSchema.optional(),
  to: IsoDateSchema.optional(),
  direction: z.enum(['asc', 'desc']).default('desc'),
}).strict();
export const PlatformAuditResponseSchema = z.object({
  items: z.array(
    z.object({
      publicId: z.uuid(),
      action: z.string(),
      targetType: z.string(),
      targetPublicId: z.uuid().nullable(),
      tenantPublicId: z.uuid().nullable(),
      user: UserPublicSchema.nullable(),
      createdAt: IsoDateSchema,
    }),
  ),
  page: PaginationMetaSchema,
});

export type PlatformPermissionCode = z.infer<typeof PlatformPermissionCodeSchema>;
export type CreateCommercialPlanRequest = z.infer<typeof CreateCommercialPlanRequestSchema>;
export type UpdateCommercialPlanRequest = z.infer<typeof UpdateCommercialPlanRequestSchema>;
export type CreateSubscriptionRequest = z.infer<typeof CreateSubscriptionRequestSchema>;
export type CreatePlanBenefitRequest = z.infer<typeof CreatePlanBenefitRequestSchema>;
export type UpdatePlanBenefitRequest = z.infer<typeof UpdatePlanBenefitRequestSchema>;
