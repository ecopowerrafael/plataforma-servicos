import {
  CancelFinancialClosingRequestSchema,
  CreateFinancialClosingRequestSchema,
  FinancialClosingListResponseSchema,
  FinancialClosingPublicSchema,
  FinancialClosingQuerySchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type FinancialClosingService } from './financial-closing.service.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';

const params = z.object({ publicId: z.uuid() });

export const financialClosingRoutes: FastifyPluginAsyncZod<{
  service: FinancialClosingService;
  authService: AuthService;
  cookieName: string;
  client?: PrismaClient;
}> = async (app, o) => {
  await app.register(tenantContextPlugin, { authService: o.authService, cookieName: o.cookieName, client: o.client });
  const actor = (r: { auth: { user: { id: bigint }; session: { id: bigint } } }) => ({
    userId: r.auth.user.id,
    sessionId: r.auth.session.id,
  });

  app.get(
    '/tenant/financial-closings',
    {
      schema: {
        querystring: FinancialClosingQuerySchema,
        response: { 200: FinancialClosingListResponseSchema },
      },
    },
    (r) => {
      o.authService.requirePermission(r.tenant, 'financial_closing.read');
      return o.service.list(r.tenant.id, r.query);
    },
  );

  app.get(
    '/tenant/financial-closings/:publicId',
    { schema: { params, response: { 200: FinancialClosingPublicSchema } } },
    (r) => {
      o.authService.requirePermission(r.tenant, 'financial_closing.read');
      return o.service.get(r.tenant.id, r.params.publicId);
    },
  );

  app.post(
    '/tenant/financial-closings',
    {
      schema: {
        body: CreateFinancialClosingRequestSchema,
        response: { 201: FinancialClosingPublicSchema },
      },
    },
    async (r, reply) => {
      o.authService.requirePermission(r.tenant, 'financial_closing.manage');
      const created = await o.service.create(r.tenant.id, r.body, actor(r));
      return reply.status(201).send(created);
    },
  );

  app.post(
    '/tenant/financial-closings/:publicId/cancel',
    {
      schema: {
        params,
        body: CancelFinancialClosingRequestSchema,
        response: { 200: FinancialClosingPublicSchema },
      },
    },
    (r) => {
      o.authService.requirePermission(r.tenant, 'financial_closing.manage');
      return o.service.cancel(r.tenant.id, r.params.publicId, r.body.reason, actor(r));
    },
  );
};
