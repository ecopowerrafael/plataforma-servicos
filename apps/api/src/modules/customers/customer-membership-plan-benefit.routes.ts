import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateCustomerMembershipBenefitRequestSchema,
  UpdateCustomerMembershipBenefitRequestSchema,
} from '@plataforma/shared';
import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { CustomerMembershipPlanBenefitRepository } from './customer-membership-plan-benefit.repository.js';
import { CustomerMembershipPlanBenefitService } from './customer-membership-plan-benefit.service.js';
import { type AuthService } from '../auth/auth.service.js';

interface Options {
  authService: AuthService;
  client: PrismaClient;
}

const UuidParamSchema = z.object({ planPublicId: z.uuid(), publicId: z.uuid() }).strict();
const PlanParamSchema = z.object({ planPublicId: z.uuid() }).strict();

export const customerMembershipPlanBenefitRoutes: FastifyPluginAsyncZod<Options> = async (
  app,
  options,
) => {
  const repository = new CustomerMembershipPlanBenefitRepository(options.client);
  const service = new CustomerMembershipPlanBenefitService(repository);

  app.get<{ Params: z.infer<typeof PlanParamSchema> }>(
    '/tenant/customer-membership-plans/:planPublicId/benefits',
    { schema: { params: PlanParamSchema } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'tenant.read');
      return service.list(request.tenant.id, request.params.planPublicId);
    },
  );

  app.get<{ Params: z.infer<typeof UuidParamSchema> }>(
    '/tenant/customer-membership-plans/:planPublicId/benefits/:publicId',
    { schema: { params: UuidParamSchema } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'tenant.read');
      return service.get(
        request.tenant.id,
        request.params.planPublicId,
        request.params.publicId,
      );
    },
  );

  app.post<{ Params: z.infer<typeof PlanParamSchema>; Body: z.infer<typeof CreateCustomerMembershipBenefitRequestSchema> }>(
    '/tenant/customer-membership-plans/:planPublicId/benefits',
    { schema: { params: PlanParamSchema, body: CreateCustomerMembershipBenefitRequestSchema } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'tenant.update');
      if (!request.tenant.membership.isOwner)
        throw new AppError({
          code: 'PERMISSION_DENIED',
          message: 'Apenas o proprietário pode gerenciar planos de assinatura.',
          statusCode: 403,
        });
      return service.create(request.tenant.id, request.params.planPublicId, request.body, {
        userId: request.auth.user.id,
        sessionId: request.auth.session.id,
      });
    },
  );

  app.patch<{ Params: z.infer<typeof UuidParamSchema>; Body: z.infer<typeof UpdateCustomerMembershipBenefitRequestSchema> }>(
    '/tenant/customer-membership-plans/:planPublicId/benefits/:publicId',
    { schema: { params: UuidParamSchema, body: UpdateCustomerMembershipBenefitRequestSchema } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'tenant.update');
      if (!request.tenant.membership.isOwner)
        throw new AppError({
          code: 'PERMISSION_DENIED',
          message: 'Apenas o proprietário pode gerenciar planos de assinatura.',
          statusCode: 403,
        });
      return service.update(
        request.tenant.id,
        request.params.planPublicId,
        request.params.publicId,
        request.body,
        {
          userId: request.auth.user.id,
          sessionId: request.auth.session.id,
        },
      );
    },
  );

  app.delete<{ Params: z.infer<typeof UuidParamSchema> }>(
    '/tenant/customer-membership-plans/:planPublicId/benefits/:publicId',
    { schema: { params: UuidParamSchema } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'tenant.update');
      if (!request.tenant.membership.isOwner)
        throw new AppError({
          code: 'PERMISSION_DENIED',
          message: 'Apenas o proprietário pode gerenciar planos de assinatura.',
          statusCode: 403,
        });
      return service.delete(
        request.tenant.id,
        request.params.planPublicId,
        request.params.publicId,
        {
          userId: request.auth.user.id,
          sessionId: request.auth.session.id,
        },
      );
    },
  );
};
