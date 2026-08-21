import {
  CancelDebtRequestSchema,
  CreateDebtFromAppointmentRequestSchema,
  CreateManualDebtRequestSchema,
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

  app.get('/tenant/debts/summary', {}, (r) => {
    o.authService.requirePermission(r.tenant, 'collection.read');
    return o.service.getSummary(r.tenant.id);
  });

  app.get(
    '/tenant/debts/:publicId/full',
    { schema: { params: debtParams } },
    (r) => {
      o.authService.requirePermission(r.tenant, 'collection.read');
      return o.service.detailFull(r.tenant.id, r.params.publicId);
    },
  );

  app.get(
    '/tenant/debts/:publicId',
    { schema: { params: debtParams, response: { 200: DebtPublicSchema } } },
    (r) => {
      o.authService.requirePermission(r.tenant, 'collection.read');
      return o.service.detail(r.tenant.id, r.params.publicId);
    },
  );

  app.get(
    '/tenant/debts',
    {
      schema: {
        querystring: z.object({
          page: z.coerce.number().int().positive().optional(),
          pageSize: z.coerce.number().int().min(1).max(100).optional(),
          search: z.string().optional(),
          status: z.string().optional(),
          originType: z.enum(['MANUAL', 'APPOINTMENT']).optional(),
          hasActivePromise: z.coerce.boolean().optional(),
          hasPendingPix: z.coerce.boolean().optional(),
          dateFrom: z.string().datetime().optional(),
          dateTo: z.string().datetime().optional(),
        }),
      },
    },
    (r) => {
      o.authService.requirePermission(r.tenant, 'collection.read');
      const filters: Parameters<typeof o.service.listWithFilters>[1] = {};
      if (r.query.page !== undefined) filters.page = r.query.page;
      if (r.query.pageSize !== undefined) filters.pageSize = r.query.pageSize;
      if (r.query.search !== undefined) filters.search = r.query.search;
      if (r.query.status !== undefined) filters.status = r.query.status;
      if (r.query.originType !== undefined) filters.originType = r.query.originType;
      if (r.query.hasActivePromise !== undefined) filters.hasActivePromise = r.query.hasActivePromise;
      if (r.query.hasPendingPix !== undefined) filters.hasPendingPix = r.query.hasPendingPix;
      if (r.query.dateFrom !== undefined) filters.dateFrom = new Date(r.query.dateFrom);
      if (r.query.dateTo !== undefined) filters.dateTo = new Date(r.query.dateTo);
      return o.service.listWithFilters(r.tenant.id, filters);
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

  app.post(
    '/tenant/debts/:publicId/mark-human-support',
    { schema: { params: debtParams, response: { 200: DebtPublicSchema } } },
    async (r) => {
      o.authService.requirePermission(r.tenant, 'collection.manage');
      const debt = await o.service.findOwned(r.tenant.id, r.params.publicId);
      await o.service.markHumanSupport(r.tenant.id, debt.id);
      return o.service.detail(r.tenant.id, r.params.publicId);
    },
  );

  app.post(
    '/tenant/debts/:publicId/mark-disputed',
    { schema: { params: debtParams, response: { 200: DebtPublicSchema } } },
    async (r) => {
      o.authService.requirePermission(r.tenant, 'collection.manage');
      const debt = await o.service.findOwned(r.tenant.id, r.params.publicId);
      await o.service.markDisputed(r.tenant.id, debt.id);
      return o.service.detail(r.tenant.id, r.params.publicId);
    },
  );

  app.post(
    '/tenant/debts/:publicId/resume-from-human-support',
    { schema: { params: debtParams, response: { 200: DebtPublicSchema } } },
    async (r) => {
      o.authService.requirePermission(r.tenant, 'collection.manage');
      await o.service.resumeFromHumanSupport(r.tenant.id, r.params.publicId, actor(r));
      return o.service.detail(r.tenant.id, r.params.publicId);
    },
  );
};
