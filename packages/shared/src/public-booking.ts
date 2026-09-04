import { z } from 'zod';

import { ComboPublicDisplaySchema } from './combo.js';
import { ImageUrlSchema } from './image-url.js';
import { TenantSlugSchema } from './tenant.js';

export const PublicServiceProfessionalSchema = z.object({
  publicId: z.uuid(),
  name: z.string(),
  bio: z.string().nullable(),
  photoUrl: z.string().nullable(),
});
export const PublicServiceProfessionalsResponseSchema = z.object({
  professionals: z.array(PublicServiceProfessionalSchema),
});

export const PublicProfessionalServiceSchema = z.object({
  publicId: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  imageUrl: ImageUrlSchema,
  iconKey: z.string().nullable(),
  priceCents: z.string().regex(/^\d+$/u),
  pricingMode: z.enum(['FIXED', 'QUOTE']),
  quoteNotice: z.string().nullable(),
  durationMinutes: z.number().int(),
});
export const PublicProfessionalOfferingsResponseSchema = z.object({
  services: z.array(PublicProfessionalServiceSchema),
  combos: z.array(ComboPublicDisplaySchema),
});

// Backwards compatibility alias (to be removed)
export const PublicProfessionalServicesResponseSchema = PublicProfessionalOfferingsResponseSchema;

const PublicBookingCustomerInputSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(3).max(32).nullable().optional(),
    email: z.email().trim().max(254).nullable().optional(),
  })
  .strict()
  .refine(
    (value) => (value.phone ?? null) !== null || (value.email ?? null) !== null,
    'Informe telefone ou e-mail para contato.',
  );

export const CreatePublicBookingRequestSchema = z
  .object({
    unitPublicId: z.uuid().nullable().optional(),
    servicePublicId: z.uuid(),
    professionalPublicId: z.uuid(),
    startsAt: z.iso.datetime({ offset: true }),
    notes: z.string().trim().max(2000).nullable().optional(),
    customer: PublicBookingCustomerInputSchema,
  })
  .strict();

export const PublicBookingConfirmationSchema = z.object({
  protocol: z.string(),
  appointmentPublicId: z.uuid(),
  status: z.enum(['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED', 'NO_SHOW']),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  serviceName: z.string(),
  professionalName: z.string(),
  unitName: z.string().nullable(),
  customerName: z.string(),
});

export const PublicBookingSlugParamsSchema = z.object({ slug: TenantSlugSchema }).strict();
export const PublicBookingServiceParamsSchema = PublicBookingSlugParamsSchema.extend({
  servicePublicId: z.uuid(),
}).strict();
export const PublicProfessionalServicesParamsSchema = PublicBookingSlugParamsSchema.extend({
  professionalPublicId: z.uuid(),
}).strict();

export type CreatePublicBookingRequest = z.infer<typeof CreatePublicBookingRequestSchema>;
export type PublicBookingConfirmation = z.infer<typeof PublicBookingConfirmationSchema>;
