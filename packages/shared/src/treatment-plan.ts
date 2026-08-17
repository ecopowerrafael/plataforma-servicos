import { z } from 'zod';

/**
 * Orçamento definido após a avaliação de um serviço sob orçamento. As sessões
 * continuam sendo agendamentos normais — o plano apenas as agrupa.
 */
export const TreatmentPlanStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELED',
]);
/** `TOTAL`: valor do tratamento inteiro. `PER_SESSION`: valor de cada sessão. */
export const TreatmentBillingModeSchema = z.enum(['TOTAL', 'PER_SESSION']);

const AmountInputSchema = z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const MoneyOutputSchema = z.string().regex(/^\d+$/u);

const planInputShape = {
  billingMode: TreatmentBillingModeSchema,
  amountCents: AmountInputSchema,
  /** Pode ficar em aberto quando ainda não dá para prever o total de sessões. */
  sessionsPlanned: z.coerce.number().int().min(1).max(200).nullable().optional(),
  returnIntervalDays: z.coerce.number().int().min(1).max(365).nullable().optional(),
  notes: z.string().trim().min(1).max(1000).nullable().optional(),
};

export const CreateTreatmentPlanRequestSchema = z
  .object({ ...planInputShape, appointmentPublicId: z.uuid() })
  .strict();
export const UpdateTreatmentPlanRequestSchema = z.object(planInputShape).strict();
export const CancelTreatmentPlanRequestSchema = z
  .object({ reason: z.string().trim().min(2).max(500).optional() })
  .strict();

/** Agendamento de uma sessão pelo próprio profissional, a partir do plano. */
export const CreateTreatmentSessionRequestSchema = z
  .object({
    startsAt: z.iso.datetime({ offset: true }),
    unitPublicId: z.uuid().nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

export const TreatmentPlanSessionSchema = z.object({
  appointmentPublicId: z.uuid(),
  sessionNumber: z.number().int().min(1),
  startsAt: z.iso.datetime({ offset: true }),
  status: z.enum(['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED', 'NO_SHOW']),
  priceCents: MoneyOutputSchema,
  paidCents: MoneyOutputSchema,
  balanceCents: MoneyOutputSchema,
});

export const TreatmentPlanPublicSchema = z.object({
  publicId: z.uuid(),
  status: TreatmentPlanStatusSchema,
  billingMode: TreatmentBillingModeSchema,
  amountCents: MoneyOutputSchema,
  /** Só existe em `PER_SESSION` com `sessionsPlanned` definido. */
  estimatedTotalCents: MoneyOutputSchema.nullable(),
  sessionsPlanned: z.number().int().nullable(),
  sessionsCompleted: z.number().int().nonnegative(),
  returnIntervalDays: z.number().int().nullable(),
  notes: z.string().nullable(),
  customerPublicId: z.uuid(),
  customerName: z.string(),
  servicePublicId: z.uuid(),
  serviceName: z.string(),
  professionalPublicId: z.uuid(),
  professionalName: z.string(),
  /** Avaliação que originou o plano — nunca conta como sessão. */
  originAppointmentPublicId: z.uuid(),
  /**
   * Só existe depois de uma sessão concluída: é a data da última sessão
   * concluída somada ao intervalo recomendado.
   */
  recommendedNextDate: z.iso.datetime({ offset: true }).nullable(),
  lastCompletedSessionAt: z.iso.datetime({ offset: true }).nullable(),
  /** Total efetivamente recebido nas sessões do plano. */
  paidCents: MoneyOutputSchema,
  sessions: z.array(TreatmentPlanSessionSchema),
  approvedAt: z.iso.datetime({ offset: true }).nullable(),
  startedAt: z.iso.datetime({ offset: true }).nullable(),
  completedAt: z.iso.datetime({ offset: true }).nullable(),
  canceledAt: z.iso.datetime({ offset: true }).nullable(),
  canceledReason: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const TreatmentPlanListResponseSchema = z.object({
  items: z.array(TreatmentPlanPublicSchema),
});

/**
 * Data recomendada para a próxima sessão: sempre a partir da conclusão real da
 * última sessão, nunca da avaliação, do orçamento ou do agendamento.
 */
export function recommendedNextDate(
  lastCompletedSessionAt: Date | null,
  returnIntervalDays: number | null,
): Date | null {
  if (lastCompletedSessionAt === null || returnIntervalDays === null) return null;
  return new Date(lastCompletedSessionAt.getTime() + returnIntervalDays * 86400000);
}

/** Total estimado só faz sentido quando o valor é por sessão e há previsão. */
export function estimatedTotalCents(
  billingMode: 'TOTAL' | 'PER_SESSION',
  amountCents: bigint,
  sessionsPlanned: number | null,
): bigint | null {
  if (billingMode !== 'PER_SESSION' || sessionsPlanned === null) return null;
  return amountCents * BigInt(sessionsPlanned);
}

export type CreateTreatmentPlanRequest = z.infer<typeof CreateTreatmentPlanRequestSchema>;
export type UpdateTreatmentPlanRequest = z.infer<typeof UpdateTreatmentPlanRequestSchema>;
export type TreatmentPlanPublic = z.infer<typeof TreatmentPlanPublicSchema>;
