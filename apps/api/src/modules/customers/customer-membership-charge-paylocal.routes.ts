import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { CustomerMembershipChargeRepository } from './customer-membership-charge.repository.js';
import { CustomerMembershipPaymentSyncService } from './customer-membership-payment-sync.service.js';
import { type AuthService } from '../auth/auth.service.js';

interface Options {
  authService: AuthService;
  client: PrismaClient;
}

const ChargeParamSchema = z.object({ chargePublicId: z.uuid() }).strict();

export const customerMembershipChargePayLocalRoutes: FastifyPluginAsyncZod<Options> = async (
  app,
  options,
) => {
  const repository = new CustomerMembershipChargeRepository(options.client);
  const syncService = new CustomerMembershipPaymentSyncService(options.client);

  app.post<{ Params: z.infer<typeof ChargeParamSchema> }>(
    '/tenant/customer-membership-charges/:chargePublicId/payments/local/confirm',
    { schema: { params: ChargeParamSchema } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'payment.manage');
      options.authService.requireCapability(request.tenant, 'memberships.manage');

      const charge = await repository.find(request.tenant.id, request.params.chargePublicId);
      if (charge === null) {
        throw new AppError({
          code: 'CUSTOMER_MEMBERSHIP_CHARGE_NOT_FOUND',
          message: 'Cobrança não encontrada.',
          statusCode: 404,
        });
      }

      if (charge.status === 'PAID') {
        throw new AppError({
          code: 'CUSTOMER_MEMBERSHIP_CHARGE_ALREADY_PAID',
          message: 'Esta cobrança já foi paga.',
          statusCode: 409,
        });
      }

      const paidAt = new Date();
      await syncService.syncMembershipFromPayment(charge.id, paidAt, {
        userId: request.auth.user.id,
        sessionId: request.auth.session.id,
      });

      const updated = await repository.find(request.tenant.id, request.params.chargePublicId);
      return {
        publicId: updated!.publicId,
        status: updated!.status,
        paidAt: updated!.paidAt?.toISOString() ?? null,
      };
    },
  );
};
