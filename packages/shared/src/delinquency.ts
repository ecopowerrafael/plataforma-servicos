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
  paidCents: MoneyPublicSchema,
  balanceCents: MoneyPublicSchema,
});

export const DelinquencyResponseSchema = z.object({
  items: z.array(DelinquentAppointmentSchema),
  totalBalanceCents: MoneyPublicSchema,
});

export type DelinquencyQuery = z.infer<typeof DelinquencyQuerySchema>;
export type DelinquentAppointment = z.infer<typeof DelinquentAppointmentSchema>;
