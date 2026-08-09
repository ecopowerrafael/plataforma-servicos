import { z } from 'zod';

export const CreateCustomerFavoriteRequestSchema = z
  .object({
    professionalPublicId: z.uuid().optional(),
    servicePublicId: z.uuid().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const targets = [value.professionalPublicId, value.servicePublicId].filter(
      (target) => target !== undefined,
    );
    if (targets.length !== 1)
      context.addIssue({
        code: 'custom',
        path: ['professionalPublicId'],
        message: 'Informe exatamente um profissional ou serviço para favoritar.',
      });
  });

export const CustomerFavoritePublicSchema = z.object({
  publicId: z.uuid(),
  professionalPublicId: z.uuid().nullable(),
  professionalName: z.string().nullable(),
  servicePublicId: z.uuid().nullable(),
  serviceName: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});

export const CustomerFavoriteListResponseSchema = z.object({
  items: z.array(CustomerFavoritePublicSchema),
});

export type CreateCustomerFavoriteRequest = z.infer<typeof CreateCustomerFavoriteRequestSchema>;
