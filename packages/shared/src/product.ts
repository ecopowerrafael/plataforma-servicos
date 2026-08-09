import { z } from 'zod';

const MoneySchema = z.coerce.bigint().min(0n).transform(String);

export const CreateProductCategoryRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().min(1).max(500).nullable().optional(),
    active: z.boolean().default(true),
  })
  .strict();
export const UpdateProductCategoryRequestSchema = CreateProductCategoryRequestSchema;
export const ProductCategoryPublicSchema = z
  .object({
    publicId: z.uuid(),
    name: z.string(),
    description: z.string().nullable(),
    active: z.boolean(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export const ProductCategoryListResponseSchema = z.object({
  items: z.array(ProductCategoryPublicSchema),
});

const ProductInputShape = {
  categoryPublicId: z.uuid().nullable().optional(),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().min(1).max(1000).nullable().optional(),
  sku: z.string().trim().min(1).max(80).nullable().optional(),
  barcode: z.string().trim().min(1).max(80).nullable().optional(),
  costPriceCents: MoneySchema.default('0'),
  salePriceCents: MoneySchema,
  active: z.boolean().default(true),
};
export const CreateProductRequestSchema = z.object(ProductInputShape).strict();
export const UpdateProductRequestSchema = z.object(ProductInputShape).strict();
export const ProductPublicSchema = z
  .object({
    publicId: z.uuid(),
    categoryPublicId: z.uuid().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    sku: z.string().nullable(),
    barcode: z.string().nullable(),
    costPriceCents: z.string(),
    salePriceCents: z.string(),
    active: z.boolean(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export const ProductListResponseSchema = z.object({ items: z.array(ProductPublicSchema) });

export const SetProductStockRequestSchema = z
  .object({
    quantity: z.coerce.number().int().min(0).max(2_000_000_000),
    minimumQuantity: z.coerce.number().int().min(0).max(2_000_000_000).default(0),
  })
  .strict();
export const ProductStockPublicSchema = z
  .object({
    publicId: z.uuid(),
    productPublicId: z.uuid(),
    unitPublicId: z.uuid(),
    quantity: z.number().int(),
    minimumQuantity: z.number().int(),
    lowStock: z.boolean(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export const ProductStockListResponseSchema = z.object({
  items: z.array(ProductStockPublicSchema),
});

export type CreateProductCategoryRequest = z.infer<typeof CreateProductCategoryRequestSchema>;
export type CreateProductRequest = z.infer<typeof CreateProductRequestSchema>;
export type SetProductStockRequest = z.infer<typeof SetProductStockRequestSchema>;

export const StockMovementTypeSchema = z.enum([
  'ENTRY',
  'MANUAL_EXIT',
  'POSITIVE_ADJUSTMENT',
  'NEGATIVE_ADJUSTMENT',
  'TRANSFER_OUT',
  'TRANSFER_IN',
]);
export const CreateStockMovementRequestSchema = z
  .object({
    type: z.enum(['ENTRY', 'MANUAL_EXIT', 'POSITIVE_ADJUSTMENT', 'NEGATIVE_ADJUSTMENT']),
    productPublicId: z.uuid(),
    unitPublicId: z.uuid(),
    quantity: z.coerce.number().int().min(1).max(2_000_000_000),
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.type !== 'ENTRY' && value.reason === undefined)
      context.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'Informe o motivo da movimentação.',
      });
  });
export const TransferStockRequestSchema = z
  .object({
    productPublicId: z.uuid(),
    sourceUnitPublicId: z.uuid(),
    destinationUnitPublicId: z.uuid(),
    quantity: z.coerce.number().int().min(1).max(2_000_000_000),
    reason: z.string().trim().min(3).max(500),
  })
  .strict()
  .refine((value) => value.sourceUnitPublicId !== value.destinationUnitPublicId, {
    path: ['destinationUnitPublicId'],
    message: 'A unidade de destino deve ser diferente da origem.',
  });
export const StockMovementPublicSchema = z
  .object({
    publicId: z.uuid(),
    transferPublicId: z.uuid().nullable(),
    type: StockMovementTypeSchema,
    productPublicId: z.uuid(),
    unitPublicId: z.uuid(),
    relatedUnitPublicId: z.uuid().nullable(),
    quantity: z.number().int(),
    previousQuantity: z.number().int(),
    resultingQuantity: z.number().int(),
    reason: z.string().nullable(),
    responsibleUserPublicId: z.uuid(),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export const StockMovementListResponseSchema = z.object({
  items: z.array(StockMovementPublicSchema),
});
export const TransferStockResponseSchema = z.object({
  transferPublicId: z.uuid(),
  movements: z.array(StockMovementPublicSchema).length(2),
});
export type CreateStockMovementRequest = z.infer<typeof CreateStockMovementRequestSchema>;
export type TransferStockRequest = z.infer<typeof TransferStockRequestSchema>;
