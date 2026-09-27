import { CollectionAttemptListResponseSchema } from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type CollectionAttemptEngineService } from './collection-attempt.service.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';

const debtParams = z.object({ publicId: z.uuid() });

export const collectionAttemptRoutes: FastifyPluginAsyncZod<{
  service: CollectionAttemptEngineService;
  authService: AuthService;
  cookieName: string;
  client?: PrismaClient;
}> = async (app, o) => {
  await app.register(tenantContextPlugin, { authService: o.authService, cookieName: o.cookieName, client: o.client });

  app.get(
    '/tenant/debts/:publicId/attempts',
    { schema: { params: debtParams, response: { 200: CollectionAttemptListResponseSchema } } },
    (r) => {
      o.authService.requirePermission(r.tenant, 'collection.read');
      return o.service.listForDebt(r.tenant.id, r.params.publicId);
    },
  );
};
