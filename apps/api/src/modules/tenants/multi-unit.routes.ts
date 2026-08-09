import { MultiUnitOverviewQuerySchema, MultiUnitOverviewResponseSchema } from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { type MultiUnitService } from './multi-unit.service.js';
import { tenantContextPlugin } from './tenant-context.plugin.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type AuthService } from '../auth/auth.service.js';

export const multiUnitRoutes: FastifyPluginAsyncZod<{
  service: MultiUnitService;
  authService: AuthService;
  cookieName: string;
  client?: PrismaClient;
}> = async (app, options) => {
  await app.register(tenantContextPlugin, {
    authService: options.authService,
    cookieName: options.cookieName,
    client: options.client,
  });
  app.get(
    '/tenant/multi-unit/overview',
    {
      schema: {
        querystring: MultiUnitOverviewQuerySchema,
        response: { 200: MultiUnitOverviewResponseSchema },
      },
    },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'unit.read');
      return options.service.overview(
        request.tenant.id,
        request.tenant.membership.unitPublicIds ?? null,
        request.query.from,
        request.query.to,
      );
    },
  );
};
