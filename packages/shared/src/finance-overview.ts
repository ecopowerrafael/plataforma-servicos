import { z } from 'zod';

const MoneyPublicSchema = z.string().regex(/^\d+$/u);
const SignedMoneyPublicSchema = z.string().regex(/^-?\d+$/u);

/**
 * O período é informado em dias civis: o servidor resolve os instantes no fuso do
 * estabelecimento, e não no fuso do navegador ou do servidor.
 */
export const FinanceOverviewQuerySchema = z
  .object({
    fromDate: z.iso.date(),
    toDate: z.iso.date(),
    unitPublicId: z.uuid().optional(),
    professionalPublicId: z.uuid().optional(),
  })
  .strict();

const PeriodSchema = z.object({
  fromDate: z.iso.date(),
  /** Dia civil final, inclusivo. */
  toDate: z.iso.date(),
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
});

/**
 * Faturado e recebido são grandezas diferentes e nunca se misturam:
 * - `billedCents`: preço líquido dos atendimentos concluídos no período;
 * - `receivedCents`: pagamentos confirmados (PAID) registrados no período.
 */
export const FinanceTotalsSchema = z.object({
  billedCents: MoneyPublicSchema,
  receivedCents: MoneyPublicSchema,
  completedAppointments: z.number().int().nonnegative(),
  ticketAverageCents: MoneyPublicSchema,
});

export const FinanceSeriesPointSchema = z.object({
  key: z.string(),
  label: z.string(),
  billedCents: MoneyPublicSchema,
  receivedCents: MoneyPublicSchema,
});

export const FinancePaymentMethodSchema = z.object({
  publicId: z.uuid(),
  name: z.string(),
  totalCents: MoneyPublicSchema,
  count: z.number().int().nonnegative(),
});

export const FinanceProfessionalSchema = z.object({
  publicId: z.uuid(),
  name: z.string(),
  billedCents: MoneyPublicSchema,
  receivedCents: MoneyPublicSchema,
  completedAppointments: z.number().int().nonnegative(),
  ticketAverageCents: MoneyPublicSchema,
  /** Nulo sem permissão de leitura de comissões. */
  commissionsCents: MoneyPublicSchema.nullable(),
});

export const FinanceReceivableStateSchema = z.enum([
  'ONLINE_PENDING',
  'ONLINE_FAILED',
  'ON_SITE',
]);

export const FinanceReceivableItemSchema = z.object({
  appointmentPublicId: z.uuid(),
  protocol: z.string(),
  customerPublicId: z.uuid(),
  customerName: z.string(),
  startsAt: z.iso.datetime({ offset: true }),
  priceCents: MoneyPublicSchema,
  balanceCents: MoneyPublicSchema,
  /**
   * ONLINE_PENDING: cobrança de gateway aguardando confirmação (PENDING/PROCESSING);
   * ONLINE_FAILED: cobrança que falhou ou expirou e precisa de nova ação;
   * ON_SITE: recebimento previsto no balcão.
   */
  state: FinanceReceivableStateSchema,
});

export const FinanceReceivablesSchema = z.object({
  totalCents: MoneyPublicSchema,
  count: z.number().int().nonnegative(),
  onlinePendingCents: MoneyPublicSchema,
  onlineFailedCents: MoneyPublicSchema,
  onSiteCents: MoneyPublicSchema,
  top: z.array(FinanceReceivableItemSchema),
});

export const FinanceCommissionsSchema = z.object({
  generatedCents: MoneyPublicSchema,
  generatedCount: z.number().int().nonnegative(),
  canceledCents: MoneyPublicSchema,
});

export const FinanceCashSchema = z.object({
  inCents: MoneyPublicSchema,
  outCents: MoneyPublicSchema,
  netCents: SignedMoneyPublicSchema,
  manualInCents: MoneyPublicSchema,
  manualOutCents: MoneyPublicSchema,
  /**
   * Parte das entradas que veio de pagamentos já contabilizados em `receivedCents`.
   * Existe para deixar explícito que caixa não é receita adicional.
   */
  paymentInCents: MoneyPublicSchema,
  openRegisterBalanceCents: MoneyPublicSchema.nullable(),
});

export const FinanceActivitySchema = z.object({
  kind: z.enum(['PAYMENT', 'PAYMENT_CANCELED', 'CASH_IN', 'CASH_OUT']),
  at: z.iso.datetime({ offset: true }),
  title: z.string(),
  description: z.string().nullable(),
  amountCents: MoneyPublicSchema,
  direction: z.enum(['IN', 'OUT']),
  appointmentPublicId: z.uuid().nullable(),
});

export const FinanceOverviewResponseSchema = z.object({
  /** Fuso usado para resolver os dias civis e agrupar a série. */
  timezone: z.string(),
  period: PeriodSchema,
  previousPeriod: PeriodSchema,
  totals: FinanceTotalsSchema,
  /** Nulo quando não há período anterior comparável de mesmo tamanho. */
  previousTotals: FinanceTotalsSchema.nullable(),
  series: z.array(FinanceSeriesPointSchema),
  paymentMethods: z.array(FinancePaymentMethodSchema),
  professionals: z.array(FinanceProfessionalSchema),
  receivables: FinanceReceivablesSchema,
  /** Nulo sem permissão de leitura de comissões. */
  commissions: FinanceCommissionsSchema.nullable(),
  /** Nulo sem permissão de leitura de caixa. */
  cash: FinanceCashSchema.nullable(),
  recentActivity: z.array(FinanceActivitySchema),
});

export type FinanceOverviewQuery = z.infer<typeof FinanceOverviewQuerySchema>;
export type FinanceOverviewResponse = z.infer<typeof FinanceOverviewResponseSchema>;
