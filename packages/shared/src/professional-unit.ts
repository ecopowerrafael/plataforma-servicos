import { z } from 'zod';
export const UpsertProfessionalUnitRequestSchema = z
  .object({ unitPublicId: z.uuid(), active: z.boolean().default(true) })
  .strict();
export const ProfessionalUnitPublicSchema = z
  .object({
    publicId: z.uuid(),
    professionalPublicId: z.uuid(),
    unitPublicId: z.uuid(),
    active: z.boolean(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export const ProfessionalUnitsResponseSchema = z.object({
  items: z.array(ProfessionalUnitPublicSchema),
});
export const ProfessionalUnitStatusResponseSchema = z.object({ success: z.literal(true) });
export type UpsertProfessionalUnitRequest = z.infer<typeof UpsertProfessionalUnitRequestSchema>;
