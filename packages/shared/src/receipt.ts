import { z } from 'zod';

const MoneyPublicSchema = z.string().regex(/^\d+$/u);

export const ReceiptPublicSchema = z.object({
  publicId: z.uuid(),
  number: z.string(),
  issuedAt: z.iso.datetime({ offset: true }),
  tenantLegalName: z.string(),
  tenantDisplayName: z.string(),
  customerName: z.string(),
  appointmentProtocol: z.string(),
  serviceName: z.string(),
  paymentMethodName: z.string(),
  paymentKind: z.enum(['PAYMENT', 'DEPOSIT']),
  amountCents: MoneyPublicSchema,
  paymentCreatedAt: z.iso.datetime({ offset: true }),
});

export type ReceiptPublic = z.infer<typeof ReceiptPublicSchema>;
