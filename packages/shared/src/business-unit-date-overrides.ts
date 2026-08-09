import { z } from 'zod';

const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u);
const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);

export const BusinessUnitDateOverrideTypeSchema = z.enum(['EXCEPTION', 'HOLIDAY']);

const PeriodInputSchema = z
  .object({ startsAt: TimeSchema, endsAt: TimeSchema })
  .strict()
  .superRefine((value, context) => {
    if (value.endsAt <= value.startsAt)
      context.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'O horário final deve ser posterior ao inicial.',
      });
  });

export const ReplaceBusinessUnitDateOverrideRequestSchema = z
  .object({
    type: BusinessUnitDateOverrideTypeSchema,
    closed: z.boolean(),
    title: z.string().trim().min(1).max(160).nullable().optional(),
    periods: z.array(PeriodInputSchema).max(8).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.closed && value.periods.length > 0)
      context.addIssue({
        code: 'custom',
        path: ['periods'],
        message: 'Um dia fechado não pode ter períodos de horário especial.',
      });
    if (!value.closed && value.periods.length === 0)
      context.addIssue({
        code: 'custom',
        path: ['periods'],
        message: 'Informe ao menos um período quando o dia não estiver fechado.',
      });
    const sorted = [...value.periods].sort((left, right) =>
      left.startsAt.localeCompare(right.startsAt),
    );
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (previous !== undefined && current !== undefined && current.startsAt < previous.endsAt)
        context.addIssue({
          code: 'custom',
          path: ['periods'],
          message: 'Há períodos sobrepostos neste dia.',
        });
    }
  });

export const BusinessUnitDateOverrideDaySchema = z
  .object({
    date: DateSchema,
    type: BusinessUnitDateOverrideTypeSchema,
    closed: z.boolean(),
    title: z.string().nullable(),
    periods: z.array(z.object({ startsAt: TimeSchema, endsAt: TimeSchema }).strict()),
    active: z.boolean(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const BusinessUnitDateOverridesResponseSchema = z.object({
  items: z.array(BusinessUnitDateOverrideDaySchema),
});

export const BusinessUnitDateOverrideStatusResponseSchema = z.object({ success: z.literal(true) });

export type ReplaceBusinessUnitDateOverrideRequest = z.infer<
  typeof ReplaceBusinessUnitDateOverrideRequestSchema
>;
