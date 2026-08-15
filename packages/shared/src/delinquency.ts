import { z } from 'zod';

const MoneyPublicSchema = z.string().regex(/^\d+$/u);

export const DelinquencyQuerySchema = z
  .object({
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    unitPublicId: z.uuid().optional(),
    customerPublicId: z.uuid().optional(),
    professionalPublicId: z.uuid().optional(),
    status: z
      .enum(['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED', 'NO_SHOW'])
      .optional(),
    /* Situacao da cobranca; a paginacao e opcional para nao quebrar consumidores atuais. */
    state: z.enum(['ONLINE_PENDING', 'ONLINE_FAILED', 'ON_SITE']).optional(),
    search: z.string().trim().min(1).max(160).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

export const DelinquentAppointmentSchema = z.object({
  appointmentPublicId: z.uuid(),
  protocol: z.string(),
  status: z.enum(['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED', 'NO_SHOW']),
  startsAt: z.iso.datetime({ offset: true }),
  customerPublicId: z.uuid(),
  customerName: z.string(),
  professionalPublicId: z.uuid(),
  professionalName: z.string(),
  unitPublicId: z.uuid().nullable(),
  unitName: z.string().nullable(),
  priceCents: MoneyPublicSchema,
  /* Preco liquido: preco menos cupom e fidelidade realmente aplicados. */
  netPriceCents: MoneyPublicSchema.default('0'),
  discountCents: MoneyPublicSchema.default('0'),
  paidCents: MoneyPublicSchema,
  balanceCents: MoneyPublicSchema,
  serviceName: z.string().default(''),
  state: z.enum(['ONLINE_PENDING', 'ONLINE_FAILED', 'ON_SITE']).default('ON_SITE'),
});

export const DelinquencySummarySchema = z.object({
  totalBalanceCents: MoneyPublicSchema,
  count: z.number().int().nonnegative(),
  onlinePendingCents: MoneyPublicSchema,
  onlineFailedCents: MoneyPublicSchema,
  onSiteCents: MoneyPublicSchema,
});

export const DelinquencyResponseSchema = z.object({
  items: z.array(DelinquentAppointmentSchema),
  /* Total da exposicao inteira, independente de filtro de situacao e pagina. */
  totalBalanceCents: MoneyPublicSchema,
  summary: DelinquencySummarySchema.optional(),
  page: z
    .object({
      page: z.number().int().min(1),
      limit: z.number().int().min(1),
      total: z.number().int().nonnegative(),
      totalPages: z.number().int().nonnegative(),
    })
    .optional(),
});

export type DelinquencyQuery = z.infer<typeof DelinquencyQuerySchema>;
export type DelinquentAppointment = z.infer<typeof DelinquentAppointmentSchema>;
