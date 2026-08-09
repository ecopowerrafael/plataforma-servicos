import { z } from 'zod';

export const CreateAppointmentReviewRequestSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();

export const UpdateAppointmentReviewRequestSchema = CreateAppointmentReviewRequestSchema;

export const AppointmentReviewPublicSchema = z.object({
  publicId: z.uuid(),
  appointmentPublicId: z.uuid(),
  appointmentProtocol: z.string(),
  professionalPublicId: z.uuid(),
  professionalName: z.string(),
  servicePublicId: z.uuid(),
  serviceName: z.string(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const AppointmentReviewListResponseSchema = z.object({
  items: z.array(AppointmentReviewPublicSchema),
});

export type CreateAppointmentReviewRequest = z.infer<typeof CreateAppointmentReviewRequestSchema>;
export type UpdateAppointmentReviewRequest = z.infer<typeof UpdateAppointmentReviewRequestSchema>;
