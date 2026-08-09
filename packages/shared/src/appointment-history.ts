import { z } from 'zod';

export const AppointmentHistoryActionSchema = z.enum([
  'CREATED',
  'STATUS_CHANGED',
  'RESCHEDULED',
  'CHECKED_IN',
]);
const AppointmentStatusSchema = z.enum([
  'PENDING',
  'CONFIRMED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELED',
  'NO_SHOW',
]);

export const AppointmentHistoryEntryPublicSchema = z
  .object({
    publicId: z.uuid(),
    action: AppointmentHistoryActionSchema,
    previousStatus: AppointmentStatusSchema.nullable(),
    newStatus: AppointmentStatusSchema.nullable(),
    previousStartsAt: z.iso.datetime({ offset: true }).nullable(),
    newStartsAt: z.iso.datetime({ offset: true }).nullable(),
    reason: z.string().nullable(),
    isFitIn: z.boolean(),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const AppointmentHistoryResponseSchema = z.object({
  items: z.array(AppointmentHistoryEntryPublicSchema),
});
