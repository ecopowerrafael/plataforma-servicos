import {
  CreateProductSaleRequestSchema,
  ProductSaleListResponseSchema,
  ProductSalePublicSchema,
  ProductSaleQuerySchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { type ProductSaleService } from './product-sale.service.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';
export const productSaleRoutes: FastifyPluginAsyncZod<{
  service: ProductSaleService;
  authService: AuthService;
  cookieName: string;
}> = async (app, options) => {
  await app.register(tenantContextPlugin, {
    authService: options.authService,
    cookieName: options.cookieName,
  });
  app.get(
    '/tenant/product-sales',
    {
      schema: {
        querystring: ProductSaleQuerySchema,
        response: { 200: ProductSaleListResponseSchema },
      },
    },
    (request) => {
      options.authService.requirePermission(request.tenant, 'product_sale.read');
      return options.service.list(request.tenant.id, request.query);
    },
  );
  app.post(
    '/tenant/product-sales',
    {
      schema: { body: CreateProductSaleRequestSchema, response: { 201: ProductSalePublicSchema } },
    },
    async (request, reply) => {
      options.authService.requirePermission(request.tenant, 'product_sale.manage');
      return reply.status(201).send(
        await options.service.create(request.tenant.id, request.body, {
          userId: request.auth.user.id,
          sessionId: request.auth.session.id,
        }),
      );
    },
  );
};
