import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { CustomerMembershipRepository } from './customer-membership.repository.js';
import { CustomerMembershipService } from './customer-membership.service.js';
import { CustomerMembershipChargeRepository } from './customer-membership-charge.repository.js';
import { CustomerMembershipChargeService } from './customer-membership-charge.service.js';
import { type AuthService } from '../auth/auth.service.js';

interface Options {
  authService: AuthService;
  client: PrismaClient;
}

const UuidParamSchema = z.object({ publicId: z.uuid() }).strict();
const CreateMembershipSchema = z.object({ planPublicId: z.uuid() }).strict();

export const customerMembershipRoutes: FastifyPluginAsyncZod<Options> = async (app, options) => {
  const repository = new CustomerMembershipRepository(options.client);
  const chargeRepository = new CustomerMembershipChargeRepository(options.client);
  const chargeService = new CustomerMembershipChargeService(chargeRepository);
  const service = new CustomerMembershipService(repository, chargeService);

  app.get<{ Params: z.infer<typeof UuidParamSchema> }>(
    '/tenant/customers/:publicId/membership',
    { schema: { params: UuidParamSchema } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'tenant.read');
      options.authService.requireCapability(request.tenant, 'memberships.manage');
      const customer = await repository.findCustomer(request.tenant.id, request.params.publicId);
      if (customer === null)
        throw new AppError({
          code: 'CUSTOMER_NOT_FOUND',
          message: 'Cliente não encontrado.',
          statusCode: 404,
        });
      const membership = await repository.findByCustomer(request.tenant.id, customer.id);
      if (membership === null)
        throw new AppError({
          code: 'CUSTOMER_MEMBERSHIP_NOT_FOUND',
          message: 'Assinatura não encontrada.',
          statusCode: 404,
        });
      return {
        publicId: membership.publicId,
        customerPublicId: request.params.publicId,
        planPublicId: membership.plan.publicId,
        planName: membership.plan.name,
        status: membership.status,
        startedAt: membership.startedAt?.toISOString() ?? null,
        currentPeriodStart: membership.currentPeriodStart?.toISOString() ?? null,
        currentPeriodEnd: membership.currentPeriodEnd?.toISOString() ?? null,
        nextBillingAt: membership.nextBillingAt?.toISOString() ?? null,
        cancelAtPeriodEnd: membership.cancelAtPeriodEnd,
        createdAt: membership.createdAt.toISOString(),
        updatedAt: membership.updatedAt.toISOString(),
      };
    },
  );

  app.post<{
    Params: z.infer<typeof UuidParamSchema>;
    Body: z.infer<typeof CreateMembershipSchema>;
  }>(
    '/tenant/customers/:publicId/membership',
    { schema: { params: UuidParamSchema, body: CreateMembershipSchema } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'tenant.update');
      options.authService.requireCapability(request.tenant, 'memberships.manage');
      const membership = await service.create(
        request.tenant.id,
        request.params.publicId,
        request.body.planPublicId,
        {
          userId: request.auth.user.id,
          sessionId: request.auth.session.id,
        },
      );
      return {
        publicId: membership.publicId,
        customerPublicId: request.params.publicId,
        planPublicId: membership.plan.publicId,
        planName: membership.plan.name,
        status: membership.status,
        startedAt: membership.startedAt?.toISOString() ?? null,
        currentPeriodStart: membership.currentPeriodStart?.toISOString() ?? null,
        currentPeriodEnd: membership.currentPeriodEnd?.toISOString() ?? null,
        nextBillingAt: membership.nextBillingAt?.toISOString() ?? null,
        cancelAtPeriodEnd: membership.cancelAtPeriodEnd,
        createdAt: membership.createdAt.toISOString(),
        updatedAt: membership.updatedAt.toISOString(),
      };
    },
  );
};
