import { z } from 'zod';

import { CommissionTypeSchema } from './professional.js';

export const ProfessionalCommissionServiceSchema = z.object({
  servicePublicId: z.uuid(),
  serviceName: z.string(),
  active: z.boolean(),
  overrideCommissionType: CommissionTypeSchema.nullable(),
  overrideCommissionValue: z.number().int().nullable(),
  effectiveCommissionType: CommissionTypeSchema,
  effectiveCommissionValue: z.number().int(),
});

export const ProfessionalCommissionResponseSchema = z.object({
  defaultCommissionType: CommissionTypeSchema,
  defaultCommissionValue: z.number().int(),
  services: z.array(ProfessionalCommissionServiceSchema),
});
