import {
  RecoveryEligibleListResponseSchema,
  RecoveryExecutionListResponseSchema,
  RecoveryRuleListResponseSchema,
  RecoveryRulePublicSchema,
  RecoveryRuleSchema,
  RecoveryRunResponseSchema,
  UpdateRecoveryRuleSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type CustomerRecoveryService } from './customer-recovery.service.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';

const pub = (item: { publicId: string; rule: string; active: boolean; days: number }) =>
  RecoveryRulePublicSchema.parse(item);
export const customerRecoveryRoutes: FastifyPluginAsyncZod<{
  service: CustomerRecoveryService;
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
    '/tenant/customer-recovery',
    { schema: { response: { 200: RecoveryRuleListResponseSchema } } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'automation.read');
      return { items: (await options.service.list(request.tenant.id)).map(pub) };
    },
  );
  app.get(
    '/tenant/customer-recovery/eligible',
    {
      schema: {
        querystring: z.object({ rule: RecoveryRuleSchema }).strict(),
        response: { 200: RecoveryEligibleListResponseSchema },
      },
    },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'automation.read');
      return { items: await options.service.eligible(request.tenant.id, request.query.rule) };
    },
  );
  app.get(
    '/tenant/customer-recovery/executions',
    { schema: { response: { 200: RecoveryExecutionListResponseSchema } } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'automation.read');
      return {
        items: (await options.service.executions(request.tenant.id)).map((item) => ({
          publicId: item.publicId,
          customerPublicId: item.customer.publicId,
          rule: item.rule.rule,
          periodKey: item.periodKey,
          status: item.status,
          error: item.error,
          createdAt: item.createdAt.toISOString(),
        })),
      };
    },
  );
  app.post(
    '/tenant/customer-recovery/run',
    { schema: { response: { 200: RecoveryRunResponseSchema } } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'automation.manage');
      return { processed: await options.service.run(new Date(), request.tenant.id) };
    },
  );
  app.put(
    '/tenant/customer-recovery/:rule',
    {
      schema: {
        params: z.object({ rule: RecoveryRuleSchema }).strict(),
        body: UpdateRecoveryRuleSchema,
        response: { 200: RecoveryRulePublicSchema },
      },
    },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'automation.manage');
      return pub(
        await options.service.update(request.tenant.id, request.params.rule, request.body, {
          userId: request.auth.user.id,
          sessionId: request.auth.session.id,
        }),
      );
    },
  );
};
