import {
  CollectionRuleListResponseSchema,
  CollectionRulePublicSchema,
  CreateCollectionRuleRequestSchema,
  UpdateCollectionRuleRequestSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type CollectionRuleService } from './collection-rule.service.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';

const collectionRuleParams = z.object({ publicId: z.uuid() });

export const collectionRuleRoutes: FastifyPluginAsyncZod<{
  service: CollectionRuleService;
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
    '/tenant/collection-rules',
    { schema: { response: { 200: CollectionRuleListResponseSchema } } },
    (r) => {
      o.authService.requirePermission(r.tenant, 'collection.read');
      return o.service.list(r.tenant.id);
    },
  );

  app.post(
    '/tenant/collection-rules',
    { schema: { body: CreateCollectionRuleRequestSchema, response: { 201: CollectionRulePublicSchema } } },
    async (r, reply) => {
      o.authService.requirePermission(r.tenant, 'collection.manage');
      const created = await o.service.create(r.tenant.id, r.body, actor(r));
      return reply.status(201).send(created);
    },
  );

  app.patch(
    '/tenant/collection-rules/:publicId',
    {
      schema: {
        params: collectionRuleParams,
        body: UpdateCollectionRuleRequestSchema,
        response: { 200: CollectionRulePublicSchema },
      },
    },
    (r) => {
      o.authService.requirePermission(r.tenant, 'collection.manage');
      return o.service.update(r.tenant.id, r.params.publicId, r.body, actor(r));
    },
  );
};
