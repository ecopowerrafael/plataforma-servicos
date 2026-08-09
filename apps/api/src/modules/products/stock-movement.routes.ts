import {
  CreateStockMovementRequestSchema,
  StockMovementListResponseSchema,
  StockMovementPublicSchema,
  TransferStockRequestSchema,
  TransferStockResponseSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type StockMovementService } from './stock-movement.service.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';
import { type PrismaClient } from '../../database-client/client.js';

interface Options {
  service: StockMovementService;
  authService: AuthService;
  cookieName: string;
  client?: PrismaClient;
}
const Query = z
  .object({ productPublicId: z.uuid().optional(), unitPublicId: z.uuid().optional() })
  .strict();
const actor = (request: { auth: { user: { id: bigint }; session: { id: bigint } } }) => ({
  userId: request.auth.user.id,
  sessionId: request.auth.session.id,
});
export const stockMovementRoutes: FastifyPluginAsyncZod<Options> = async (app, options) => {
  await app.register(tenantContextPlugin, {
    authService: options.authService,
    cookieName: options.cookieName,
    client: options.client,
  });
  app.get(
    '/tenant/stock-movements',
    { schema: { querystring: Query, response: { 200: StockMovementListResponseSchema } } },
    (request) => {
      options.authService.requirePermission(request.tenant, 'stock.read');
      return options.service.list(
        request.tenant.id,
        request.query.productPublicId,
        request.query.unitPublicId,
      );
    },
  );
  app.post(
    '/tenant/stock-movements',
    {
      schema: {
        body: CreateStockMovementRequestSchema,
        response: { 201: StockMovementPublicSchema },
      },
    },
    async (request, reply) => {
      options.authService.requirePermission(request.tenant, 'stock.manage');
      return reply
        .status(201)
        .send(await options.service.create(request.tenant.id, request.body, actor(request)));
    },
  );
  app.post(
    '/tenant/stock-transfers',
    {
      schema: { body: TransferStockRequestSchema, response: { 201: TransferStockResponseSchema } },
    },
    async (request, reply) => {
      options.authService.requirePermission(request.tenant, 'stock.manage');
      return reply
        .status(201)
        .send(await options.service.transfer(request.tenant.id, request.body, actor(request)));
    },
  );
};
