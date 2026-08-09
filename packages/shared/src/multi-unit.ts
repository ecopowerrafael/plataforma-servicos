import { z } from 'zod';

export const MultiUnitOverviewQuerySchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .strict()
  .refine(({ from, to }) => from <= to, { message: 'Período inválido.' });

export const MultiUnitOverviewResponseSchema = z.object({
  units: z.array(
    z.object({
      unitPublicId: z.uuid(),
      unitName: z.string(),
      isHeadquarters: z.boolean(),
      appointments: z.number().int().nonnegative(),
      completedAppointments: z.number().int().nonnegative(),
      revenueCents: z.string().regex(/^\d+$/u),
      customers: z.number().int().nonnegative(),
      professionals: z.number().int().nonnegative(),
    }),
  ),
});
export type MultiUnitOverviewQuery = z.infer<typeof MultiUnitOverviewQuerySchema>;
