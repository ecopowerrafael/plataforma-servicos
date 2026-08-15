import { z } from 'zod';

export const CashRegisterStatusSchema = z.enum(['OPEN', 'CLOSED']);
export const CashMovementDirectionSchema = z.enum(['IN', 'OUT']);
export const CashMovementTypeSchema = z.enum(['MANUAL', 'PAYMENT']);

const MoneyInputSchema = z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const MoneyPublicSchema = z.string().regex(/^\d+$/u);

export const OpenCashRegisterRequestSchema = z
  .object({
    unitPublicId: z.uuid().nullable().optional(),
    openingBalanceCents: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
  })
  .strict();

export const CloseCashRegisterRequestSchema = z
  .object({ notes: z.string().trim().min(1).max(500).nullable().optional() })
  .strict();

export const CreateCashMovementRequestSchema = z
  .object({
    direction: CashMovementDirectionSchema,
    amountCents: MoneyInputSchema,
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export const CashMovementPublicSchema = z.object({
  publicId: z.uuid(),
  type: CashMovementTypeSchema,
  direction: CashMovementDirectionSchema,
  amountCents: MoneyPublicSchema,
  reason: z.string().nullable(),
  paymentPublicId: z.uuid().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  /* Contexto operacional do movimento; nulo quando nao se aplica. */
  userEmail: z.string().nullable().default(null),
  paymentMethodName: z.string().nullable().default(null),
  customerName: z.string().nullable().default(null),
  serviceName: z.string().nullable().default(null),
  appointmentPublicId: z.uuid().nullable().default(null),
});

export const CashRegisterPublicSchema = z.object({
  publicId: z.uuid(),
  unitPublicId: z.uuid().nullable(),
  status: CashRegisterStatusSchema,
  openingBalanceCents: MoneyPublicSchema,
  closingBalanceCents: MoneyPublicSchema.nullable(),
  balanceCents: MoneyPublicSchema,
  openedAt: z.iso.datetime({ offset: true }),
  closedAt: z.iso.datetime({ offset: true }).nullable(),
  notes: z.string().nullable(),
  openedByEmail: z.string().nullable().default(null),
  closedByEmail: z.string().nullable().default(null),
  /* Somatorios do caixa, para a tela nao recalcular. */
  totalInCents: MoneyPublicSchema.default('0'),
  totalOutCents: MoneyPublicSchema.default('0'),
  paymentInCents: MoneyPublicSchema.default('0'),
});

export const CashRegisterDetailResponseSchema = z.object({
  register: CashRegisterPublicSchema,
  movements: z.array(CashMovementPublicSchema),
});

export const CashRegisterListResponseSchema = z.object({
  items: z.array(CashRegisterPublicSchema),
});

export type OpenCashRegisterRequest = z.infer<typeof OpenCashRegisterRequestSchema>;
export type CloseCashRegisterRequest = z.infer<typeof CloseCashRegisterRequestSchema>;
export type CreateCashMovementRequest = z.infer<typeof CreateCashMovementRequestSchema>;
export type CashMovementPublic = z.infer<typeof CashMovementPublicSchema>;
export type CashRegisterPublic = z.infer<typeof CashRegisterPublicSchema>;
