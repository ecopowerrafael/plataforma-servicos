import { z } from 'zod';

export * from './tenant.js';
export * from './business-unit-operating-hours.js';
export * from './business-unit-date-overrides.js';
export * from './auth.js';
export * from './availability.js';
export * from './appointment.js';
export * from './appointment-waitlist.js';
export * from './appointment-history.js';
export * from './appointment-review.js';
export * from './customer-favorite.js';
export * from './platform.js';
export * from './business-profile.js';
export * from './service.js';
export * from './service-category.js';
export * from './service-variation.js';
export * from './combo.js';
export * from './professional.js';
export * from './professional-service.js';
export * from './professional-commission.js';
export * from './professional-unit.js';
export * from './professional-schedule.js';
export * from './professional-unavailability.js';
export * from './tenant-white-label.js';
export * from './tenant-domain.js';
export * from './customer.js';
export * from './customer-auth.js';
export * from './customer-profile.js';
export * from './public-booking.js';
export * from './tenant-subscription.js';
export * from './tenant-operations.js';
export * from './notification.js';
export * from './notification-template.js';
export * from './push-subscription.js';
export * from './payment.js';
export * from './payment-method.js';
export * from './cash-register.js';
export * from './receipt.js';
export * from './commission.js';
export * from './financial-closing.js';
export * from './delinquency.js';
export * from './financial-report.js';
export * from './payment-gateway.js';
export * from './tenant-payment-options.js';
export * from './automation.js';
export * from './customer-recovery.js';
export * from './multi-unit.js';
export * from './integration.js';

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  timestamp: z.iso.datetime({ offset: true }),
  uptime: z.number().nonnegative(),
});

export const ReadyResponseSchema = z.object({
  status: z.literal('ready'),
  database: z.literal('connected'),
  timestamp: z.iso.datetime({ offset: true }),
});

export const ErrorDetailSchema = z.object({
  path: z.string(),
  message: z.string(),
});

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]*$/u),
    message: z.string().min(1),
    requestId: z.string().min(1),
    details: z.array(ErrorDetailSchema).optional(),
  }),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type ReadyResponse = z.infer<typeof ReadyResponseSchema>;
export type ErrorDetail = z.infer<typeof ErrorDetailSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
