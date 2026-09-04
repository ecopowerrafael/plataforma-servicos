import { z } from 'zod';

import { ImageUrlSchema } from './public-booking.js';

const MoneyInputSchema = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const MoneyPublicSchema = z.string().regex(/^\d+$/u);

const ComboItemInputSchema = z
  .object({
    servicePublicId: z.uuid(),
    sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  })
  .strict();

const ComboInputShape = {
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(1).max(1000).nullable().optional(),
  imageAlt: z.string().trim().min(1).max(160).nullable().optional(),
  priceCents: MoneyInputSchema,
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  active: z.boolean().default(true),
  items: z.array(ComboItemInputSchema).min(2),
};

function withUniqueItems<T extends z.ZodType>(schema: T): T {
  return schema.superRefine((value, context) => {
    const combo = value as { items?: { servicePublicId: string }[] };
    const ids = combo.items?.map((item) => item.servicePublicId) ?? [];
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: 'custom',
        path: ['items'],
        message: 'Cada serviço só pode aparecer uma vez no combo.',
      });
    }
  });
}

export const CreateComboRequestSchema = withUniqueItems(z.object(ComboInputShape).strict());
export const UpdateComboRequestSchema = withUniqueItems(z.object(ComboInputShape).strict());

export const ComboItemPublicSchema = z
  .object({
    servicePublicId: z.uuid(),
    name: z.string(),
    sortOrder: z.number().int(),
    durationMinutes: z.number().int(),
    hasPostServiceBreak: z.boolean(),
    postServiceBreakMinutes: z.number().int(),
  })
  .strict();

export const ComboPublicSchema = z
  .object({
    publicId: z.uuid(),
    name: z.string(),
    description: z.string().nullable(),
    imageAlt: z.string().nullable(),
    imageUrl: ImageUrlSchema,
    priceCents: MoneyPublicSchema,
    sortOrder: z.number().int(),
    active: z.boolean(),
    items: z.array(ComboItemPublicSchema),
    durationMinutes: z.number().int(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const ComboListResponseSchema = z.object({
  items: z.array(ComboPublicSchema),
  page: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

export const ComboStatusResponseSchema = z.object({ success: z.literal(true) });

export const ComboEligibleProfessionalSchema = z
  .object({ publicId: z.uuid(), publicName: z.string() })
  .strict();

export const ComboEligibleProfessionalsResponseSchema = z.object({
  items: z.array(ComboEligibleProfessionalSchema),
});

/**
 * Schema para combos expostos na API pública (/public/sites/:slug).
 * Exclui campos administrativos: active, createdAt, updatedAt.
 */
export const ComboPublicDisplaySchema = z
  .object({
    publicId: z.uuid(),
    name: z.string(),
    description: z.string().nullable(),
    imageAlt: z.string().nullable(),
    imageUrl: z.string().nullable(),
    priceCents: MoneyPublicSchema,
    sortOrder: z.number().int(),
    items: z.array(ComboItemPublicSchema),
    durationMinutes: z.number().int(),
  })
  .strict();

export type CreateComboRequest = z.infer<typeof CreateComboRequestSchema>;
export type UpdateComboRequest = z.infer<typeof UpdateComboRequestSchema>;
export type ComboPublicDisplay = z.infer<typeof ComboPublicDisplaySchema>;
