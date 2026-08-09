import { z } from 'zod';

import { CommissionTypeSchema } from './professional.js';

export const CommissionRuleSourceSchema = z.enum(['OVERRIDE', 'DEFAULT']);
export const CommissionRecordStatusSchema = z.enum(['ACTIVE', 'CANCELED']);

const MoneyPublicSchema = z.string().regex(/^\d+$/u);

export const CommissionRecordPublicSchema = z.object({
  publicId: z.uuid(),
  paymentPublicId: z.uuid(),
  appointmentPublicId: z.uuid(),
  appointmentProtocol: z.string(),
  professionalPublicId: z.uuid(),
  professionalName: z.string(),
  serviceName: z.string(),
  commissionType: CommissionTypeSchema,
  commissionValue: z.number().int(),
  ruleSource: CommissionRuleSourceSchema,
  baseAmountCents: MoneyPublicSchema,
  commissionAmountCents: MoneyPublicSchema,
  status: CommissionRecordStatusSchema,
  canceledAt: z.iso.datetime({ offset: true }).nullable(),
  canceledReason: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});

export const CommissionListResponseSchema = z.object({
  items: z.array(CommissionRecordPublicSchema),
});

export const CommissionQuerySchema = z
  .object({
    professionalPublicId: z.uuid().optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

export type CommissionRecordPublic = z.infer<typeof CommissionRecordPublicSchema>;
export type CommissionQuery = z.infer<typeof CommissionQuerySchema>;
