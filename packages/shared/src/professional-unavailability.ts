import { z } from 'zod';

const dateTime = z.iso.datetime({ offset: true });

export const ProfessionalUnavailabilityTypeSchema = z.enum([
  'BLOCK',
  'DAY_OFF',
  'VACATION',
  'SICK_LEAVE',
  'PERSONAL',
  'OTHER',
]);

export const ProfessionalUnavailabilityInputSchema = z
  .object({
    unitPublicId: z.uuid().nullable().optional(),
    type: ProfessionalUnavailabilityTypeSchema,
    title: z.string().trim().min(2).max(160),
    reason: z.string().trim().min(1).max(1000).nullable().optional(),
    startsAt: dateTime,
    endsAt: dateTime,
    allDay: z.boolean().default(false),
    repeatsWeekly: z.boolean().default(false),
    recurrenceEndsAt: dateTime.nullable().optional(),
    active: z.boolean().default(true),
  })
  .superRefine((value, context) => {
    if (new Date(value.startsAt) >= new Date(value.endsAt)) {
      context.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'O fim deve ser posterior ao in\u00edcio.',
      });
    }
    if (value.repeatsWeekly && value.recurrenceEndsAt === null) {
      context.addIssue({
        code: 'custom',
        path: ['recurrenceEndsAt'],
        message: 'Informe o fim da recorr\u00eancia.',
      });
    }
    if (
      !value.repeatsWeekly &&
      value.recurrenceEndsAt !== null &&
      value.recurrenceEndsAt !== undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['recurrenceEndsAt'],
        message: 'A recorr\u00eancia n\u00e3o est\u00e1 ativa.',
      });
    }
    if (value.recurrenceEndsAt !== null && value.recurrenceEndsAt !== undefined) {
      const start = new Date(value.startsAt);
      const end = new Date(value.recurrenceEndsAt);
      const max = new Date(start);
      max.setUTCDate(max.getUTCDate() + 366);
      if (end < start || end > max) {
        context.addIssue({
          code: 'custom',
          path: ['recurrenceEndsAt'],
          message: 'A recorr\u00eancia deve terminar em at\u00e9 366 dias.',
        });
      }
    }
  });

export const CreateProfessionalUnavailabilityRequestSchema =
  ProfessionalUnavailabilityInputSchema.safeExtend({
    professionalPublicIds: z.array(z.uuid()).min(1).max(100).optional(),
  }).strict();
export const UpdateProfessionalUnavailabilityRequestSchema =
  ProfessionalUnavailabilityInputSchema.strict();
export const SetProfessionalUnavailabilityStatusRequestSchema = z
  .object({ active: z.boolean() })
  .strict();
export const ProfessionalUnavailabilityListQuerySchema = z
  .object({
    from: dateTime.optional(),
    to: dateTime.optional(),
    type: ProfessionalUnavailabilityTypeSchema.optional(),
    active: z.coerce.boolean().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.from !== undefined &&
      value.to !== undefined &&
      new Date(value.from) > new Date(value.to)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'O per\u00edodo informado \u00e9 inv\u00e1lido.',
      });
    }
  });
export const ProfessionalUnavailabilitySchema = ProfessionalUnavailabilityInputSchema.safeExtend({
  publicId: z.uuid(),
  professionalPublicId: z.uuid(),
  unitPublicId: z.uuid().nullable(),
  createdAt: dateTime,
  updatedAt: dateTime,
});
export const ProfessionalUnavailabilityListResponseSchema = z.object({
  items: z.array(ProfessionalUnavailabilitySchema),
});

export type ProfessionalUnavailabilityType = z.infer<typeof ProfessionalUnavailabilityTypeSchema>;
