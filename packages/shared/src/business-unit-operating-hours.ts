import { z } from 'zod';

const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u);

const OperatingHoursPeriodInputSchema = z
  .object({
    weekday: z.coerce.number().int().min(0).max(6),
    startsAt: TimeSchema,
    endsAt: TimeSchema,
    active: z.boolean().default(true),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.endsAt <= value.startsAt)
      context.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'O horário final deve ser posterior ao inicial.',
      });
  });

export const ReplaceBusinessUnitOperatingHoursRequestSchema = z
  .object({ periods: z.array(OperatingHoursPeriodInputSchema).max(7 * 4) })
  .strict()
  .superRefine((value, context) => {
    const byWeekday = new Map<number, { startsAt: string; endsAt: string }[]>();
    for (const period of value.periods) {
      if (!period.active) continue;
      const list = byWeekday.get(period.weekday) ?? [];
      list.push(period);
      byWeekday.set(period.weekday, list);
    }
    for (const periods of byWeekday.values()) {
      const sorted = [...periods].sort((left, right) =>
        left.startsAt.localeCompare(right.startsAt),
      );
      for (let index = 1; index < sorted.length; index += 1) {
        const previous = sorted[index - 1];
        const current = sorted[index];
        if (previous !== undefined && current !== undefined && current.startsAt < previous.endsAt) {
          context.addIssue({
            code: 'custom',
            path: ['periods'],
            message: 'Há períodos sobrepostos no horário de funcionamento.',
          });
        }
      }
    }
  });

export const BusinessUnitOperatingHoursPeriodSchema = OperatingHoursPeriodInputSchema.safeExtend({
  publicId: z.uuid(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const BusinessUnitOperatingHoursResponseSchema = z.object({
  items: z.array(BusinessUnitOperatingHoursPeriodSchema),
});

export type ReplaceBusinessUnitOperatingHoursRequest = z.infer<
  typeof ReplaceBusinessUnitOperatingHoursRequestSchema
>;
