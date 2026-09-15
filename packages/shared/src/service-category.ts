import { z } from 'zod';

const CategoryColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/u);
const CategoryIconSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9-]{1,64}$/u)
  .nullable()
  .optional();

const ServiceCategoryInputShape = {
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(1).max(500).nullable().optional(),
  color: CategoryColorSchema,
  icon: CategoryIconSchema,
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  active: z.boolean().default(true),
};

export const CreateServiceCategoryRequestSchema = z.object(ServiceCategoryInputShape).strict();
export const UpdateServiceCategoryRequestSchema = z.object(ServiceCategoryInputShape).strict();
export const ServiceCategoryPublicSchema = z
  .object({
    publicId: z.uuid(),
    name: z.string(),
    description: z.string().nullable(),
    color: CategoryColorSchema,
    icon: z.string().nullable(),
    serviceCount: z.number().int().nonnegative().optional(),
    sortOrder: z.number().int(),
    active: z.boolean(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export const ServiceCategoryListResponseSchema = z.object({
  items: z.array(ServiceCategoryPublicSchema),
  page: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});
export const ServiceCategoryStatusResponseSchema = z.object({ success: z.literal(true) });

export type CreateServiceCategoryRequest = z.infer<typeof CreateServiceCategoryRequestSchema>;
export type UpdateServiceCategoryRequest = z.infer<typeof UpdateServiceCategoryRequestSchema>;
