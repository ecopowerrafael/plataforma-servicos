import {
  TenantDashboardQuerySchema,
  TenantDashboardResponseSchema,
  TenantReportQuerySchema,
  TenantReportResponseSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { type AppointmentOperationsService } from './appointment-operations.service.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';

export const appointmentOperationsRoutes: FastifyPluginAsyncZod<{
  service: AppointmentOperationsService;
  authService: AuthService;
  cookieName: string;
}> = async (app, o) => {
  await app.register(tenantContextPlugin, { authService: o.authService, cookieName: o.cookieName });

  app.get(
    '/tenant/dashboard',
    {
      schema: {
        querystring: TenantDashboardQuerySchema,
        response: { 200: TenantDashboardResponseSchema },
      },
    },
    (r) => {
      o.authService.requirePermission(r.tenant, 'appointment.read');
      return o.service.dashboard(r.tenant.id, r.query.date);
    },
  );

  app.get(
    '/tenant/reports',
    {
      schema: {
        querystring: TenantReportQuerySchema,
        response: { 200: TenantReportResponseSchema },
      },
    },
    (r) => {
      o.authService.requirePermission(r.tenant, 'appointment.read');
      return o.service.report(r.tenant.id, r.query.from, r.query.to, r.query.unitPublicId);
    },
  );
};
