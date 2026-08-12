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
export const CustomerListItemSchema = CustomerPublicSchema.extend({
  lastCompletedAt: z.iso.datetime({ offset: true }).nullable(),
  nextAppointmentAt: z.iso.datetime({ offset: true }).nullable(),
  appointmentCount: z.number().int().nonnegative(),
}).strict();
export const CustomerListResponseSchema = z.object({
  items: z.array(CustomerListItemSchema),
  page: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
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
  financial: z.object({
    paidTotalCents: z.string(),
    paidCount: z.number().int().nonnegative(),
    recentPayments: z.array(
      z.object({
        publicId: z.uuid(),
        amountCents: z.string(),
        kind: z.enum(['PAYMENT', 'DEPOSIT']),
        createdAt: z.iso.datetime({ offset: true }),
        appointmentPublicId: z.uuid(),
      }),
    ),
  }),
});
export const CustomerStatusResponseSchema = z.object({ success: z.literal(true) });
export type CreateCustomerRequest = z.infer<typeof CreateCustomerRequestSchema>;
export type UpdateCustomerRequest = z.infer<typeof UpdateCustomerRequestSchema>;
