import { CommissionCycleListResponseSchema, CommissionCycleSchema } from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type CommissionCycleService } from './commission-cycle.service.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';

const params = z.object({ publicId: z.uuid() });

export const commissionCycleRoutes: FastifyPluginAsyncZod<{
  service: CommissionCycleService;
  authService: AuthService;
  cookieName: string;
  client?: PrismaClient;
}> = async (app, o) => {
  await app.register(tenantContextPlugin, { authService: o.authService, cookieName: o.cookieName, client: o.client });
  const actor = (r: { auth: { user: { id: bigint }; session: { id: bigint } } }) => ({ userId: r.auth.user.id, sessionId: r.auth.session.id });
  app.get('/tenant/commission-cycles/current', { schema: { response: { 200: CommissionCycleSchema } } }, (r) => {
    o.authService.requirePermission(r.tenant, 'financial_closing.read');
    return o.service.current(r.tenant.id);
  });
  app.get('/tenant/commission-cycles', { schema: { response: { 200: CommissionCycleListResponseSchema } } }, (r) => {
    o.authService.requirePermission(r.tenant, 'financial_closing.read');
    return o.service.list(r.tenant.id);
  });
  app.get('/tenant/commission-cycles/:publicId', { schema: { params, response: { 200: CommissionCycleSchema } } }, (r) => {
    o.authService.requirePermission(r.tenant, 'financial_closing.read');
    return o.service.get(r.tenant.id, r.params.publicId);
  });
  app.post('/tenant/commission-cycles/:publicId/close', { schema: { params, response: { 200: CommissionCycleSchema } } }, (r) => {
    o.authService.requirePermission(r.tenant, 'financial_closing.manage');
    return o.service.close(r.tenant.id, r.params.publicId, actor(r));
  });
};
