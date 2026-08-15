import { z } from 'zod';

export const phone = z.string().trim().min(3).max(32);
export const nullable = <T extends z.ZodType>(schema: T) => schema.nullable().optional();
const input = {
  name: z.string().trim().min(2).max(120),
  socialName: nullable(z.string().trim().min(2).max(120)),
  phone: nullable(phone),
  whatsapp: nullable(phone),
  email: nullable(z.email().trim().max(254)),
  birthDate: nullable(z.iso.date()),
  document: nullable(z.string().trim().min(2).max(80)),
  notes: nullable(z.string().trim().min(1).max(2000)),
  source: z.string().trim().min(2).max(64).default('MANUAL'),
  acceptsCommunications: z.boolean().default(false),
  primaryUnitPublicId: z.uuid().nullable().optional(),
  customFields: z.record(z.string().max(63), z.unknown()).default({}),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
};
export const CreateCustomerRequestSchema = z.object(input).strict();
export const UpdateCustomerRequestSchema = z.object(input).strict();
export const CustomerPublicSchema = z
  .object({
    publicId: z.uuid(),
    name: z.string(),
    socialName: z.string().nullable(),
    phone: z.string().nullable(),
    whatsapp: z.string().nullable(),
    email: z.string().nullable(),
    birthDate: z.iso.date().nullable(),
    document: z.string().nullable(),
    notes: z.string().nullable(),
    source: z.string(),
    acceptsCommunications: z.boolean(),
    primaryUnitPublicId: z.uuid().nullable(),
    customFields: z.record(z.string(), z.unknown()),
    status: z.enum(['ACTIVE', 'INACTIVE']),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
const CustomerAppointmentStatusSchema = z.enum([
  'PENDING',
  'CONFIRMED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELED',
  'NO_SHOW',
]);
/** Segmentos de relacionamento derivados dos dados reais — nada é persistido. */
export const CustomerSegmentSchema = z.enum([
  'NEW',
  'RECURRING',
  'SCHEDULED',
  'NO_RETURN',
  'INACTIVE',
]);
export const CustomerListItemSchema = CustomerPublicSchema.extend({
  lastCompletedAt: z.iso.datetime({ offset: true }).nullable(),
  nextAppointmentAt: z.iso.datetime({ offset: true }).nullable(),
  appointmentCount: z.number().int().nonnegative(),
  segments: z.array(CustomerSegmentSchema).default([]),
  /* Financeiro só é preenchido com permissão de leitura de pagamentos. */
  paidTotalCents: z.string().regex(/^\d+$/u).nullable().default(null),
  averageTicketCents: z.string().regex(/^\d+$/u).nullable().default(null),
  lastServiceName: z.string().nullable().default(null),
  lastProfessionalName: z.string().nullable().default(null),
  nextServiceName: z.string().nullable().default(null),
}).strict();
export const CustomerCrmMetricsSchema = z.object({
  active: z.number().int().nonnegative(),
  scheduled: z.number().int().nonnegative(),
  new: z.number().int().nonnegative(),
  noReturn: z.number().int().nonnegative(),
  recurring: z.number().int().nonnegative(),
});
export const CustomerListResponseSchema = z.object({
  items: z.array(CustomerListItemSchema),
  page: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
  /* Indicadores da base inteira, independentes da paginação. */
  metrics: CustomerCrmMetricsSchema.optional(),
});
export const CustomerCrmAppointmentSchema = z.object({
  publicId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
  priceCents: z.string().regex(/^\d+$/u),
  status: CustomerAppointmentStatusSchema,
  professionalPublicId: z.uuid(),
  professionalName: z.string(),
  servicePublicId: z.uuid(),
  serviceName: z.string(),
  unitPublicId: z.uuid().nullable(),
  unitName: z.string().nullable(),
});
const CustomerCrmRankingSchema = z.object({
  publicId: z.uuid(),
  name: z.string(),
  count: z.number().int().positive(),
});
export const CustomerCrmTimelineEntrySchema = z.object({
  kind: z.enum([
    'APPOINTMENT_CREATED',
    'APPOINTMENT_STATUS',
    'APPOINTMENT_RESCHEDULED',
    'CHECK_IN',
    'PAYMENT',
    'REVIEW',
    'LOYALTY',
  ]),
  at: z.iso.datetime({ offset: true }),
  title: z.string(),
  description: z.string().nullable(),
  appointmentPublicId: z.uuid().nullable(),
  amountCents: z.string().regex(/^\d+$/u).nullable(),
});
export const CustomerCrmReviewSchema = z.object({
  publicId: z.uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  serviceName: z.string(),
  professionalName: z.string(),
});
export const CustomerCrmRelationshipStatusSchema = z.object({
  segments: z.array(CustomerSegmentSchema),
  daysSinceLastVisit: z.number().int().nonnegative().nullable(),
  averageIntervalDays: z.number().int().positive().nullable(),
  /* Janelas configuradas no módulo de Recuperação; nulo quando a regra não existe. */
  noReturnAfterDays: z.number().int().positive().nullable(),
  inactiveAfterDays: z.number().int().positive().nullable(),
  recoveryEligible: z.boolean(),
});
export const CustomerCrmWhatsAppSchema = z.object({
  lastInboundAt: z.iso.datetime({ offset: true }),
  lastOutboundAt: z.iso.datetime({ offset: true }).nullable(),
  status: z.string(),
});
export const CustomerCrmProfileSchema = z.object({
  customer: CustomerPublicSchema,
  appointments: z.array(CustomerCrmAppointmentSchema),
  summary: z.object({
    completedCount: z.number().int().nonnegative(),
    canceledCount: z.number().int().nonnegative(),
    noShowCount: z.number().int().nonnegative(),
    nextAppointment: CustomerCrmAppointmentSchema.nullable(),
    lastCompleted: CustomerCrmAppointmentSchema.nullable(),
    recurringServices: z.array(CustomerCrmRankingSchema),
    recurringProfessionals: z.array(CustomerCrmRankingSchema),
  }),
  relationship: z.object({
    loyaltyBalances: z.array(
      z.object({ type: z.enum(['POINTS', 'CASHBACK']), balance: z.string() }),
    ),
    usedCoupons: z.array(z.object({ code: z.string(), usedAt: z.iso.datetime({ offset: true }) })),
    waitlist: z.array(
      z.object({
        publicId: z.uuid(),
        serviceName: z.string(),
        professionalName: z.string().nullable(),
        unitName: z.string(),
        preferredDateFrom: z.iso.date(),
        preferredDateTo: z.iso.date(),
        preferredTimeStart: z.string(),
        preferredTimeEnd: z.string(),
        status: z.enum(['WAITING', 'MATCHED']),
      }),
    ),
  }),
  /* Nulo sem permissão de leitura de pagamentos. */
  financial: z
    .object({
      paidTotalCents: z.string(),
      paidCount: z.number().int().nonnegative(),
      averageTicketCents: z.string(),
      recentPayments: z.array(
        z.object({
          publicId: z.uuid(),
          amountCents: z.string(),
          kind: z.enum(['PAYMENT', 'DEPOSIT']),
          createdAt: z.iso.datetime({ offset: true }),
          appointmentPublicId: z.uuid(),
        }),
      ),
    })
    .nullable(),
  reviews: z.array(CustomerCrmReviewSchema).default([]),
  timeline: z.array(CustomerCrmTimelineEntrySchema).default([]),
  relationshipStatus: CustomerCrmRelationshipStatusSchema,
  whatsapp: CustomerCrmWhatsAppSchema.nullable().default(null),
});
export const CustomerStatusResponseSchema = z.object({ success: z.literal(true) });
export type CreateCustomerRequest = z.infer<typeof CreateCustomerRequestSchema>;
export type UpdateCustomerRequest = z.infer<typeof UpdateCustomerRequestSchema>;
