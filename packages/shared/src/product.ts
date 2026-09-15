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
  imageAlt: z.string().trim().min(1).max(160).nullable().optional(),
  costPriceCents: MoneySchema.default('0'),
  salePriceCents: MoneySchema,
  commissionType: z.enum(['PERCENTAGE', 'FIXED']).nullable().optional(),
  commissionValue: z.coerce.number().int().min(0).max(2_000_000_000).nullable().optional(),
  active: z.boolean().default(true),
};
export const CreateProductRequestSchema = z.object(ProductInputShape).strict();
export const UpdateProductRequestSchema = z.object(ProductInputShape).strict();
export const ProductStockStatusSchema = z.enum(['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK']);
export const ProductPublicSchema = z
  .object({
    publicId: z.uuid(),
    categoryPublicId: z.uuid().nullable(),
    categoryName: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    sku: z.string().nullable(),
    barcode: z.string().nullable(),
    imageUrl: z.string().nullable(),
    imageAlt: z.string().nullable(),
    costPriceCents: z.string(),
    salePriceCents: z.string(),
    commissionType: z.enum(['PERCENTAGE', 'FIXED']).nullable(),
    commissionValue: z.number().int().nullable(),
    active: z.boolean(),
    stockQuantity: z.number().int(),
    stockMinimumQuantity: z.number().int(),
    stockStatus: ProductStockStatusSchema,
    stockUnitCount: z.number().int(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export const ProductPageSchema = z
  .object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  })
  .strict();
export const ProductListResponseSchema = z.object({
  items: z.array(ProductPublicSchema),
  page: ProductPageSchema,
});
export const ProductQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().min(1).max(120).optional(),
    active: z.enum(['true', 'false']).optional(),
    categoryPublicId: z.uuid().optional(),
    stock: z.enum(['in', 'low', 'out']).optional(),
    unitPublicId: z.uuid().optional(),
  })
  .strict();
export const ProductCatalogSummaryResponseSchema = z
  .object({
    activeCount: z.number().int(),
    inactiveCount: z.number().int(),
    lowStockCount: z.number().int(),
    outOfStockCount: z.number().int(),
    stockValueCents: z.string(),
    stockValueReliable: z.boolean(),
  })
  .strict();
export const ProductStatusResponseSchema = z.object({ success: z.literal(true) }).strict();
/**
 * Produto sem histórico é apagado; com venda ou movimentação é arquivado
 * (`active=false`), preservando estoque e referências.
 */
export const ProductRemovalResponseSchema = z
  .object({
    deleted: z.boolean(),
    archived: z.boolean(),
    saleItemCount: z.number().int(),
    movementCount: z.number().int(),
  })
  .strict();

export const SetProductStockRequestSchema = z
  .object({
    quantity: z.coerce.number().int().min(0).max(2_000_000_000),
    minimumQuantity: z.coerce.number().int().min(0).max(2_000_000_000).default(0),
  })
  .strict();
export const SetMinimumStockRequestSchema = z
  .object({ minimumQuantity: z.coerce.number().int().min(0).max(2_000_000_000) })
  .strict();
export const ProductStockPublicSchema = z
  .object({
    publicId: z.uuid(),
    productPublicId: z.uuid(),
    productName: z.string(),
    unitPublicId: z.uuid(),
    unitName: z.string(),
    quantity: z.number().int(),
    minimumQuantity: z.number().int(),
    lowStock: z.boolean(),
    status: ProductStockStatusSchema,
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
export type SetMinimumStockRequest = z.infer<typeof SetMinimumStockRequestSchema>;
export type ProductQuery = z.infer<typeof ProductQuerySchema>;
export type ProductPublic = z.infer<typeof ProductPublicSchema>;
export type ProductStockStatus = z.infer<typeof ProductStockStatusSchema>;
export type StockMovementQuery = z.infer<typeof StockMovementQuerySchema>;

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
    productName: z.string(),
    unitPublicId: z.uuid(),
    unitName: z.string(),
    relatedUnitPublicId: z.uuid().nullable(),
    relatedUnitName: z.string().nullable(),
    quantity: z.number().int(),
    previousQuantity: z.number().int(),
    resultingQuantity: z.number().int(),
    reason: z.string().nullable(),
    responsibleUserPublicId: z.uuid(),
    responsibleName: z.string().nullable(),
    salePublicId: z.uuid().nullable(),
    saleCustomerName: z.string().nullable(),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export const StockMovementQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    productPublicId: z.uuid().optional(),
    unitPublicId: z.uuid().optional(),
    type: StockMovementTypeSchema.optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();
export const StockMovementListResponseSchema = z.object({
  items: z.array(StockMovementPublicSchema),
  page: ProductPageSchema,
});
export const TransferStockResponseSchema = z.object({
  transferPublicId: z.uuid(),
  movements: z.array(StockMovementPublicSchema).length(2),
});
export type CreateStockMovementRequest = z.infer<typeof CreateStockMovementRequestSchema>;
export type TransferStockRequest = z.infer<typeof TransferStockRequestSchema>;

export const CreateProductSaleRequestSchema = z
  .object({
    unitPublicId: z.uuid(),
    customerPublicId: z.uuid().nullable().optional(),
    professionalPublicId: z.uuid().nullable().optional(),
    paymentMethodPublicId: z.uuid(),
    notes: z.string().trim().max(500).nullable().optional(),
    items: z
      .array(
        z
          .object({
            productPublicId: z.uuid(),
            quantity: z.coerce.number().int().min(1).max(2_000_000_000),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.items.map((item) => item.productPublicId)).size !== value.items.length)
      context.addIssue({
        code: 'custom',
        path: ['items'],
        message: 'Não repita produtos na mesma venda.',
      });
  });
export const ProductSalePublicSchema = z.object({
  publicId: z.uuid(),
  unitPublicId: z.uuid(),
  customerPublicId: z.uuid().nullable(),
  professionalPublicId: z.uuid().nullable(),
  paymentMethodPublicId: z.uuid(),
  totalCents: z.string(),
  notes: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  items: z.array(
    z.object({
      publicId: z.uuid(),
      productPublicId: z.uuid(),
      productName: z.string(),
      quantity: z.number().int(),
      unitPriceCents: z.string(),
      totalCents: z.string(),
      commissionAmountCents: z.string(),
      stockMovementPublicId: z.uuid(),
    }),
  ),
});
export const ProductSaleListResponseSchema = z.object({ items: z.array(ProductSalePublicSchema) });
export const ProductSaleQuerySchema = z
  .object({
    unitPublicId: z.uuid().optional(),
    productPublicId: z.uuid().optional(),
    customerPublicId: z.uuid().optional(),
    professionalPublicId: z.uuid().optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();
export type CreateProductSaleRequest = z.infer<typeof CreateProductSaleRequestSchema>;
