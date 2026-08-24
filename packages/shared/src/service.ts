import { z } from 'zod';

const ServiceColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/u);
const MoneyInputSchema = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const MoneyPublicSchema = z.string().regex(/^\d+$/u);

/**
 * `FIXED` mantém o comportamento atual (preço no catálogo). `QUOTE` agenda uma
 * avaliação e o preço é definido depois, por cliente, no orçamento.
 */
export const ServicePricingModeSchema = z.enum(['FIXED', 'QUOTE']);

const ServiceInputShape = {
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(1).max(1000).nullable().optional(),
  imageAlt: z.string().trim().min(1).max(160).nullable().optional(),
  /** Identificador do catálogo curado de ícones (sem SVG livre do usuário). */
  iconKey: z.string().trim().min(1).max(60).nullable().optional(),
  categoryPublicId: z.uuid().nullable().optional(),
  durationMinutes: z.coerce.number().int().min(1).max(1440),
  hasPostServiceBreak: z.boolean().default(false),
  postServiceBreakMinutes: z.coerce.number().int().min(0).max(240).default(0),
  priceCents: MoneyInputSchema,
  /** Ausente nos serviços já existentes: o padrão continua sendo preço fixo. */
  pricingMode: ServicePricingModeSchema.optional(),
  /** Texto público exibido no lugar do preço nos serviços sob orçamento. */
  quoteNotice: z.string().trim().min(1).max(160).nullable().optional(),
  color: ServiceColorSchema,
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
};

const ServiceCreateInputShape = {
  ...ServiceInputShape,
  active: z.boolean().default(true),
};

const ServiceUpdateInputShape = {
  ...ServiceInputShape,
  active: z.boolean().optional(),
};

function withBreakValidation<T extends z.ZodType>(schema: T): T {
  return schema.superRefine((value, context) => {
    const service = value as {
      hasPostServiceBreak?: boolean;
      postServiceBreakMinutes?: number;
      pricingMode?: 'FIXED' | 'QUOTE';
      priceCents?: number;
    };
    // Sob orçamento o preço só é definido depois da avaliação.
    if (service.pricingMode === 'QUOTE' && (service.priceCents ?? 0) !== 0)
      context.addIssue({
        code: 'custom',
        path: ['priceCents'],
        message: 'Serviços sob orçamento não têm preço no cadastro.',
      });
    if (service.hasPostServiceBreak === true && service.postServiceBreakMinutes === 0) {
      context.addIssue({
        code: 'custom',
        path: ['postServiceBreakMinutes'],
        message: 'Informe uma pausa maior que zero.',
      });
    }
    if (service.hasPostServiceBreak === false && service.postServiceBreakMinutes !== 0) {
      context.addIssue({
        code: 'custom',
        path: ['postServiceBreakMinutes'],
        message: 'A pausa deve ser zero quando estiver desativada.',
      });
    }
  });
}

export const CreateServiceRequestSchema = withBreakValidation(z.object(ServiceCreateInputShape).strict());
export const UpdateServiceRequestSchema = withBreakValidation(z.object(ServiceUpdateInputShape).strict());

export const ServicePublicSchema = z
  .object({
    publicId: z.uuid(),
    name: z.string(),
    description: z.string().nullable(),
    imageAlt: z.string().nullable(),
    iconKey: z.string().nullable(),
    categoryPublicId: z.uuid().nullable(),
    categoryName: z.string().nullable().optional(),
    enabledProfessionalCount: z.number().int().nonnegative().optional(),
    imageUrl: z
      .string()
      .regex(/^\/tenant\/services\/[0-9a-f-]{36}\/image$/iu)
      .nullable(),
    durationMinutes: z.number().int(),
    hasPostServiceBreak: z.boolean(),
    postServiceBreakMinutes: z.number().int(),
    priceCents: MoneyPublicSchema,
    pricingMode: ServicePricingModeSchema,
    quoteNotice: z.string().nullable(),
    color: ServiceColorSchema,
    sortOrder: z.number().int(),
    active: z.boolean(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const ServiceListResponseSchema = z.object({
  items: z.array(ServicePublicSchema),
  page: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

export const ServiceStatusResponseSchema = z.object({ success: z.literal(true) });

export function blockedServiceMinutes(
  durationMinutes: number,
  hasPostServiceBreak: boolean,
  postServiceBreakMinutes: number,
): number {
  return durationMinutes + (hasPostServiceBreak ? postServiceBreakMinutes : 0);
}

/** Rótulo público de um serviço sob orçamento — nunca exibir R$ 0,00. */
export const DEFAULT_QUOTE_NOTICE = 'Valor sob orçamento';

export function servicePriceLabel(
  pricingMode: 'FIXED' | 'QUOTE',
  priceCents: string,
  quoteNotice: string | null,
): string {
  if (pricingMode === 'QUOTE') return quoteNotice ?? DEFAULT_QUOTE_NOTICE;
  return (Number(priceCents) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export type CreateServiceRequest = z.infer<typeof CreateServiceRequestSchema>;
export type UpdateServiceRequest = z.infer<typeof UpdateServiceRequestSchema>;
