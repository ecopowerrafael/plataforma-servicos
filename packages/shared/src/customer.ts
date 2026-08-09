import { z } from 'zod';

export const phone = z.string().trim().min(3).max(32);
export const nullable = <T extends z.ZodType>(schema: T) => schema.nullable().optional();
const input = {
  name: z.string().trim().min(2).max(120),
  socialName: nullable(z.string().trim().min(2).max(120)),
  phone: nullable(phone),
  whatsapp: nullable(phone),
  email: nullable(z.email().trim().max(254)),
  birthDate: nullable(z.iso.date()),
  document: nullable(z.string().trim().min(2).max(80)),
  notes: nullable(z.string().trim().min(1).max(2000)),
  source: z.string().trim().min(2).max(64).default('MANUAL'),
  acceptsCommunications: z.boolean().default(false),
  primaryUnitPublicId: z.uuid().nullable().optional(),
  customFields: z.record(z.string().max(63), z.unknown()).default({}),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
};
export const CreateCustomerRequestSchema = z.object(input).strict();
export const UpdateCustomerRequestSchema = z.object(input).strict();
export const CustomerPublicSchema = z
  .object({
    publicId: z.uuid(),
    name: z.string(),
    socialName: z.string().nullable(),
    phone: z.string().nullable(),
    whatsapp: z.string().nullable(),
    email: z.string().nullable(),
    birthDate: z.iso.date().nullable(),
    document: z.string().nullable(),
    notes: z.string().nullable(),
    source: z.string(),
    acceptsCommunications: z.boolean(),
    primaryUnitPublicId: z.uuid().nullable(),
    customFields: z.record(z.string(), z.unknown()),
    status: z.enum(['ACTIVE', 'INACTIVE']),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export const CustomerListResponseSchema = z.object({
  items: z.array(CustomerPublicSchema),
  page: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});
export const CustomerStatusResponseSchema = z.object({ success: z.literal(true) });
export type CreateCustomerRequest = z.infer<typeof CreateCustomerRequestSchema>;
export type UpdateCustomerRequest = z.infer<typeof UpdateCustomerRequestSchema>;
