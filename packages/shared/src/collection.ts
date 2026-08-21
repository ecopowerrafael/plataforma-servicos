import { z } from 'zod';

export const DebtOriginTypeSchema = z.enum(['APPOINTMENT', 'MANUAL']);

export const DebtStatusSchema = z.enum([
  'OPEN',
  'COLLECTING',
  'WAITING_RESPONSE',
  'PROMISE_SCHEDULED',
  'PIX_PENDING',
  'PARTIALLY_PAID',
  'PROMISE_OVERDUE',
  'NEGOTIATING',
  'DISPUTED',
  'HUMAN_SUPPORT',
  'PAUSED',
  'PAID',
  'CANCELED',
]);

export const CollectionCadenceTypeSchema = z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'CUSTOM_DAYS']);

export const CollectionAttemptStatusSchema = z.enum([
  'SCHEDULED',
  'PROCESSING',
  'SENT',
  'SKIPPED',
  'FAILED',
  'RESPONDED',
  'CANCELED',
]);

export const CollectionAttemptTypeSchema = z.enum([
  'INITIAL_COLLECTION',
  'SAME_DAY_FOLLOWUP',
  'NEXT_DAY_FOLLOWUP',
  'CYCLE_RESTART',
  'PROMISE_DUE',
  'PROMISE_OVERDUE',
  'PIX_PENDING_REMINDER',
  'PARTIAL_PAYMENT_FOLLOWUP',
]);

export const PaymentPromiseStatusSchema = z.enum(['ACTIVE', 'FULFILLED', 'OVERDUE', 'REPLACED', 'CANCELED']);
export const PaymentPromiseSourceSchema = z.enum(['WHATSAPP', 'MANUAL']);
export const DebtPaymentAllocationSourceSchema = z.enum(['BOT_PIX', 'MANUAL', 'APPOINTMENT_PAYMENT', 'OTHER']);

const MoneyInputSchema = z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const MoneyPublicSchema = z.string().regex(/^\d+$/u);

export const DebtPublicSchema = z.object({
  publicId: z.uuid(),
  originType: DebtOriginTypeSchema,
  originAppointmentPublicId: z.uuid().nullable(),
  customerPublicId: z.uuid().nullable(),
  unitPublicId: z.uuid().nullable(),
  debtorName: z.string(),
  debtorWhatsapp: z.string(),
  debtorEmail: z.string().nullable(),
  debtorDocument: z.string().nullable(),
  description: z.string(),
  originalAmountCents: MoneyPublicSchema,
  currentBalanceCents: MoneyPublicSchema,
  dueDate: z.iso.date(),
  status: DebtStatusSchema,
  collectionRulePublicId: z.uuid(),
  collectionPausedAt: z.iso.datetime({ offset: true }).nullable(),
  collectionPausedReason: z.string().nullable(),
  canceledAt: z.iso.datetime({ offset: true }).nullable(),
  canceledReason: z.string().nullable(),
  paidAt: z.iso.datetime({ offset: true }).nullable(),
  notes: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const DebtListResponseSchema = z.object({
  items: z.array(DebtPublicSchema),
});

export const UpdateDebtRequestSchema = z
  .object({
    description: z.string().trim().min(1).max(500).optional(),
    dueDate: z.iso.date().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
    collectionRulePublicId: z.uuid().optional(),
  })
  .strict();

export const PauseDebtRequestSchema = z
  .object({ reason: z.string().trim().min(3).max(500).nullable().optional() })
  .strict();

export const CancelDebtRequestSchema = z
  .object({ reason: z.string().trim().min(3).max(500) })
  .strict();

export const CreateManualDebtRequestSchema = z
  .object({
    debtorName: z.string().trim().min(1).max(160),
    debtorWhatsapp: z.string().trim().min(8).max(20),
    debtorEmail: z.string().trim().email().nullable().optional(),
    debtorDocument: z.string().trim().nullable().optional(),
    description: z.string().trim().min(1).max(500),
    amountCents: MoneyInputSchema,
    dueDate: z.iso.date(),
    collectionRulePublicId: z.uuid(),
    customerPublicId: z.uuid().nullable().optional(),
    unitPublicId: z.uuid().nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();

export const CreateDebtFromAppointmentRequestSchema = z
  .object({
    appointmentPublicId: z.uuid(),
    // Opcionais para permitir a ação de um clique ("Iniciar cobrança
    // automática") em Pendências financeiras: quando omitidos, o backend usa
    // hoje como vencimento e resolve/cria a régua padrão do tenant.
    dueDate: z.iso.date().optional(),
    collectionRulePublicId: z.uuid().optional(),
  })
  .strict();

export const CollectionRulePublicSchema = z.object({
  publicId: z.uuid(),
  name: z.string(),
  active: z.boolean(),
  cadenceType: CollectionCadenceTypeSchema,
  cadenceDays: z.number().int().nullable(),
  allowedStartHour: z.number().int().min(0).max(23),
  allowedEndHour: z.number().int().min(0).max(23),
  maxAttemptsPerDay: z.number().int().min(1),
  consecutiveDays: z.number().int().min(1),
  pauseDaysAfterCycle: z.number().int().min(0),
  maxCycles: z.number().int().nullable(),
  skipSundays: z.boolean(),
  partialPaymentEnabled: z.boolean(),
  partialOfferPercentages: z.array(z.number().int().min(1).max(99)),
  partialMinimumCents: MoneyPublicSchema,
  partialRoundingStepCents: MoneyPublicSchema,
  promiseQuickOptionsDays: z.array(z.number().int().min(1)),
});

export const CollectionRuleListResponseSchema = z.object({
  items: z.array(CollectionRulePublicSchema),
});

const collectionRuleShape = {
  name: z.string().trim().min(1).max(120),
  active: z.boolean().default(true),
  cadenceType: CollectionCadenceTypeSchema,
  cadenceDays: z.number().int().min(1).max(365).nullable().optional(),
  preferredWeekday: z.number().int().min(0).max(6).nullable().optional(),
  monthlyDay: z.number().int().min(1).max(31).nullable().optional(),
  allowedStartHour: z.number().int().min(0).max(23).default(9),
  allowedEndHour: z.number().int().min(0).max(23).default(18),
  maxAttemptsPerDay: z.number().int().min(1).max(10).default(1),
  consecutiveDays: z.number().int().min(1).max(30).default(3),
  pauseDaysAfterCycle: z.number().int().min(0).max(90).default(4),
  maxCycles: z.number().int().min(1).max(100).nullable().optional(),
  skipSundays: z.boolean().default(true),
  partialPaymentEnabled: z.boolean().default(true),
  partialOfferPercentages: z.array(z.number().int().min(1).max(99)).default([]),
  partialMinimumCents: MoneyInputSchema.optional(),
  partialRoundingStepCents: MoneyInputSchema.optional(),
  askPromiseAfterPartialPayment: z.boolean().default(true),
  promiseQuickOptionsDays: z.array(z.number().int().min(1).max(90)).default([]),
  noResponseFollowupNextDay: z.boolean().default(true),
};

export const CreateCollectionRuleRequestSchema = z
  .object(collectionRuleShape)
  .strict()
  .refine((data) => data.allowedStartHour < data.allowedEndHour, {
    message: 'O horário inicial deve ser anterior ao horário final.',
    path: ['allowedEndHour'],
  });

export const UpdateCollectionRuleRequestSchema = z
  .object({
    name: collectionRuleShape.name.optional(),
    active: z.boolean().optional(),
    cadenceType: CollectionCadenceTypeSchema.optional(),
    cadenceDays: z.number().int().min(1).max(365).nullable().optional(),
    preferredWeekday: z.number().int().min(0).max(6).nullable().optional(),
    monthlyDay: z.number().int().min(1).max(31).nullable().optional(),
    allowedStartHour: z.number().int().min(0).max(23).optional(),
    allowedEndHour: z.number().int().min(0).max(23).optional(),
    maxAttemptsPerDay: z.number().int().min(1).max(10).optional(),
    consecutiveDays: z.number().int().min(1).max(30).optional(),
    pauseDaysAfterCycle: z.number().int().min(0).max(90).optional(),
    maxCycles: z.number().int().min(1).max(100).nullable().optional(),
    skipSundays: z.boolean().optional(),
    partialPaymentEnabled: z.boolean().optional(),
    partialOfferPercentages: z.array(z.number().int().min(1).max(99)).optional(),
    partialMinimumCents: MoneyInputSchema.optional(),
    partialRoundingStepCents: MoneyInputSchema.optional(),
    askPromiseAfterPartialPayment: z.boolean().optional(),
    promiseQuickOptionsDays: z.array(z.number().int().min(1).max(90)).optional(),
    noResponseFollowupNextDay: z.boolean().optional(),
  })
  .strict();

export const PaymentPromisePublicSchema = z.object({
  publicId: z.uuid(),
  debtPublicId: z.uuid(),
  promisedDate: z.iso.date(),
  promisedAmountCents: MoneyPublicSchema.nullable(),
  status: PaymentPromiseStatusSchema,
  source: PaymentPromiseSourceSchema,
  createdAt: z.iso.datetime({ offset: true }),
});

export const CollectionAttemptPublicSchema = z.object({
  publicId: z.uuid(),
  cycleNumber: z.number().int().min(1),
  attemptNumber: z.number().int().min(1),
  attemptType: CollectionAttemptTypeSchema,
  status: CollectionAttemptStatusSchema,
  scheduledAt: z.iso.datetime({ offset: true }),
  templateKey: z.string(),
  sentAt: z.iso.datetime({ offset: true }).nullable(),
  respondedAt: z.iso.datetime({ offset: true }).nullable(),
  skippedAt: z.iso.datetime({ offset: true }).nullable(),
  skipReason: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});

export const CollectionAttemptListResponseSchema = z.object({
  items: z.array(CollectionAttemptPublicSchema),
});

export type DebtPublic = z.infer<typeof DebtPublicSchema>;
export type CreateManualDebtRequest = z.infer<typeof CreateManualDebtRequestSchema>;
export type CreateDebtFromAppointmentRequest = z.infer<typeof CreateDebtFromAppointmentRequestSchema>;
export type UpdateDebtRequest = z.infer<typeof UpdateDebtRequestSchema>;
export type PauseDebtRequest = z.infer<typeof PauseDebtRequestSchema>;
export type CancelDebtRequest = z.infer<typeof CancelDebtRequestSchema>;
export type CollectionRulePublic = z.infer<typeof CollectionRulePublicSchema>;
export type CreateCollectionRuleRequest = z.infer<typeof CreateCollectionRuleRequestSchema>;
export type UpdateCollectionRuleRequest = z.infer<typeof UpdateCollectionRuleRequestSchema>;
export type PaymentPromisePublic = z.infer<typeof PaymentPromisePublicSchema>;
export type CollectionAttemptPublic = z.infer<typeof CollectionAttemptPublicSchema>;
