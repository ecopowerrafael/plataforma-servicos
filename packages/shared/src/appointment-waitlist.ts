import { z } from 'zod';

export const AppointmentWaitlistStatusSchema = z.enum([
  'WAITING',
  'MATCHED',
  'CONVERTED',
  'EXPIRED',
  'CANCELED',
]);

export const CreateAppointmentWaitlistRequestSchema = z
  .object({
    customerPublicId: z.uuid(),
    professionalPublicId: z.uuid(),
    servicePublicId: z.uuid(),
    unitPublicId: z.uuid().nullable().optional(),
    preferredStartsAt: z.iso.datetime({ offset: true }).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

export const MatchAppointmentWaitlistRequestSchema = z
  .object({
    preferredStartsAt: z.iso.datetime({ offset: true }).nullable().optional(),
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .strict();

export const CancelAppointmentWaitlistRequestSchema = z
  .object({
    reason: z.string().trim().min(2).max(500).optional(),
  })
  .strict();

export const AppointmentWaitlistPublicSchema = z.object({
  publicId: z.uuid(),
  customerPublicId: z.uuid(),
  professionalPublicId: z.uuid(),
  servicePublicId: z.uuid(),
  unitPublicId: z.uuid().nullable(),
  preferredStartsAt: z.iso.datetime({ offset: true }).nullable(),
  notes: z.string().nullable(),
  status: AppointmentWaitlistStatusSchema,
  matchedAt: z.iso.datetime({ offset: true }).nullable(),
  convertedAt: z.iso.datetime({ offset: true }).nullable(),
  canceledAt: z.iso.datetime({ offset: true }).nullable(),
  canceledReason: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const AppointmentWaitlistListResponseSchema = z.object({
  items: z.array(AppointmentWaitlistPublicSchema),
});

export type CreateAppointmentWaitlistRequest = z.infer<
  typeof CreateAppointmentWaitlistRequestSchema
>;
export type MatchAppointmentWaitlistRequest = z.infer<
  typeof MatchAppointmentWaitlistRequestSchema
>;
export type CancelAppointmentWaitlistRequest = z.infer<
  typeof CancelAppointmentWaitlistRequestSchema
>;
