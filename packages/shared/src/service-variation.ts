import { z } from 'zod';
const ServiceVariationInputShape = {
  name: z.string().trim().min(2).max(120),
  durationMinutes: z.coerce.number().int().min(1).max(1440),
  priceCents: z.coerce.number().int().min(0),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  active: z.boolean().default(true),
};
export const CreateServiceVariationRequestSchema = z.object(ServiceVariationInputShape).strict();
export const UpdateServiceVariationRequestSchema = z.object(ServiceVariationInputShape).strict();
export const ServiceVariationPublicSchema = z
  .object({
    publicId: z.uuid(),
    servicePublicId: z.uuid(),
    name: z.string(),
    durationMinutes: z.number().int(),
    priceCents: z.number().int(),
    sortOrder: z.number().int(),
    active: z.boolean(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export const ServiceVariationsResponseSchema = z.object({
  items: z.array(ServiceVariationPublicSchema),
});
export const ServiceVariationStatusResponseSchema = z.object({ success: z.literal(true) });
export type CreateServiceVariationRequest = z.infer<typeof CreateServiceVariationRequestSchema>;
export type UpdateServiceVariationRequest = z.infer<typeof UpdateServiceVariationRequestSchema>;
