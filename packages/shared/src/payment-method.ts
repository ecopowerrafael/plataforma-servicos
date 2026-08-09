import { z } from 'zod';

export const PaymentMethodTypeSchema = z.enum([
  'CASH',
  'PIX',
  'DEBIT_CARD',
  'CREDIT_CARD',
  'BANK_TRANSFER',
  'OTHER',
]);

export const CreatePaymentMethodRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    type: PaymentMethodTypeSchema,
    sortOrder: z.coerce.number().int().min(0).max(65_535).default(0),
    active: z.boolean().default(true),
  })
  .strict();

export const UpdatePaymentMethodRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    type: PaymentMethodTypeSchema.optional(),
    sortOrder: z.coerce.number().int().min(0).max(65_535).optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined ||
      value.type !== undefined ||
      value.sortOrder !== undefined ||
      value.active !== undefined,
    { message: 'Informe ao menos uma alteração.' },
  );

export const PaymentMethodPublicSchema = z.object({
  publicId: z.uuid(),
  name: z.string(),
  type: PaymentMethodTypeSchema,
  sortOrder: z.number().int(),
  active: z.boolean(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const PaymentMethodListResponseSchema = z.object({
  items: z.array(PaymentMethodPublicSchema),
});

export type CreatePaymentMethodRequest = z.infer<typeof CreatePaymentMethodRequestSchema>;
export type UpdatePaymentMethodRequest = z.infer<typeof UpdatePaymentMethodRequestSchema>;
export type PaymentMethodPublic = z.infer<typeof PaymentMethodPublicSchema>;
