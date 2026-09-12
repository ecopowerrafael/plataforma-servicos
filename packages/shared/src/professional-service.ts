import { z } from 'zod';

import { CommissionTypeSchema } from './professional.js';
const override = z
  .object({
    priceCents: z.coerce.number().int().min(0).nullable().optional(),
    durationMinutes: z.coerce.number().int().min(1).max(1440).nullable().optional(),
    hasPostServiceBreak: z.boolean().nullable().optional(),
    postServiceBreakMinutes: z.coerce.number().int().min(0).max(240).nullable().optional(),
    commissionType: CommissionTypeSchema.nullable().optional(),
    commissionValue: z.coerce.number().int().min(0).nullable().optional(),
  })
  .superRefine((v, c) => {
    if (v.hasPostServiceBreak === true && v.postServiceBreakMinutes === 0)
      c.addIssue({
        code: 'custom',
        path: ['postServiceBreakMinutes'],
        message: 'Informe uma pausa maior que zero.',
      });
    if (
      v.hasPostServiceBreak === false &&
      v.postServiceBreakMinutes !== null &&
      v.postServiceBreakMinutes !== undefined &&
      v.postServiceBreakMinutes !== 0
    )
      c.addIssue({
        code: 'custom',
        path: ['postServiceBreakMinutes'],
        message: 'A pausa deve ser zero quando desativada.',
      });
    if (
      (v.commissionType === null || v.commissionType === undefined) !==
      (v.commissionValue === null || v.commissionValue === undefined)
    )
      c.addIssue({
        code: 'custom',
        path: ['commissionValue'],
        message: 'Informe tipo e valor de comissão juntos, ou nenhum dos dois.',
      });
    if (v.commissionType === 'PERCENTAGE' && (v.commissionValue ?? 0) > 100)
      c.addIssue({
        code: 'custom',
        path: ['commissionValue'],
        message: 'A comissão percentual não pode ultrapassar 100.',
      });
  });
export const UpsertProfessionalServiceRequestSchema = override
  .extend({ servicePublicId: z.uuid(), active: z.boolean().default(true) })
  .strict();
export const BulkUpsertProfessionalServiceRequestSchema = z.object({
  desiredServicePublicIds: z.array(z.uuid()),
});
export const ProfessionalServicePublicSchema = override
  .extend({
    publicId: z.uuid(),
    professionalPublicId: z.uuid(),
    servicePublicId: z.uuid(),
    active: z.boolean(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export const ProfessionalServicesResponseSchema = z.object({
  items: z.array(ProfessionalServicePublicSchema),
});
export const ProfessionalServiceStatusResponseSchema = z.object({ success: z.literal(true) });
export type UpsertProfessionalServiceRequest = z.infer<
  typeof UpsertProfessionalServiceRequestSchema
>;
export type BulkUpsertProfessionalServiceRequest = z.infer<
  typeof BulkUpsertProfessionalServiceRequestSchema
>;
