import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { CustomerMembershipRepository } from './customer-membership.repository.js';
import { CustomerMembershipChargeRepository } from './customer-membership-charge.repository.js';
import { type AuthService } from '../auth/auth.service.js';

interface Options {
  authService: AuthService;
  client: PrismaClient;
}

const CustomerParamSchema = z.object({ customerPublicId: z.uuid() }).strict();

export const customerMembershipBenefitBalanceRoutes: FastifyPluginAsyncZod<Options> = async (
  app,
  options,
) => {
  const membershipRepository = new CustomerMembershipRepository(options.client);
  const chargeRepository = new CustomerMembershipChargeRepository(options.client);

  app.get<{ Params: z.infer<typeof CustomerParamSchema> }>(
    '/tenant/customers/:customerPublicId/membership/benefits',
    { schema: { params: CustomerParamSchema } },
    async (request) => {
      const customer = await options.client.customer.findFirst({
        where: {
          tenantId: request.tenant.id,
          publicId: request.params.customerPublicId,
        },
        select: { id: true },
      });

      if (!customer) {
        throw new AppError({
          code: 'CUSTOMER_NOT_FOUND',
          message: 'Cliente não encontrado.',
          statusCode: 404,
        });
      }

      // Find active membership
      const membership = await membershipRepository.findByCustomer(
        request.tenant.id,
        customer.id,
      );

      if (!membership) {
        return {
          membershipStatus: null,
          cycleStart: null,
          cycleEnd: null,
          benefits: [],
        };
      }

      // If not active, no benefits
      if (membership.status !== 'ACTIVE') {
        return {
          membershipStatus: membership.status,
          cycleStart: membership.currentPeriodStart?.toISOString() ?? null,
          cycleEnd: membership.currentPeriodEnd?.toISOString() ?? null,
          benefits: [],
        };
      }

      // Find current paid charge
      const charge = await chargeRepository.findCurrentPaid(
        request.tenant.id,
        membership.id,
        new Date(),
      );

      if (!charge) {
        return {
          membershipStatus: 'ACTIVE',
          cycleStart: membership.currentPeriodStart?.toISOString() ?? null,
          cycleEnd: membership.currentPeriodEnd?.toISOString() ?? null,
          benefits: [],
        };
      }

      // Parse snapshot
      const snapshot = typeof charge.planSnapshot === 'string'
        ? JSON.parse(charge.planSnapshot)
        : charge.planSnapshot;

      if (!snapshot || !Array.isArray(snapshot.benefits)) {
        return {
          membershipStatus: 'ACTIVE',
          cycleStart: membership.currentPeriodStart?.toISOString() ?? null,
          cycleEnd: membership.currentPeriodEnd?.toISOString() ?? null,
          benefits: [],
        };
      }

      // Build benefit balance list
      const benefits = await Promise.all(
        snapshot.benefits.map(async (b: any) => {
          const service = await options.client.service.findUnique({
            where: { id: BigInt(b.serviceId) },
            select: { publicId: true, name: true },
          });

          if (!service) return null;

          // Count usage
          const usage = await options.client.customerMembershipUsage.groupBy({
            by: ['status'],
            where: {
              membershipChargeId: charge.id,
              serviceId: BigInt(b.serviceId),
              status: { in: ['RESERVED', 'CONSUMED', 'RELEASED'] },
            },
            _count: true,
          });

          const consumed = usage.find((r) => r.status === 'CONSUMED')?._count ?? 0;
          const reserved = usage.find((r) => r.status === 'RESERVED')?._count ?? 0;
          const released = usage.find((r) => r.status === 'RELEASED')?._count ?? 0;

          if (b.type === 'QUANTITY') {
            const limit = b.quantityPerCycle ?? 0;
            const available = Math.max(0, limit - reserved - consumed);
            return {
              servicePublicId: service.publicId,
              serviceName: service.name,
              type: 'QUANTITY',
              limit,
              reserved,
              consumed,
              released,
              available,
              discountPercent: null,
              cycleEnd: charge.periodEnd.toISOString(),
            };
          }

          if (b.type === 'UNLIMITED') {
            return {
              servicePublicId: service.publicId,
              serviceName: service.name,
              type: 'UNLIMITED',
              limit: null,
              reserved: null,
              consumed: null,
              released: null,
              available: null,
              discountPercent: null,
              cycleEnd: charge.periodEnd.toISOString(),
            };
          }

          if (b.type === 'DISCOUNT') {
            return {
              servicePublicId: service.publicId,
              serviceName: service.name,
              type: 'DISCOUNT',
              limit: null,
              reserved: null,
              consumed: null,
              released: null,
              available: null,
              discountPercent: b.discountPercent ?? 0,
              cycleEnd: charge.periodEnd.toISOString(),
            };
          }

          return null;
        }),
      );

      return {
        membershipStatus: membership.status,
        cycleStart: membership.currentPeriodStart?.toISOString() ?? null,
        cycleEnd: membership.currentPeriodEnd?.toISOString() ?? null,
        benefits: benefits.filter((b) => b !== null),
      };
    },
  );
};
