import {
  CreateCustomerRequestSchema,
  CustomerListResponseSchema,
  CustomerPublicSchema,
  CustomerStatusResponseSchema,
  TenantCustomFieldsResponseSchema,
  UpdateCustomerRequestSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type CustomerService } from './customer.service.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';
import { type PrismaClient } from '../../database-client/client.js';
const params = z.object({ publicId: z.uuid() });
const query = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).optional(),
  active: z.enum(['true', 'false']).optional(),
  unitPublicId: z.uuid().optional(),
  orderBy: z.enum(['name', 'createdAt']).default('name'),
  direction: z.enum(['asc', 'desc']).default('asc'),
});
export const customerRoutes: FastifyPluginAsyncZod<{
  service: CustomerService;
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
    '/tenant/customer-fields',
    { schema: { response: { 200: TenantCustomFieldsResponseSchema } } },
    (r) => {
      o.authService.requirePermission(r.tenant, 'customer.read');
      return o.service.customFields(r.tenant.id);
    },
  );
  app.get(
    '/tenant/customers',
    { schema: { querystring: query, response: { 200: CustomerListResponseSchema } } },
    (r) => {
      o.authService.requirePermission(r.tenant, 'customer.read');
      return o.service.list(r.tenant.id, {
        ...r.query,
        status: r.query.active === undefined ? undefined : r.query.active === 'true',
      });
    },
  );
  app.get(
    '/tenant/customers/:publicId',
    { schema: { params, response: { 200: CustomerPublicSchema } } },
    (r) => {
      o.authService.requirePermission(r.tenant, 'customer.read');
      return o.service.get(r.tenant.id, r.params.publicId);
    },
  );
  app.post(
    '/tenant/customers',
    { schema: { body: CreateCustomerRequestSchema, response: { 201: CustomerPublicSchema } } },
    async (r, reply) => {
      o.authService.requirePermission(r.tenant, 'customer.create');
      return reply.status(201).send(await o.service.create(r.tenant.id, r.body, actor(r)));
    },
  );
  app.patch(
    '/tenant/customers/:publicId',
    {
      schema: {
        params,
        body: UpdateCustomerRequestSchema,
        response: { 200: CustomerPublicSchema },
      },
    },
    (r) => {
      o.authService.requirePermission(r.tenant, 'customer.update');
      return o.service.update(r.tenant.id, r.params.publicId, r.body, actor(r));
    },
  );
  for (const [path, active] of [
    ['activate', true],
    ['deactivate', false],
  ] as const)
    app.post(
      `/tenant/customers/:publicId/${path}`,
      { schema: { params, response: { 200: CustomerStatusResponseSchema } } },
      async (r) => {
        o.authService.requirePermission(r.tenant, 'customer.status.manage');
        await o.service.status(r.tenant.id, r.params.publicId, active, actor(r));
        return { success: true } as const;
      },
    );
};
