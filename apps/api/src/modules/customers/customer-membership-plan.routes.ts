import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateCustomerMembershipPlanRequestSchema,
  UpdateCustomerMembershipPlanRequestSchema,
} from '@plataforma/shared';
import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { CustomerMembershipPlanRepository } from './customer-membership-plan.repository.js';
import { CustomerMembershipPlanService } from './customer-membership-plan.service.js';
import { type AuthService } from '../auth/auth.service.js';

interface Options {
  authService: AuthService;
  client: PrismaClient;
}

const UuidParamSchema = z.object({ publicId: z.uuid() }).strict();

export const customerMembershipPlanRoutes: FastifyPluginAsyncZod<Options> = async (
  app,
  options,
) => {
  const repository = new CustomerMembershipPlanRepository(options.client);
  const service = new CustomerMembershipPlanService(repository);

  app.get<{ Params: z.infer<typeof UuidParamSchema> }>(
    '/tenant/customer-membership-plans',
    async (request) => {
      options.authService.requirePermission(request.tenant, 'tenant.read');
      options.authService.requireCapability(request.tenant, 'memberships.manage');
      return service.list(request.tenant.id);
    },
  );

  app.get<{ Params: z.infer<typeof UuidParamSchema> }>(
    '/tenant/customer-membership-plans/:publicId',
    { schema: { params: UuidParamSchema } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'tenant.read');
      options.authService.requireCapability(request.tenant, 'memberships.manage');
      return service.get(request.tenant.id, request.params.publicId);
    },
  );

  app.post<{ Body: z.infer<typeof CreateCustomerMembershipPlanRequestSchema> }>(
    '/tenant/customer-membership-plans',
    { schema: { body: CreateCustomerMembershipPlanRequestSchema } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'tenant.update');
      options.authService.requireCapability(request.tenant, 'memberships.manage');
      if (!request.tenant.membership.isOwner)
        throw new AppError({
          code: 'PERMISSION_DENIED',
          message: 'Apenas o proprietário pode gerenciar planos de assinatura.',
          statusCode: 403,
        });
      return service.create(request.tenant.id, request.body, {
        userId: request.auth.user.id,
        sessionId: request.auth.session.id,
      });
    },
  );

  app.patch<{
    Params: z.infer<typeof UuidParamSchema>;
    Body: z.infer<typeof UpdateCustomerMembershipPlanRequestSchema>;
  }>(
    '/tenant/customer-membership-plans/:publicId',
    { schema: { params: UuidParamSchema, body: UpdateCustomerMembershipPlanRequestSchema } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'tenant.update');
      options.authService.requireCapability(request.tenant, 'memberships.manage');
      if (!request.tenant.membership.isOwner)
        throw new AppError({
          code: 'PERMISSION_DENIED',
          message: 'Apenas o proprietário pode gerenciar planos de assinatura.',
          statusCode: 403,
        });
      return service.update(request.tenant.id, request.params.publicId, request.body, {
        userId: request.auth.user.id,
        sessionId: request.auth.session.id,
      });
    },
  );
};
