import { z } from 'zod';

export const ProfessionalPayoutMethodSchema = z.enum(['PIX', 'CASH', 'BANK_TRANSFER', 'OTHER']);
export const ProfessionalPayoutStatusSchema = z.enum(['ACTIVE', 'CANCELED']);
export const ProfessionalPayoutPaymentStatusSchema = z.enum(['PENDING', 'PARTIALLY_PAID', 'PAID']);

export const ProfessionalPayoutSchema = z.object({
  publicId: z.uuid(),
  amountCents: z.string().regex(/^\d+$/u),
  paidAt: z.string().datetime({ offset: true }),
  method: ProfessionalPayoutMethodSchema,
  note: z.string().nullable(),
  status: ProfessionalPayoutStatusSchema,
  canceledAt: z.string().datetime({ offset: true }).nullable(),
  canceledReason: z.string().nullable(),
});

export const ProfessionalPayoutSettlementSchema = z.object({
  allocationPublicId: z.uuid(),
  professionalPublicId: z.uuid(),
  professionalName: z.string(),
  dueCents: z.string().regex(/^\d+$/u),
  paidCents: z.string().regex(/^\d+$/u),
  outstandingCents: z.string().regex(/^\d+$/u),
  paymentStatus: ProfessionalPayoutPaymentStatusSchema,
  payouts: z.array(ProfessionalPayoutSchema),
});

export const ProfessionalPayoutCreateSchema = z.object({
  amountCents: z.string().regex(/^[1-9]\d*$/u),
  paidAt: z.string().datetime({ offset: true }),
  method: ProfessionalPayoutMethodSchema,
  note: z.string().max(500).nullable().optional(),
  idempotencyKey: z.string().min(1).max(191),
}).superRefine((value, ctx) => {
  if (value.method === 'OTHER' && !value.note?.trim()) ctx.addIssue({ code: 'custom', path: ['note'], message: 'Observação é obrigatória para o método OTHER.' });
});

export const ProfessionalPayoutCancelSchema = z.object({ reason: z.string().trim().min(1).max(500) });
export const ProfessionalPayoutListResponseSchema = ProfessionalPayoutSettlementSchema;

export type ProfessionalPayoutCreate = z.infer<typeof ProfessionalPayoutCreateSchema>;
export type ProfessionalPayoutCancel = z.infer<typeof ProfessionalPayoutCancelSchema>;
export type ProfessionalPayoutSettlement = z.infer<typeof ProfessionalPayoutSettlementSchema>;
