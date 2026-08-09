import {
  CashRegisterDetailResponseSchema,
  CashRegisterListResponseSchema,
  CashRegisterPublicSchema,
  CashMovementPublicSchema,
  CloseCashRegisterRequestSchema,
  CreateCashMovementRequestSchema,
  OpenCashRegisterRequestSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type CashRegisterService } from './cash-register.service.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';

const params = z.object({ publicId: z.uuid() });
const openQuery = z.object({ unitPublicId: z.uuid().optional() });

export const cashRegisterRoutes: FastifyPluginAsyncZod<{
  service: CashRegisterService;
  authService: AuthService;
  cookieName: string;
}> = async (app, o) => {
  await app.register(tenantContextPlugin, { authService: o.authService, cookieName: o.cookieName });
  const actor = (r: { auth: { user: { id: bigint }; session: { id: bigint } } }) => ({
    userId: r.auth.user.id,
    sessionId: r.auth.session.id,
  });

  app.get(
    '/tenant/cash-registers',
    { schema: { response: { 200: CashRegisterListResponseSchema } } },
    (r) => {
      o.authService.requirePermission(r.tenant, 'cash.read');
      return o.service.list(r.tenant.id);
    },
  );

  app.get(
    '/tenant/cash-registers/open',
    {
      schema: {
        querystring: openQuery,
        response: { 200: CashRegisterDetailResponseSchema.nullable() },
      },
    },
    (r) => {
      o.authService.requirePermission(r.tenant, 'cash.read');
      return o.service.getOpen(r.tenant.id, r.query.unitPublicId ?? null);
    },
  );

  app.get(
    '/tenant/cash-registers/:publicId',
    { schema: { params, response: { 200: CashRegisterDetailResponseSchema } } },
    (r) => {
      o.authService.requirePermission(r.tenant, 'cash.read');
      return o.service.get(r.tenant.id, r.params.publicId);
    },
  );

  app.post(
    '/tenant/cash-registers/open',
    {
      schema: {
        body: OpenCashRegisterRequestSchema,
        response: { 201: CashRegisterPublicSchema },
      },
    },
    async (r, reply) => {
      o.authService.requirePermission(r.tenant, 'cash.manage');
      const created = await o.service.open(r.tenant.id, r.body, actor(r));
      return reply.status(201).send(created);
    },
  );

  app.post(
    '/tenant/cash-registers/:publicId/close',
    {
      schema: {
        params,
        body: CloseCashRegisterRequestSchema,
        response: { 200: CashRegisterPublicSchema },
      },
    },
    (r) => {
      o.authService.requirePermission(r.tenant, 'cash.manage');
      return o.service.close(r.tenant.id, r.params.publicId, r.body, actor(r));
    },
  );

  app.post(
    '/tenant/cash-registers/:publicId/movements',
    {
      schema: {
        params,
        body: CreateCashMovementRequestSchema,
        response: { 201: CashMovementPublicSchema },
      },
    },
    async (r, reply) => {
      o.authService.requirePermission(r.tenant, 'cash.manage');
      const created = await o.service.addMovement(r.tenant.id, r.params.publicId, r.body, actor(r));
      return reply.status(201).send(created);
    },
  );
};
