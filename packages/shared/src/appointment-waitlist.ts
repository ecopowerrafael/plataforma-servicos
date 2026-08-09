import { z } from 'zod';

export const AppointmentWaitlistStatusSchema = z.enum([
  'WAITING',
  'MATCHED',
  'CONVERTED',
  'EXPIRED',
  'CANCELED',
]);
export const AppointmentWaitlistStatusValues = AppointmentWaitlistStatusSchema.options;
const date = z.iso.date();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const CreateAppointmentWaitlistRequestSchema = z
  .object({
    customerPublicId: z.uuid(),
    professionalPublicId: z.uuid().nullable().optional(),
    servicePublicId: z.uuid(),
    unitPublicId: z.uuid(),
    preferredDateFrom: date,
    preferredDateTo: date,
    preferredTimeStart: time,
    preferredTimeEnd: time,
    expiresAt: z.iso.datetime({ offset: true }),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.preferredDateTo < value.preferredDateFrom)
      context.addIssue({
        code: 'custom',
        path: ['preferredDateTo'],
        message: 'Data final deve ser posterior à inicial.',
      });
    if (value.preferredTimeEnd <= value.preferredTimeStart)
      context.addIssue({
        code: 'custom',
        path: ['preferredTimeEnd'],
        message: 'Horário final deve ser posterior ao inicial.',
      });
  });

export const AppointmentWaitlistFilterSchema = z
  .object({
    status: AppointmentWaitlistStatusSchema.optional(),
    customerPublicId: z.uuid().optional(),
    professionalPublicId: z.uuid().optional(),
    servicePublicId: z.uuid().optional(),
    unitPublicId: z.uuid().optional(),
  })
  .strict();
export const MatchAppointmentWaitlistRequestSchema = z
  .object({ startsAt: z.iso.datetime({ offset: true }) })
  .strict();
export const CancelAppointmentWaitlistRequestSchema = z
  .object({ reason: z.string().trim().min(2).max(500) })
  .strict();
export const ConvertAppointmentWaitlistRequestSchema = z
  .object({
    opportunityPublicId: z.uuid(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

export const AppointmentWaitlistPublicSchema = z.object({
  publicId: z.uuid(),
  customerPublicId: z.uuid(),
  customerName: z.string(),
  professionalPublicId: z.uuid().nullable(),
  professionalName: z.string().nullable(),
  servicePublicId: z.uuid(),
  serviceName: z.string(),
  unitPublicId: z.uuid(),
  unitName: z.string(),
  preferredDateFrom: date,
  preferredDateTo: date,
  preferredTimeStart: time,
  preferredTimeEnd: time,
  expiresAt: z.iso.datetime({ offset: true }),
  notes: z.string().nullable(),
  status: AppointmentWaitlistStatusSchema,
  matchedAt: z.iso.datetime({ offset: true }).nullable(),
  convertedAt: z.iso.datetime({ offset: true }).nullable(),
  canceledAt: z.iso.datetime({ offset: true }).nullable(),
  canceledReason: z.string().nullable(),
  opportunityPublicId: z.uuid().nullable(),
  opportunityStartsAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export const AppointmentWaitlistListResponseSchema = z.object({
  items: z.array(AppointmentWaitlistPublicSchema),
});
export type CreateAppointmentWaitlistRequest = z.infer<
  typeof CreateAppointmentWaitlistRequestSchema
>;
export type AppointmentWaitlistFilter = z.infer<typeof AppointmentWaitlistFilterSchema>;
export type ConvertAppointmentWaitlistRequest = z.infer<
  typeof ConvertAppointmentWaitlistRequestSchema
>;
