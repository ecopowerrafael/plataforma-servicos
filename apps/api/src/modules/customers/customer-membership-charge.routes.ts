import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { CustomerMembershipChargeRepository } from './customer-membership-charge.repository.js';
import { CustomerMembershipChargeService } from './customer-membership-charge.service.js';
import { type AuthService } from '../auth/auth.service.js';

interface Options {
  authService: AuthService;
  client: PrismaClient;
}

const UuidParamSchema = z.object({ membershipPublicId: z.uuid() }).strict();
const ChargeUuidParamSchema = z
  .object({ membershipPublicId: z.uuid(), publicId: z.uuid() })
  .strict();
const ConfirmPaymentSchema = z
  .object({
    paymentMethodPublicId: z.string().uuid(),
  })
  .strict();

export const customerMembershipChargeRoutes: FastifyPluginAsyncZod<Options> = async (
  app,
  options,
) => {
  const repository = new CustomerMembershipChargeRepository(options.client);
  const service = new CustomerMembershipChargeService(repository);

  app.get<{ Params: z.infer<typeof UuidParamSchema> }>(
    '/tenant/customer-memberships/:membershipPublicId/charges',
    { schema: { params: UuidParamSchema } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'tenant.read');
      const charges = await service.list(request.tenant.id, request.params.membershipPublicId);
      return {
        items: charges.map((c) => ({
          publicId: c.publicId,
          periodStart: c.periodStart.toISOString(),
          periodEnd: c.periodEnd.toISOString(),
          amountCents: Number(c.amountCents),
          status: c.status,
          dueAt: c.dueAt.toISOString(),
          paidAt: c.paidAt?.toISOString() ?? null,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
        })),
      };
    },
  );

  app.get<{ Params: z.infer<typeof ChargeUuidParamSchema> }>(
    '/tenant/customer-memberships/:membershipPublicId/charges/:publicId',
    { schema: { params: ChargeUuidParamSchema } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'tenant.read');
      const charge = await service.get(request.tenant.id, request.params.publicId);
      return {
        publicId: charge.publicId,
        periodStart: charge.periodStart.toISOString(),
        periodEnd: charge.periodEnd.toISOString(),
        amountCents: Number(charge.amountCents),
        status: charge.status,
        dueAt: charge.dueAt.toISOString(),
        paidAt: charge.paidAt?.toISOString() ?? null,
        createdAt: charge.createdAt.toISOString(),
        updatedAt: charge.updatedAt.toISOString(),
      };
    },
  );

  app.post<{
    Params: z.infer<typeof ChargeUuidParamSchema>;
    Body: z.infer<typeof ConfirmPaymentSchema>;
  }>(
    '/tenant/customer-memberships/:membershipPublicId/charges/:publicId/confirm-payment',
    { schema: { params: ChargeUuidParamSchema, body: ConfirmPaymentSchema } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'payment.manage');
      const charge = await service.get(request.tenant.id, request.params.publicId);

      if (charge.status === 'PAID') {
        throw new AppError({
          code: 'CUSTOMER_MEMBERSHIP_CHARGE_ALREADY_PAID',
          message: 'Esta cobrança já foi paga.',
          statusCode: 409,
        });
      }

      const paidAt = new Date();
      const updated = await service.recordPayment(
        charge.id,
        BigInt(0),
        paidAt,
        request.tenant.id,
        charge.publicId,
        {
          userId: request.auth.user.id,
          sessionId: request.auth.session.id,
        },
      );

      return {
        publicId: updated.publicId,
        periodStart: updated.periodStart.toISOString(),
        periodEnd: updated.periodEnd.toISOString(),
        amountCents: Number(updated.amountCents),
        status: updated.status,
        dueAt: updated.dueAt.toISOString(),
        paidAt: updated.paidAt?.toISOString() ?? null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    },
  );
};
