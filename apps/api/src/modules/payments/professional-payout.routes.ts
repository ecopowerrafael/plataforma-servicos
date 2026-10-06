import { ProfessionalPayoutCancelSchema, ProfessionalPayoutCreateSchema, ProfessionalPayoutSettlementSchema } from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { type PrismaClient } from '../../database-client/client.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';
import { type ProfessionalPayoutService } from './professional-payout.service.js';

const allocationParams = z.object({ publicId: z.uuid() });
const payoutParams = z.object({ publicId: z.uuid() });

export const professionalPayoutRoutes: FastifyPluginAsyncZod<{
  service: ProfessionalPayoutService;
  authService: AuthService;
  cookieName: string;
  client?: PrismaClient;
}> = async (app, o) => {
  await app.register(tenantContextPlugin, { authService: o.authService, cookieName: o.cookieName, client: o.client });
  const actor = (r: { auth: { user: { id: bigint }; session: { id: bigint } } }) => ({ userId: r.auth.user.id, sessionId: r.auth.session.id });
  app.get('/tenant/commission-cycle-allocations/:publicId/payouts', { schema: { params: allocationParams, response: { 200: ProfessionalPayoutSettlementSchema } } }, (r) => {
    o.authService.requirePermission(r.tenant, 'financial_closing.read');
    return o.service.list(r.tenant.id, r.params.publicId);
  });
  app.post('/tenant/commission-cycle-allocations/:publicId/payouts', { schema: { params: allocationParams, body: ProfessionalPayoutCreateSchema, response: { 200: ProfessionalPayoutSettlementSchema } } }, (r) => {
    o.authService.requirePermission(r.tenant, 'financial_closing.manage');
    o.authService.requirePermission(r.tenant, 'cash.manage');
    return o.service.create(r.tenant.id, r.params.publicId, r.body, actor(r));
  });
  app.post('/tenant/professional-payouts/:publicId/cancel', { schema: { params: payoutParams, body: ProfessionalPayoutCancelSchema, response: { 200: ProfessionalPayoutSettlementSchema } } }, (r) => {
    o.authService.requirePermission(r.tenant, 'financial_closing.manage');
    o.authService.requirePermission(r.tenant, 'cash.manage');
    return o.service.cancel(r.tenant.id, r.params.publicId, r.body, actor(r));
  });
};
