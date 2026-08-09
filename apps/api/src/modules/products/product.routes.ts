import {
  CreateProductCategoryRequestSchema,
  CreateProductRequestSchema,
  ProductCategoryListResponseSchema,
  ProductCategoryPublicSchema,
  ProductListResponseSchema,
  ProductPublicSchema,
  ProductStockListResponseSchema,
  ProductStockPublicSchema,
  SetProductStockRequestSchema,
  UpdateProductCategoryRequestSchema,
  UpdateProductRequestSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type ProductCatalogService } from './product.service.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';

interface Options {
  service: ProductCatalogService;
  authService: AuthService;
  cookieName: string;
  client?: PrismaClient;
}
const Id = z.object({ publicId: z.uuid() }).strict();
const StockIds = z.object({ productPublicId: z.uuid(), unitPublicId: z.uuid() }).strict();
const StockQuery = z
  .object({ productPublicId: z.uuid().optional(), unitPublicId: z.uuid().optional() })
  .strict();
const actor = (request: { auth: { user: { id: bigint }; session: { id: bigint } } }) => ({
  userId: request.auth.user.id,
  sessionId: request.auth.session.id,
});
export const productRoutes: FastifyPluginAsyncZod<Options> = async (app, options) => {
  await app.register(tenantContextPlugin, {
    authService: options.authService,
    cookieName: options.cookieName,
    client: options.client,
  });
  app.get(
    '/tenant/product-categories',
    { schema: { response: { 200: ProductCategoryListResponseSchema } } },
    (request) => {
      options.authService.requirePermission(request.tenant, 'product.read');
      return options.service.listCategories(request.tenant.id);
    },
  );
  app.post(
    '/tenant/product-categories',
    {
      schema: {
        body: CreateProductCategoryRequestSchema,
        response: { 201: ProductCategoryPublicSchema },
      },
    },
    async (request, reply) => {
      options.authService.requirePermission(request.tenant, 'product.manage');
      return reply
        .status(201)
        .send(
          await options.service.createCategory(request.tenant.id, request.body, actor(request)),
        );
    },
  );
  app.patch(
    '/tenant/product-categories/:publicId',
    {
      schema: {
        params: Id,
        body: UpdateProductCategoryRequestSchema,
        response: { 200: ProductCategoryPublicSchema },
      },
    },
    (request) => {
      options.authService.requirePermission(request.tenant, 'product.manage');
      return options.service.updateCategory(
        request.tenant.id,
        request.params.publicId,
        request.body,
        actor(request),
      );
    },
  );
  app.get(
    '/tenant/products',
    { schema: { response: { 200: ProductListResponseSchema } } },
    (request) => {
      options.authService.requirePermission(request.tenant, 'product.read');
      return options.service.listProducts(request.tenant.id);
    },
  );
  app.post(
    '/tenant/products',
    { schema: { body: CreateProductRequestSchema, response: { 201: ProductPublicSchema } } },
    async (request, reply) => {
      options.authService.requirePermission(request.tenant, 'product.manage');
      return reply
        .status(201)
        .send(await options.service.createProduct(request.tenant.id, request.body, actor(request)));
    },
  );
  app.patch(
    '/tenant/products/:publicId',
    {
      schema: {
        params: Id,
        body: UpdateProductRequestSchema,
        response: { 200: ProductPublicSchema },
      },
    },
    (request) => {
      options.authService.requirePermission(request.tenant, 'product.manage');
      return options.service.updateProduct(
        request.tenant.id,
        request.params.publicId,
        request.body,
        actor(request),
      );
    },
  );
  app.get(
    '/tenant/product-stock',
    { schema: { querystring: StockQuery, response: { 200: ProductStockListResponseSchema } } },
    (request) => {
      options.authService.requirePermission(request.tenant, 'stock.read');
      return options.service.listStock(
        request.tenant.id,
        request.query.productPublicId,
        request.query.unitPublicId,
      );
    },
  );
  app.patch(
    '/tenant/products/:productPublicId/units/:unitPublicId/stock',
    {
      schema: {
        params: StockIds,
        body: SetProductStockRequestSchema,
        response: { 200: ProductStockPublicSchema },
      },
    },
    (request) => {
      options.authService.requirePermission(request.tenant, 'stock.manage');
      return options.service.setStock(
        request.tenant.id,
        request.params.productPublicId,
        request.params.unitPublicId,
        request.body,
        actor(request),
      );
    },
  );
};
