import {
  FinanceOverviewQuerySchema,
  FinanceOverviewResponseSchema,
  FinancialReportQuerySchema,
  FinancialReportResponseSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { type FinanceOverviewService } from './finance-overview.service.js';
import { type FinancialReportService } from './financial-report.service.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';

export const financialReportRoutes: FastifyPluginAsyncZod<{
  service: FinancialReportService;
  overview?: FinanceOverviewService;
  authService: AuthService;
  cookieName: string;
  client?: PrismaClient;
}> = async (app, o) => {
  await app.register(tenantContextPlugin, { authService: o.authService, cookieName: o.cookieName, client: o.client });

  if (o.overview !== undefined) {
    const overview = o.overview;
    app.get(
      '/tenant/finance/overview',
      {
        schema: {
          querystring: FinanceOverviewQuerySchema,
          response: { 200: FinanceOverviewResponseSchema },
        },
      },
      (r) => {
        // Valores financeiros exigem leitura de pagamentos; caixa e comissões têm
        // permissões próprias e são omitidos da resposta quando faltam.
        o.authService.requirePermission(r.tenant, 'payment.read');
        return overview.overview(r.tenant.id, r.query, {
          includeCommissions: r.tenant.membership.permissions.includes('commission.read'),
          includeCash: r.tenant.membership.permissions.includes('cash.read'),
        });
      },
    );
  }

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
