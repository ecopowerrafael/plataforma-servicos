import { z } from 'zod';

const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u);

export const ProfessionalSchedulePeriodInputSchema = z
  .object({
    weekday: z.coerce.number().int().min(0).max(6),
    startsAt: TimeSchema,
    endsAt: TimeSchema,
    unitPublicId: z.uuid().nullable().optional(),
    active: z.boolean().default(true),
  })
  .superRefine((value, context) => {
    if (value.endsAt <= value.startsAt) {
      context.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'O hor\u00e1rio final deve ser posterior ao inicial.',
      });
    }
  });

export const ProfessionalSchedulePeriodSchema = ProfessionalSchedulePeriodInputSchema.extend({
  publicId: z.uuid(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const UpsertProfessionalScheduleRequestSchema = z
  .object({
    periods: z.array(ProfessionalSchedulePeriodInputSchema).min(1),
    copyToWeekdays: z.array(z.coerce.number().int().min(0).max(6)).max(6).optional(),
    professionalPublicIds: z.array(z.uuid()).min(1).optional(),
  })
  .strict();

export const UpdateProfessionalSchedulePeriodRequestSchema =
  ProfessionalSchedulePeriodInputSchema.strict();

export const SetProfessionalSchedulePeriodStatusRequestSchema = z
  .object({ active: z.boolean() })
  .strict();

export const ProfessionalScheduleResponseSchema = z.object({
  items: z.array(ProfessionalSchedulePeriodSchema),
  weeklyMinutes: z.number().int(),
});
