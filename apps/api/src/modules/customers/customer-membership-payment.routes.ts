import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { CustomerMembershipPaymentService } from './customer-membership-payment.service.js';
import { type AuthService } from '../auth/auth.service.js';

interface Options {
  authService: AuthService;
  client: PrismaClient;
}

const ChargeParamSchema = z.object({ chargePublicId: z.uuid() }).strict();
const CreatePaymentSchema = z.object({ paymentMethodPublicId: z.uuid() }).strict();

export const customerMembershipPaymentRoutes: FastifyPluginAsyncZod<Options> = async (
  app,
  options,
) => {
  const service = new CustomerMembershipPaymentService(options.client);

  app.post<{ Params: z.infer<typeof ChargeParamSchema>; Body: z.infer<typeof CreatePaymentSchema> }>(
    '/tenant/customer-membership-charges/:chargePublicId/payments',
    { schema: { params: ChargeParamSchema, body: CreatePaymentSchema } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'payment.manage');

      // Resolve payment method
      const paymentMethod = await options.client.paymentMethod.findFirst({
        where: {
          tenantId: request.tenant.id,
          publicId: request.body.paymentMethodPublicId,
          active: true,
        },
      });

      if (!paymentMethod) {
        throw new AppError({
          code: 'PAYMENT_METHOD_NOT_FOUND',
          message: 'Método de pagamento não encontrado ou inativo.',
          statusCode: 404,
        });
      }

      const payment = await service.createPayment(
        request.tenant.id,
        request.params.chargePublicId,
        paymentMethod.id,
        {
          userId: request.auth.user.id,
          sessionId: request.auth.session.id,
        },
      );

      return {
        publicId: payment.publicId,
        status: payment.status,
        originType: payment.originType,
        amountCents: Number(payment.amountCents),
        createdAt: payment.createdAt.toISOString(),
      };
    },
  );
};
