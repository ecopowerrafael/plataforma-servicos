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
    unitPublicId: z.uuid().optional(),
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
  completed: z.number().int().nonnegative(),
  completionRate: z.number().min(0).max(1),
  completedRevenueCents: z.string(),
  returningCustomers: z.number().int().nonnegative(),
});

/* Visão da agenda: agregações operacionais do período, calculadas no servidor. */
export const AgendaOverviewQuerySchema = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    professionalPublicId: z.uuid().optional(),
    servicePublicId: z.uuid().optional(),
    unitPublicId: z.uuid().optional(),
    /** Deslocamento local do navegador (Date#getTimezoneOffset) para agrupar por hora local. */
    offsetMinutes: z.coerce.number().int().min(-840).max(840).default(0),
  })
  .strict();

export const AppointmentPaymentStateSchema = z.enum([
  'PAID',
  'PARTIAL',
  'ONLINE_PENDING',
  'ON_SITE',
]);

const MoneyCentsSchema = z.string().regex(/^\d+$/u);

export const AgendaOverviewResponseSchema = z.object({
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
  totals: z.object({
    appointments: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    confirmed: z.number().int().nonnegative(),
    inProgress: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    canceled: z.number().int().nonnegative(),
    noShow: z.number().int().nonnegative(),
  }),
  /** Nulo quando o usuário não tem permissão de leitura financeira. */
  financial: z
    .object({
      expectedCents: MoneyCentsSchema,
      receivedCents: MoneyCentsSchema,
      openCents: MoneyCentsSchema,
    })
    .nullable(),
  byStatus: z.array(
    z.object({
      status: z.enum(['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED', 'NO_SHOW']),
      total: z.number().int().nonnegative(),
    }),
  ),
  byProfessional: z.array(ProfessionalBreakdownSchema),
  byHour: z.array(
    z.object({ hour: z.number().int().min(0).max(23), total: z.number().int().nonnegative() }),
  ),
  /** Situação financeira por agendamento do período; vazio sem permissão financeira. */
  payments: z.array(
    z.object({
      appointmentPublicId: z.uuid(),
      expectedCents: MoneyCentsSchema,
      receivedCents: MoneyCentsSchema,
      state: AppointmentPaymentStateSchema,
    }),
  ),
});

export type AgendaOverviewResponse = z.infer<typeof AgendaOverviewResponseSchema>;
export type AppointmentPaymentState = z.infer<typeof AppointmentPaymentStateSchema>;
export type TenantDashboardResponse = z.infer<typeof TenantDashboardResponseSchema>;
export type TenantReportQuery = z.infer<typeof TenantReportQuerySchema>;
export type TenantReportResponse = z.infer<typeof TenantReportResponseSchema>;
