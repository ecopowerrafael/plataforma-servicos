import { FinancialReportQuerySchema, FinancialReportResponseSchema } from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { type FinancialReportService } from './financial-report.service.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';
import { type PrismaClient } from '../../database-client/client.js';

export const financialReportRoutes: FastifyPluginAsyncZod<{
  service: FinancialReportService;
  authService: AuthService;
  cookieName: string;
  client?: PrismaClient;
}> = async (app, o) => {
  await app.register(tenantContextPlugin, { authService: o.authService, cookieName: o.cookieName, client: o.client });

  app.get(
    '/tenant/financial-reports',
    {
      schema: {
        querystring: FinancialReportQuerySchema,
        response: { 200: FinancialReportResponseSchema },
      },
    },
    (r) => {
      o.authService.requirePermission(r.tenant, 'financial_report.read');
      return o.service.get(r.tenant.id, r.query);
    },
  );

  app.get(
    '/tenant/financial-reports/export',
    { schema: { querystring: FinancialReportQuerySchema } },
    async (r, reply) => {
      o.authService.requirePermission(r.tenant, 'financial_report.read');
      const report = await o.service.get(r.tenant.id, r.query);
      const csv = o.service.toCsv(report);
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', 'attachment; filename="relatorio-financeiro.csv"')
        .send(csv);
    },
  );
};
