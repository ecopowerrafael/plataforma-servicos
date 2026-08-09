import { z } from 'zod';

const DateSchema = z.iso.date();
const QuerySchema = z
  .object({
    date: DateSchema,
    professionalPublicId: z.uuid(),
    servicePublicId: z.uuid(),
    unitPublicId: z.uuid().optional(),
  })
  .strict();

export const AvailabilityQuerySchema = QuerySchema;
export const CalendarQuerySchema = z
  .object({
    from: DateSchema,
    to: DateSchema,
    professionalPublicId: z.uuid().optional(),
    servicePublicId: z.uuid().optional(),
    unitPublicId: z.uuid().optional(),
  })
  .strict()
  .refine((value) => value.from <= value.to, 'O período informado é inválido.');

export const AvailabilitySlotSchema = z
  .object({
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    state: z.enum(['AVAILABLE', 'UNAVAILABLE', 'BLOCKED']),
    reason: z.string().nullable(),
  })
  .strict();
export const AvailabilityResponseSchema = z
  .object({
    date: DateSchema,
    timezone: z.string(),
    intervalMinutes: z.number().int().positive(),
    blockedMinutes: z.number().int().positive(),
    slots: z.array(AvailabilitySlotSchema),
  })
  .strict();
export const CalendarDaySchema = z
  .object({ date: DateSchema, slots: z.array(AvailabilitySlotSchema) })
  .strict();
export const CalendarResponseSchema = z
  .object({ timezone: z.string(), days: z.array(CalendarDaySchema) })
  .strict();

export type AvailabilityQuery = z.infer<typeof AvailabilityQuerySchema>;
export type AvailabilityResponse = z.infer<typeof AvailabilityResponseSchema>;
