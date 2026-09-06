import { z } from 'zod';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { type PlatformService, type PlatformAuthContext } from './platform.service.js';
import {
  CommercialAccountService,
  CommercialRegionService,
  CommercialCommissionService,
  CommercialCommissionRuleService,
  CommercialManualPaymentService,
} from '../commercial/index.js';
import { AppError } from '../../errors/AppError.js';
import { type PrismaClient } from '../../database-client/client.js';

interface PlatformCommercialRoutesOptions {
  service: PlatformService;
  prisma: PrismaClient;
}

const PublicIdParamsSchema = z.object({ publicId: z.uuid() });
const RegionPublicIdParamsSchema = z.object({ regionPublicId: z.uuid() });

const CreateManagerRequestSchema = z.object({
  userPublicId: z.string().uuid().optional(),
  email: z.string().email().optional(),
  name: z.string().min(1).optional(),
  defaultCommissionBps: z.number().int().min(0).max(10000),
  active: z.boolean().optional().default(true),
});

const UpdateManagerRequestSchema = z.object({
  active: z.boolean().optional(),
  defaultCommissionBps: z.number().int().min(0).max(10000).optional(),
});

const CreateRepresentativeRequestSchema = z.object({
  userPublicId: z.string().uuid().optional(),
  email: z.string().email().optional(),
  name: z.string().min(1).optional(),
  defaultCommissionBps: z.number().int().min(0).max(10000),
  active: z.boolean().optional().default(true),
});

const CreateSellerRequestSchema = z.object({
  userPublicId: z.string().uuid().optional(),
  email: z.string().email().optional(),
  name: z.string().min(1).optional(),
  representativePublicId: z.string().uuid().optional(),
  defaultCommissionBps: z.number().int().min(0).max(10000),
  active: z.boolean().optional().default(true),
});

const CreateRegionRequestSchema = z.object({
  name: z.string().min(1),
  cities: z
    .array(
      z.object({
        ibgeCode: z.string().regex(/^\d{7}$/),
        city: z.string().min(1),
        state: z.string().length(2).toUpperCase(),
      }),
    )
    .optional()
    .default([]),
});

const UpdateRegionRequestSchema = z.object({
  name: z.string().min(1).optional(),
  active: z.boolean().optional(),
  addCities: z
    .array(
      z.object({
        ibgeCode: z.string().regex(/^\d{7}$/),
        city: z.string().min(1),
        state: z.string().length(2).toUpperCase(),
      }),
    )
    .optional(),
  removeCityIds: z.array(z.bigint()).optional(),
});

const CommercialAccountResponseSchema = z.object({
  publicId: z.string(),
  userId: z.bigint(),
  role: z.string(),
  active: z.boolean(),
  defaultCommissionBps: z.number(),
  parentId: z.bigint().nullable(),
  createdAt: z.date(),
});

const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  role: z.enum(['MANAGER', 'REPRESENTATIVE', 'SELLER']).optional(),
  active: z.coerce.boolean().optional(),
  managerPublicId: z.string().uuid().optional(),
});

const CreateCommissionRuleRequestSchema = z.object({
  planPublicId: z.string().uuid().optional(),
  percentageBps: z.number().int().min(0).max(10000),
  effectiveFrom: z.string().datetime().optional(),
  effectiveUntil: z.string().datetime().optional(),
});

const UpdateCommissionRuleRequestSchema = z.object({
  percentageBps: z.number().int().min(0).max(10000).optional(),
  effectiveUntil: z.string().datetime().optional(),
  active: z.boolean().optional(),
});

const ReverseManualPaymentRequestSchema = z.object({
  reason: z.string().min(1).max(500),
});

async function resolveUserIdFromInput(
  input: { userPublicId?: string | undefined; email?: string | undefined; name?: string | undefined },
  prisma: PrismaClient,
): Promise<bigint | null> {
  if (input.userPublicId) {
    const user = await prisma.user.findUnique({ where: { publicId: input.userPublicId } });
    if (!user) throw new AppError({ code: 'USER_NOT_FOUND', message: 'Usuário não encontrado', statusCode: 404 });
    return user.id;
  }

  if (input.email) {
    const normalized = input.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { normalizedEmail: normalized } });
    if (!user) throw new AppError({ code: 'USER_NOT_FOUND', message: 'Usuário não encontrado', statusCode: 404 });
    return user.id;
  }

  return null;
}

export const platformCommercialRoutes: FastifyPluginAsyncZod<PlatformCommercialRoutesOptions> = async (
  app,
  options,
) => {
  const accountService = new CommercialAccountService(options.prisma);
  const regionService = new CommercialRegionService(options.prisma);
  const commissionService = new CommercialCommissionService(options.prisma);
  const ruleService = new CommercialCommissionRuleService(options.prisma);
  const manualPaymentService = new CommercialManualPaymentService(options.prisma);

  const allow = (request: { platformAuth: PlatformAuthContext }, permission: string) => {
    options.service.requirePermission(request.platformAuth, permission as any);
  };

  app.get(
    '/platform/commercial/accounts',
    {
      schema: {
        querystring: PaginationSchema,
        response: {
          200: z.object({
            data: z.array(CommercialAccountResponseSchema),
            pagination: z.object({ page: z.number(), limit: z.number(), total: z.number(), totalPages: z.number() }),
          }),
        },
      },
    },
    async (request) => {
      allow(request, 'platform.commercial.read');

      const filters: any = {};
      if (request.query.role) filters.role = request.query.role;
      if (request.query.active !== undefined) filters.active = request.query.active;
      if (request.query.managerPublicId) filters.managerPublicId = request.query.managerPublicId;

      const accounts = await accountService.listAllAccounts(filters);

      const page = request.query.page;
      const limit = request.query.limit;
      const start = (page - 1) * limit;
      const paginated = accounts.slice(start, start + limit);

      return {
        data: paginated.map((a: any) => ({
          publicId: a.publicId,
          userId: a.userId,
          role: a.role,
          active: a.active,
          defaultCommissionBps: a.defaultCommissionBps,
          parentId: a.parentId,
          createdAt: a.createdAt,
        })),
        pagination: {
          page,
          limit,
          total: accounts.length,
          totalPages: Math.ceil(accounts.length / limit),
        },
      };
    },
  );

  app.post(
    '/platform/commercial/managers',
    {
      schema: {
        body: CreateManagerRequestSchema,
        response: { 201: CommercialAccountResponseSchema },
      },
    },
    async (request, reply) => {
      allow(request, 'platform.commercial.manage');

      const userId = await resolveUserIdFromInput(request.body, options.prisma);
      if (!userId) {
        throw new AppError({
          code: 'INVALID_INPUT',
          message: 'Informe userPublicId ou email',
          statusCode: 400,
        });
      }

      const account = await accountService.createManager(
        {
          userId,
          defaultCommissionBps: request.body.defaultCommissionBps,
        } as any,
        request.platformAuth.user.id,
      );

      return reply.status(201).send({
        publicId: account.publicId,
        userId: account.userId,
        role: account.role,
        active: account.active,
        defaultCommissionBps: account.defaultCommissionBps,
        parentId: account.parentId,
        createdAt: account.createdAt,
      });
    },
  );

  app.get(
    '/platform/commercial/managers/:publicId',
    {
      schema: {
        params: PublicIdParamsSchema,
      },
    },
    async (request) => {
      allow(request, 'platform.commercial.read');

      const account = await accountService.getAccountByPublicId(request.params.publicId);
      if (!account) {
        throw new AppError({ code: 'MANAGER_NOT_FOUND', message: 'Gerente não encontrado', statusCode: 404 });
      }

      const stats = await accountService.getAccountStats(account.id);

      return {
        publicId: account.publicId,
        userId: account.userId,
        user: {
          email: account.user.email,
        },
        role: account.role,
        active: account.active,
        defaultCommissionBps: account.defaultCommissionBps,
        regions: stats?.regionsCount || 0,
        cities: await options.prisma.commercialRegionCity.count({
          where: { region: { managerId: account.id } },
        }),
        clients: stats?.clientsCount || 0,
        team: stats?.teamCount || 0,
        createdAt: account.createdAt,
      };
    },
  );

  app.patch(
    '/platform/commercial/managers/:publicId',
    {
      schema: {
        params: PublicIdParamsSchema,
        body: UpdateManagerRequestSchema,
      },
    },
    async (request) => {
      allow(request, 'platform.commercial.manage');

      const account = await accountService.getAccountByPublicId(request.params.publicId);
      if (!account) {
        throw new AppError({ code: 'MANAGER_NOT_FOUND', message: 'Gerente não encontrado', statusCode: 404 });
      }

      const updates: any = {};
      if (request.body.active !== undefined) updates.active = request.body.active;
      if (request.body.defaultCommissionBps !== undefined) {
        accountService['validateCommissionBps'](request.body.defaultCommissionBps);
        updates.defaultCommissionBps = request.body.defaultCommissionBps;
      }

      const updated = await options.prisma.commercialAccount.update({
        where: { id: account.id },
        data: updates,
        include: { user: true },
      });

      return {
        publicId: updated.publicId,
        userId: updated.userId,
        role: updated.role,
        active: updated.active,
        defaultCommissionBps: updated.defaultCommissionBps,
        parentId: updated.parentId,
        createdAt: updated.createdAt,
      };
    },
  );

  app.post(
    '/platform/commercial/managers/:publicId/regions',
    {
      schema: {
        params: PublicIdParamsSchema,
        body: CreateRegionRequestSchema,
      },
    },
    async (request) => {
      allow(request, 'platform.commercial.manage');

      const manager = await accountService.getAccountByPublicId(request.params.publicId);
      if (!manager) {
        throw new AppError({ code: 'MANAGER_NOT_FOUND', message: 'Gerente não encontrado', statusCode: 404 });
      }

      const region = await regionService.createRegion({
        managerId: manager.id,
        name: request.body.name,
      });

      if (request.body.cities?.length) {
        await regionService.addCitiesToRegion(region.id, request.body.cities);
      }

      return {
        publicId: region.publicId,
        name: region.name,
        managerId: region.managerId,
        active: region.active,
      };
    },
  );

  app.patch(
    '/platform/commercial/regions/:regionPublicId',
    {
      schema: {
        params: RegionPublicIdParamsSchema,
        body: UpdateRegionRequestSchema,
      },
    },
    async (request) => {
      allow(request, 'platform.commercial.manage');

      const region = await regionService.getRegionByPublicId(request.params.regionPublicId);
      if (!region) {
        throw new AppError({ code: 'REGION_NOT_FOUND', message: 'Região não encontrada', statusCode: 404 });
      }

      const updates: any = {};
      if (request.body.name !== undefined) updates.name = request.body.name;
      if (request.body.active !== undefined) updates.active = request.body.active;

      let updated = await options.prisma.commercialRegion.update({
        where: { id: region.id },
        data: updates,
        include: { cities: true },
      });

      if (request.body.addCities?.length) {
        await regionService.addCitiesToRegion(region.id, request.body.addCities);
        const refetch = await options.prisma.commercialRegion.findUnique({
          where: { id: region.id },
          include: { cities: true },
        });
        if (refetch) updated = refetch;
      }

      if (request.body.removeCityIds?.length) {
        await options.prisma.commercialRegionCity.deleteMany({
          where: { id: { in: request.body.removeCityIds }, regionId: region.id },
        });
      }

      return {
        publicId: updated.publicId,
        name: updated.name,
        active: updated.active,
        cities: updated.cities.length,
      };
    },
  );

  app.delete(
    '/platform/commercial/regions/:regionPublicId',
    {
      schema: { params: RegionPublicIdParamsSchema },
    },
    async (request) => {
      allow(request, 'platform.commercial.manage');

      const region = await regionService.getRegionByPublicId(request.params.regionPublicId);
      if (!region) {
        throw new AppError({ code: 'REGION_NOT_FOUND', message: 'Região não encontrada', statusCode: 404 });
      }

      await regionService.deleteRegion(region.id);

      return { success: true };
    },
  );

  app.post(
    '/platform/commercial/managers/:publicId/representatives',
    {
      schema: {
        params: PublicIdParamsSchema,
        body: CreateRepresentativeRequestSchema,
      },
    },
    async (request, reply) => {
      allow(request, 'platform.commercial.manage');

      const manager = await accountService.getAccountByPublicId(request.params.publicId);
      if (!manager) {
        throw new AppError({ code: 'MANAGER_NOT_FOUND', message: 'Gerente não encontrado', statusCode: 404 });
      }

      const userId = await resolveUserIdFromInput(request.body, options.prisma);
      if (!userId) {
        throw new AppError({
          code: 'INVALID_INPUT',
          message: 'Informe userPublicId ou email',
          statusCode: 400,
        });
      }

      const account = await accountService.createRepresentative(
        {
          userId,
          defaultCommissionBps: request.body.defaultCommissionBps,
        } as any,
        request.platformAuth.user.id,
        { managerId: manager.id },
      );

      return reply.status(201).send({
        publicId: account.publicId,
        userId: account.userId,
        role: account.role,
        active: account.active,
        defaultCommissionBps: account.defaultCommissionBps,
        parentId: account.parentId,
        createdAt: account.createdAt,
      });
    },
  );

  app.post(
    '/platform/commercial/managers/:publicId/sellers',
    {
      schema: {
        params: PublicIdParamsSchema,
        body: CreateSellerRequestSchema,
      },
    },
    async (request, reply) => {
      allow(request, 'platform.commercial.manage');

      const manager = await accountService.getAccountByPublicId(request.params.publicId);
      if (!manager) {
        throw new AppError({ code: 'MANAGER_NOT_FOUND', message: 'Gerente não encontrado', statusCode: 404 });
      }

      const userId = await resolveUserIdFromInput(request.body, options.prisma);
      if (!userId) {
        throw new AppError({
          code: 'INVALID_INPUT',
          message: 'Informe userPublicId ou email',
          statusCode: 400,
        });
      }

      let parentId = manager.id;

      if (request.body.representativePublicId) {
        const rep = await accountService.getAccountByPublicId(request.body.representativePublicId);
        if (!rep || rep.role !== 'REPRESENTATIVE') {
          throw new AppError({
            code: 'INVALID_REPRESENTATIVE',
            message: 'Representante não encontrado ou inválido',
            statusCode: 404,
          });
        }
        if (rep.parentId !== manager.id) {
          throw new AppError({
            code: 'REPRESENTATIVE_NOT_UNDER_MANAGER',
            message: 'Representante não pertence a este gerente',
            statusCode: 400,
          });
        }
        parentId = rep.id;
      }

      const account = await accountService.createSeller(
        {
          userId,
          parentId,
          defaultCommissionBps: request.body.defaultCommissionBps,
        } as any,
        request.platformAuth.user.id,
      );

      return reply.status(201).send({
        publicId: account.publicId,
        userId: account.userId,
        role: account.role,
        active: account.active,
        defaultCommissionBps: account.defaultCommissionBps,
        parentId: account.parentId,
        createdAt: account.createdAt,
      });
    },
  );

  app.get(
    '/platform/commercial/managers/:publicId/team',
    {
      schema: {
        params: PublicIdParamsSchema,
      },
    },
    async (request) => {
      allow(request, 'platform.commercial.read');

      const manager = await accountService.getAccountByPublicId(request.params.publicId);
      if (!manager) {
        throw new AppError({ code: 'MANAGER_NOT_FOUND', message: 'Gerente não encontrado', statusCode: 404 });
      }

      const [reps, directSellers] = await Promise.all([
        options.prisma.commercialAccount.findMany({
          where: { parentId: manager.id, role: 'REPRESENTATIVE' },
          include: { user: true, children: { where: { role: 'SELLER' }, include: { user: true } } },
        }),
        options.prisma.commercialAccount.findMany({
          where: { parentId: manager.id, role: 'SELLER' },
          include: { user: true },
        }),
      ]);

      const managerClients = await options.prisma.tenantCommercialAssignment.count({
        where: { managerId: manager.id },
      });

      return {
        manager: {
          publicId: manager.publicId,
          email: manager.user.email,
          role: manager.role,
          active: manager.active,
          defaultCommissionBps: manager.defaultCommissionBps,
          clients: managerClients,
        },
        representatives: await Promise.all(
          reps.map(async (rep) => {
            const repClients = await options.prisma.tenantCommercialAssignment.count({
              where: { representativeId: rep.id },
            });
            return {
              publicId: rep.publicId,
              email: rep.user.email,
              role: rep.role,
              active: rep.active,
              defaultCommissionBps: rep.defaultCommissionBps,
              clients: repClients,
              sellers: rep.children.map((seller) => ({
                publicId: seller.publicId,
                email: seller.user.email,
                role: seller.role,
                active: seller.active,
                defaultCommissionBps: seller.defaultCommissionBps,
                clients: 0,
              })),
            };
          }),
        ),
        directSellers: await Promise.all(
          directSellers.map(async (seller) => {
            const sellerClients = await options.prisma.tenantCommercialAssignment.count({
              where: { sellerId: seller.id },
            });
            return {
              publicId: seller.publicId,
              email: seller.user.email,
              role: seller.role,
              active: seller.active,
              defaultCommissionBps: seller.defaultCommissionBps,
              clients: sellerClients,
            };
          }),
        ),
      };
    },
  );

  app.get(
    '/platform/commercial/accounts/:publicId/commissions',
    {
      schema: {
        params: PublicIdParamsSchema,
      },
    },
    async (request) => {
      allow(request, 'platform.commercial.read');

      const account = await accountService.getAccountByPublicId(request.params.publicId);
      if (!account) {
        throw new AppError({ code: 'ACCOUNT_NOT_FOUND', message: 'Conta comercial não encontrada', statusCode: 404 });
      }

      return commissionService.getCommissions(account.id);
    },
  );

  app.get(
    '/platform/commercial/accounts/:publicId/commission-rules',
    {
      schema: {
        params: PublicIdParamsSchema,
      },
    },
    async (request) => {
      allow(request, 'platform.commercial.read');

      const account = await accountService.getAccountByPublicId(request.params.publicId);
      if (!account) {
        throw new AppError({ code: 'ACCOUNT_NOT_FOUND', message: 'Conta comercial não encontrada', statusCode: 404 });
      }

      return ruleService.getRules(account.id);
    },
  );

  app.post(
    '/platform/commercial/accounts/:publicId/commission-rules',
    {
      schema: {
        params: PublicIdParamsSchema,
        body: CreateCommissionRuleRequestSchema,
      },
    },
    async (request, reply) => {
      allow(request, 'platform.commercial.manage');

      const account = await accountService.getAccountByPublicId(request.params.publicId);
      if (!account) {
        throw new AppError({ code: 'ACCOUNT_NOT_FOUND', message: 'Conta comercial não encontrada', statusCode: 404 });
      }

      let planId: bigint | null = null;
      if (request.body.planPublicId) {
        const plan = await options.prisma.commercialPlan.findUnique({
          where: { publicId: request.body.planPublicId },
        });
        if (!plan) {
          throw new AppError({ code: 'PLAN_NOT_FOUND', message: 'Plano não encontrado', statusCode: 404 });
        }
        planId = plan.id;
      }

      const rule = await ruleService.createRule(
        account.id,
        planId,
        request.body.percentageBps,
        request.body.effectiveFrom ? new Date(request.body.effectiveFrom) : new Date(),
      );

      if (request.body.effectiveUntil) {
        await ruleService.updateRule(rule.id, {
          effectiveUntil: new Date(request.body.effectiveUntil),
        });
      }

      return reply.status(201).send({
        publicId: rule.publicId,
        commercialAccountId: rule.commercialAccountId,
        planId: rule.planId,
        percentageBps: rule.percentageBps,
        effectiveFrom: rule.effectiveFrom,
        effectiveUntil: rule.effectiveUntil,
        active: rule.active,
        createdAt: rule.createdAt,
      });
    },
  );

  app.patch(
    '/platform/commercial/commission-rules/:publicId',
    {
      schema: {
        params: PublicIdParamsSchema,
        body: UpdateCommissionRuleRequestSchema,
      },
    },
    async (request) => {
      allow(request, 'platform.commercial.manage');

      const rule = await options.prisma.commercialCommissionRule.findUnique({
        where: { publicId: request.params.publicId },
      });
      if (!rule) {
        throw new AppError({
          code: 'RULE_NOT_FOUND',
          message: 'Regra de comissão não encontrada',
          statusCode: 404,
        });
      }

      const updates: any = {};
      if (request.body.percentageBps !== undefined) updates.percentageBps = request.body.percentageBps;
      if (request.body.effectiveUntil !== undefined) updates.effectiveUntil = new Date(request.body.effectiveUntil);
      if (request.body.active !== undefined) updates.active = request.body.active;

      const updated = await options.prisma.commercialCommissionRule.update({
        where: { id: rule.id },
        data: updates,
      });

      return {
        publicId: updated.publicId,
        commercialAccountId: updated.commercialAccountId,
        planId: updated.planId,
        percentageBps: updated.percentageBps,
        effectiveFrom: updated.effectiveFrom,
        effectiveUntil: updated.effectiveUntil,
        active: updated.active,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      };
    },
  );

  app.delete(
    '/platform/commercial/commission-rules/:publicId',
    {
      schema: {
        params: PublicIdParamsSchema,
      },
    },
    async (request) => {
      allow(request, 'platform.commercial.manage');

      const rule = await options.prisma.commercialCommissionRule.findUnique({
        where: { publicId: request.params.publicId },
      });
      if (!rule) {
        throw new AppError({
          code: 'RULE_NOT_FOUND',
          message: 'Regra de comissão não encontrada',
          statusCode: 404,
        });
      }

      await ruleService.deactivateRule(rule.id);

      return { success: true };
    },
  );

  app.get(
    '/platform/commercial/manual-payments',
    {
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(100).default(50),
          page: z.coerce.number().int().min(1).default(1),
        }),
      },
    },
    async (request) => {
      allow(request, 'platform.commercial.read');

      const limit = request.query.limit;
      const page = request.query.page;
      const skip = (page - 1) * limit;

      const [payments, total] = await Promise.all([
        options.prisma.commercialManualPayment.findMany({
          include: {
            tenant: true,
            managerAccount: { include: { user: true } },
            subscription: { include: { plan: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        options.prisma.commercialManualPayment.count(),
      ]);

      return {
        data: payments.map((p) => ({
          publicId: p.publicId,
          tenant: { publicId: p.tenant.publicId, name: p.tenant.displayName },
          manager: { publicId: p.managerAccount.publicId, email: p.managerAccount.user.email },
          amountCents: Number(p.amountCents),
          status: p.status,
          createdAt: p.createdAt,
          processedAt: p.processedAt,
        })),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      };
    },
  );

  app.get(
    '/platform/commercial/accounts/:publicId/wallet',
    {
      schema: {
        params: PublicIdParamsSchema,
      },
    },
    async (request) => {
      allow(request, 'platform.commercial.read');

      const account = await accountService.getAccountByPublicId(request.params.publicId);
      if (!account) {
        throw new AppError({ code: 'ACCOUNT_NOT_FOUND', message: 'Conta não encontrada', statusCode: 404 });
      }

      const balance = await options.prisma.commercialWalletEntry.aggregate({
        where: { commercialAccountId: account.id },
        _sum: { amountCents: true },
      });

      return {
        publicId: account.publicId,
        balance: Number(balance._sum.amountCents || 0),
      };
    },
  );

  app.post(
    '/platform/commercial/manual-payments/:publicId/reverse',
    {
      schema: {
        params: PublicIdParamsSchema,
        body: ReverseManualPaymentRequestSchema,
      },
    },
    async (request) => {
      allow(request, 'platform.commercial.manage');

      return manualPaymentService.reversePayment(
        request.params.publicId,
        request.body.reason,
      );
    },
  );

  // Get all commissions with source tracking (admin view)
  app.get(
    '/platform/commercial/commissions',
    async (request: any) => {
      allow(request, 'platform.commercial.read');

      const commissions = await options.prisma.commercialCommission.findMany({
        include: {
          tenant: { select: { publicId: true, displayName: true } },
          subscription: { select: { publicId: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: (request.query?.limit || 100) as number,
      });

      return { commissions };
    },
  );
};
