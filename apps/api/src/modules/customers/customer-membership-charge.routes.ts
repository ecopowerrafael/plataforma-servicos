import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { CustomerMembershipChargeRepository } from './customer-membership-charge.repository.js';
import { CustomerMembershipChargeService } from './customer-membership-charge.service.js';
import { CustomerMembershipPaymentService } from './customer-membership-payment.service.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';

interface Options {
  authService: AuthService;
  cookieName: string;
  client: PrismaClient;
}

type MembershipChargeWithDetails = Awaited<
  ReturnType<CustomerMembershipChargeRepository['list']>
>[number];

const toPublicCharge = (charge: MembershipChargeWithDetails) => ({
  publicId: charge.publicId,
  periodStart: charge.periodStart.toISOString(),
  periodEnd: charge.periodEnd.toISOString(),
  amountCents: Number(charge.amountCents),
  status: charge.status,
  dueAt: charge.dueAt.toISOString(),
  paidAt: charge.paidAt?.toISOString() ?? null,
  payments: charge.payments.map((payment) => ({
    publicId: payment.publicId,
    status: payment.status,
    amountCents: Number(payment.amountCents),
    paidAt: payment.paidAt?.toISOString() ?? null,
    paymentMethodName: payment.paymentMethod.name,
    paymentMethodType: payment.paymentMethod.type,
    originType: 'MEMBERSHIP_CHARGE' as const,
    createdAt: payment.createdAt.toISOString(),
  })),
  gatewayCharges: charge.gatewayCharges.map((gatewayCharge) => ({
    publicId: gatewayCharge.publicId,
    paymentPublicId: gatewayCharge.payment?.publicId ?? null,
    provider: gatewayCharge.provider,
    externalId: gatewayCharge.externalId,
    status: gatewayCharge.status,
    amountCents: Number(gatewayCharge.amountCents),
    pixCopyPaste: gatewayCharge.pixCopyPaste,
    lastCheckedAt: gatewayCharge.lastCheckedAt?.toISOString() ?? null,
    canceledAt: gatewayCharge.canceledAt?.toISOString() ?? null,
    createdAt: gatewayCharge.createdAt.toISOString(),
  })),
  financialReversals: charge.financialReversals.map((reversal) => ({
    publicId: reversal.publicId,
    type: reversal.type,
    amountCents: Number(reversal.amountCents),
    effectiveAt: reversal.effectiveAt.toISOString(),
    provider: reversal.provider,
    externalReference: reversal.externalReference,
  })),
  createdAt: charge.createdAt.toISOString(),
  updatedAt: charge.updatedAt.toISOString(),
});

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
  await app.register(tenantContextPlugin, {
    authService: options.authService,
    cookieName: options.cookieName,
    client: options.client,
  });
  const repository = new CustomerMembershipChargeRepository(options.client);
  const service = new CustomerMembershipChargeService(repository);
  const paymentService = new CustomerMembershipPaymentService(options.client);

  app.get<{ Params: z.infer<typeof UuidParamSchema> }>(
    '/tenant/customer-memberships/:membershipPublicId/charges',
    { schema: { params: UuidParamSchema } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'tenant.read');
      options.authService.requireCapability(request.tenant, 'memberships.manage');
      const charges = await service.list(request.tenant.id, request.params.membershipPublicId);
      return {
        items: charges.map(toPublicCharge),
      };
    },
  );

  app.get<{ Params: z.infer<typeof ChargeUuidParamSchema> }>(
    '/tenant/customer-memberships/:membershipPublicId/charges/:publicId',
    { schema: { params: ChargeUuidParamSchema } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'tenant.read');
      options.authService.requireCapability(request.tenant, 'memberships.manage');
      const charge = await service.get(request.tenant.id, request.params.publicId);
      return toPublicCharge(charge);
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
      options.authService.requireCapability(request.tenant, 'memberships.manage');
      const charge = await service.get(request.tenant.id, request.params.publicId);

      if (charge.status === 'PAID') {
        throw new AppError({
          code: 'CUSTOMER_MEMBERSHIP_CHARGE_ALREADY_PAID',
          message: 'Esta cobrança já foi paga.',
          statusCode: 409,
        });
      }

      const paymentMethod = await options.client.paymentMethod.findFirst({
        where: { tenantId: request.tenant.id, publicId: request.body.paymentMethodPublicId, active: true },
      });
      if (paymentMethod === null) throw new AppError({ code: 'PAYMENT_METHOD_NOT_FOUND', message: 'Método de pagamento não encontrado ou inativo.', statusCode: 404 });
      await paymentService.createPayment(request.tenant.id, charge.publicId, paymentMethod.id, {
        userId: request.auth.user.id, sessionId: request.auth.session.id,
      });
      const updated = await service.get(request.tenant.id, charge.publicId);

      return toPublicCharge(updated);
    },
  );
};
