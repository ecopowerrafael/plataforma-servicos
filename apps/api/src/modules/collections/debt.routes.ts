import {
  CancelDebtRequestSchema,
  CreateDebtFromAppointmentRequestSchema,
  CreateManualDebtRequestSchema,
  DebtListResponseSchema,
  DebtPublicSchema,
  PauseDebtRequestSchema,
  UpdateDebtRequestSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type DebtService } from './debt.service.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';

const debtParams = z.object({ publicId: z.uuid() });

export const debtRoutes: FastifyPluginAsyncZod<{
  service: DebtService;
  authService: AuthService;
  cookieName: string;
  client?: PrismaClient;
}> = async (app, o) => {
  await app.register(tenantContextPlugin, { authService: o.authService, cookieName: o.cookieName, client: o.client });
  const actor = (r: { auth: { user: { id: bigint }; session: { id: bigint } } }) => ({
    userId: r.auth.user.id,
    sessionId: r.auth.session.id,
  });

  app.get('/tenant/debts', { schema: { response: { 200: DebtListResponseSchema } } }, (r) => {
    o.authService.requirePermission(r.tenant, 'collection.read');
    return o.service.list(r.tenant.id);
  });

  app.get(
    '/tenant/debts/:publicId',
    { schema: { params: debtParams, response: { 200: DebtPublicSchema } } },
    (r) => {
      o.authService.requirePermission(r.tenant, 'collection.read');
      return o.service.detail(r.tenant.id, r.params.publicId);
    },
  );

  app.post(
    '/tenant/debts',
    { schema: { body: CreateManualDebtRequestSchema, response: { 201: DebtPublicSchema } } },
    async (r, reply) => {
      o.authService.requirePermission(r.tenant, 'collection.manage');
      const created = await o.service.createManual(r.tenant.id, r.body, actor(r));
      return reply.status(201).send(created);
    },
  );

  app.post(
    '/tenant/debts/from-appointment',
    {
      schema: {
        body: CreateDebtFromAppointmentRequestSchema,
        response: { 201: DebtPublicSchema },
      },
    },
    async (r, reply) => {
      o.authService.requirePermission(r.tenant, 'collection.manage');
      const created = await o.service.createFromAppointment(r.tenant.id, r.body, actor(r));
      return reply.status(201).send(created);
    },
  );

  app.patch(
    '/tenant/debts/:publicId',
    {
      schema: {
        params: debtParams,
        body: UpdateDebtRequestSchema,
        response: { 200: DebtPublicSchema },
      },
    },
    (r) => {
      o.authService.requirePermission(r.tenant, 'collection.manage');
      return o.service.update(r.tenant.id, r.params.publicId, r.body, actor(r));
    },
  );

  app.post(
    '/tenant/debts/:publicId/pause',
    {
      schema: {
        params: debtParams,
        body: PauseDebtRequestSchema,
        response: { 200: DebtPublicSchema },
      },
    },
    (r) => {
      o.authService.requirePermission(r.tenant, 'collection.manage');
      return o.service.pause(r.tenant.id, r.params.publicId, r.body, actor(r));
    },
  );

  app.post(
    '/tenant/debts/:publicId/resume',
    { schema: { params: debtParams, response: { 200: DebtPublicSchema } } },
    (r) => {
      o.authService.requirePermission(r.tenant, 'collection.manage');
      return o.service.resume(r.tenant.id, r.params.publicId, actor(r));
    },
  );

  app.post(
    '/tenant/debts/:publicId/cancel',
    {
      schema: {
        params: debtParams,
        body: CancelDebtRequestSchema,
        response: { 200: DebtPublicSchema },
      },
    },
    (r) => {
      o.authService.requirePermission(r.tenant, 'collection.manage');
      return o.service.cancel(r.tenant.id, r.params.publicId, r.body, actor(r));
    },
  );
};
