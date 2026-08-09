import { z } from 'zod';

const AppointmentStatusCountsSchema = z.object({
  PENDING: z.number().int().nonnegative(),
  CONFIRMED: z.number().int().nonnegative(),
  IN_PROGRESS: z.number().int().nonnegative(),
  COMPLETED: z.number().int().nonnegative(),
  CANCELED: z.number().int().nonnegative(),
  NO_SHOW: z.number().int().nonnegative(),
});

const ProfessionalBreakdownSchema = z.object({
  professionalPublicId: z.uuid(),
  professionalName: z.string(),
  total: z.number().int().nonnegative(),
});

const UnitBreakdownSchema = z.object({
  unitPublicId: z.uuid().nullable(),
  unitName: z.string(),
  total: z.number().int().nonnegative(),
});

const ServiceBreakdownSchema = z.object({
  servicePublicId: z.uuid(),
  serviceName: z.string(),
  total: z.number().int().nonnegative(),
});

export const TenantDashboardQuerySchema = z.object({ date: z.iso.date().optional() }).strict();

export const TenantDashboardResponseSchema = z.object({
  date: z.iso.date(),
  today: z.object({
    total: z.number().int().nonnegative(),
    upcoming: z.number().int().nonnegative(),
    byStatus: AppointmentStatusCountsSchema,
    checkedIn: z.number().int().nonnegative(),
    fitIn: z.number().int().nonnegative(),
    byProfessional: z.array(ProfessionalBreakdownSchema),
    byUnit: z.array(UnitBreakdownSchema),
  }),
});

export const TenantReportQuerySchema = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
  })
  .strict();

export const TenantReportResponseSchema = z.object({
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
  total: z.number().int().nonnegative(),
  byStatus: AppointmentStatusCountsSchema,
  byProfessional: z.array(ProfessionalBreakdownSchema),
  byService: z.array(ServiceBreakdownSchema),
  byUnit: z.array(UnitBreakdownSchema),
  newCustomers: z.number().int().nonnegative(),
  cancellationRate: z.number().min(0).max(1),
  noShowRate: z.number().min(0).max(1),
});

export type TenantDashboardResponse = z.infer<typeof TenantDashboardResponseSchema>;
export type TenantReportQuery = z.infer<typeof TenantReportQuerySchema>;
export type TenantReportResponse = z.infer<typeof TenantReportResponseSchema>;
