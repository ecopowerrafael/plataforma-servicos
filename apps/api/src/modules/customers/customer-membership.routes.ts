import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { CustomerMembershipRepository } from './customer-membership.repository.js';
import { CustomerMembershipService } from './customer-membership.service.js';
import { CustomerMembershipChargeRepository } from './customer-membership-charge.repository.js';
import { CustomerMembershipChargeService } from './customer-membership-charge.service.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';
import { type PaymentGatewayService } from '../payments/gateway/payment-gateway.service.js';

interface Options {
  authService: AuthService;
  cookieName: string;
  client: PrismaClient;
  paymentGateway?: PaymentGatewayService;
}

const UuidParamSchema = z.object({ publicId: z.uuid() }).strict();
const CreateMembershipSchema = z.object({ planPublicId: z.uuid() }).strict();
const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  planPublicId: z.uuid().optional(),
  status: z.enum(['PENDING', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELED']).optional(),
}).strict();

export const customerMembershipRoutes: FastifyPluginAsyncZod<Options> = async (app, options) => {
  await app.register(tenantContextPlugin, {
    authService: options.authService,
    cookieName: options.cookieName,
    client: options.client,
  });
  const repository = new CustomerMembershipRepository(options.client);
  const chargeRepository = new CustomerMembershipChargeRepository(options.client);
  const chargeService = new CustomerMembershipChargeService(chargeRepository);
  const service = new CustomerMembershipService(repository, chargeService, options.paymentGateway);

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

  app.post<{ Params: z.infer<typeof UuidParamSchema>; Body: { reason?: string } }>(
    '/tenant/customer-memberships/:publicId/cancel',
    { schema: { params: UuidParamSchema, body: z.object({ reason: z.string().trim().max(500).optional() }).strict() } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'tenant.update');
      options.authService.requireCapability(request.tenant, 'memberships.manage');
      const membership = await service.cancel(request.tenant.id, request.params.publicId, { userId: request.auth.user.id, sessionId: request.auth.session.id }, request.body.reason);
      return { publicId: membership?.publicId, status: membership?.status, canceledAt: membership?.canceledAt?.toISOString() ?? null, nextBillingAt: membership?.nextBillingAt?.toISOString() ?? null, cancelAtPeriodEnd: membership?.cancelAtPeriodEnd ?? false };
    },
  );

  app.post<{ Params: z.infer<typeof UuidParamSchema> }>(
    '/tenant/customer-memberships/:publicId/cancel-at-period-end',
    { schema: { params: UuidParamSchema } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'tenant.update');
      options.authService.requireCapability(request.tenant, 'memberships.manage');
      const membership = await service.scheduleCancelAtPeriodEnd(request.tenant.id, request.params.publicId, { userId: request.auth.user.id, sessionId: request.auth.session.id });
      return { publicId: membership.publicId, status: membership.status, cancelAtPeriodEnd: membership.cancelAtPeriodEnd };
    },
  );

  app.delete<{ Params: z.infer<typeof UuidParamSchema> }>(
    '/tenant/customer-memberships/:publicId/cancel-at-period-end',
    { schema: { params: UuidParamSchema } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'tenant.update');
      options.authService.requireCapability(request.tenant, 'memberships.manage');
      const membership = await service.revokeCancelAtPeriodEnd(request.tenant.id, request.params.publicId, { userId: request.auth.user.id, sessionId: request.auth.session.id });
      return { publicId: membership.publicId, status: membership.status, cancelAtPeriodEnd: membership.cancelAtPeriodEnd };
    },
  );

  app.get<{ Querystring: z.infer<typeof ListQuerySchema> }>(
    '/tenant/customer-memberships',
    { schema: { querystring: ListQuerySchema } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'tenant.read');
      options.authService.requireCapability(request.tenant, 'memberships.manage');

      const result = await repository.listByTenant(request.tenant.id, {
        page: request.query.page,
        limit: request.query.limit,
        ...(request.query.search && { search: request.query.search }),
        ...(request.query.planPublicId && { planPublicId: request.query.planPublicId }),
        ...(request.query.status && { status: request.query.status }),
      });

      return {
        items: result.items.map((membership) => ({
          membershipPublicId: membership.publicId,
          customerPublicId: membership.customer.publicId,
          customerName: membership.customer.name,
          customerEmail: membership.customer.email,
          customerAvatar: membership.customer.avatar,
          planPublicId: membership.plan.publicId,
          planName: membership.plan.name,
          priceCents: Number(membership.plan.priceCents),
          status: membership.status,
          startedAt: membership.startedAt?.toISOString() ?? null,
          currentPeriodStart: membership.currentPeriodStart?.toISOString() ?? null,
          currentPeriodEnd: membership.currentPeriodEnd?.toISOString() ?? null,
          nextBillingAt: membership.nextBillingAt?.toISOString() ?? null,
          createdAt: membership.createdAt.toISOString(),
        })),
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          pages: Math.ceil(result.total / result.limit),
        },
      };
    },
  );
};
