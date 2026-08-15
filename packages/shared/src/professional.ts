import { z } from 'zod';
const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/u);
export const CommissionTypeSchema = z.enum(['PERCENTAGE', 'FIXED']);
const input = {
  name: z.string().trim().min(2).max(120),
  publicName: z.string().trim().min(2).max(120),
  bio: z.string().trim().min(1).max(2000).nullable().optional(),
  phone: z.string().trim().min(3).max(32).nullable().optional(),
  email: z.email().trim().max(254).nullable().optional(),
  professionalDocument: z.string().trim().min(2).max(80).nullable().optional(),
  specialties: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  calendarColor: color,
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  active: z.boolean().default(true),
  primaryUnitPublicId: z.uuid().nullable().optional(),
  userPublicId: z.uuid().nullable().optional(),
  commissionType: CommissionTypeSchema.default('PERCENTAGE'),
  commissionValue: z.coerce.number().int().min(0).default(0),
  customFields: z.record(z.string().max(63), z.unknown()).default({}),
};
const commissionLimit = (
  v: { commissionType: 'PERCENTAGE' | 'FIXED'; commissionValue: number },
  c: z.RefinementCtx,
) => {
  if (v.commissionType === 'PERCENTAGE' && v.commissionValue > 100)
    c.addIssue({
      code: 'custom',
      path: ['commissionValue'],
      message: 'A comissão percentual não pode ultrapassar 100.',
    });
};
export const CreateProfessionalRequestSchema = z
  .object(input)
  .strict()
  .superRefine(commissionLimit);
export const UpdateProfessionalRequestSchema = z
  .object(input)
  .strict()
  .superRefine(commissionLimit);
export const UpdateMyProfessionalProfileRequestSchema = z
  .object({
    name: input.name,
    publicName: input.publicName,
    bio: input.bio,
    phone: input.phone,
  })
  .strict();
export const ProfessionalPublicSchema = z
  .object({
    publicId: z.uuid(),
    name: z.string(),
    publicName: z.string(),
    bio: z.string().nullable(),
    photoUrl: z
      .string()
      .regex(/^\/tenant\/professionals\/[0-9a-f-]{36}\/photo$/iu)
      .nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    professionalDocument: z.string().nullable(),
    specialties: z.array(z.string()),
    calendarColor: color,
    sortOrder: z.number().int(),
    active: z.boolean(),
    primaryUnitPublicId: z.uuid().nullable(),
    userPublicId: z.uuid().nullable(),
    commissionType: CommissionTypeSchema,
    commissionValue: z.number().int(),
    customFields: z.record(z.string(), z.unknown()),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export const ProfessionalListResponseSchema = z.object({
  items: z.array(ProfessionalPublicSchema),
  page: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});
export const ProfessionalStatusResponseSchema = z.object({ success: z.literal(true) });
export type CreateProfessionalRequest = z.infer<typeof CreateProfessionalRequestSchema>;
export type UpdateProfessionalRequest = z.infer<typeof UpdateProfessionalRequestSchema>;
export type UpdateMyProfessionalProfileRequest = z.infer<
  typeof UpdateMyProfessionalProfileRequestSchema
>;
