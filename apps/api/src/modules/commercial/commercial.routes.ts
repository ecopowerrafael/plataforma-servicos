import { z } from 'zod';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { type AuthRequestContext } from '../auth/identity.repository.js';
import { type PasswordService } from '../auth/password.service.js';
import {
  CommercialAccountService,
  CommercialCommissionService,
  CommercialCommissionRuleService,
  CommercialManualPaymentService,
  CommercialWalletService,
  getCommercialScopeForUser,
  buildCommercialTenantWhere,
} from './index.js';
import { AppError } from '../../errors/AppError.js';
import { type PrismaClient } from '../../database-client/client.js';

interface CommercialRoutesOptions {
  prisma: PrismaClient;
  passwordService?: PasswordService;
}

const CreateRepresentativeRequestSchema = z.object({
  userPublicId: z.string().uuid().optional(),
  email: z.string().email().optional(),
  defaultCommissionBps: z.number().int().min(0).max(10000).optional(),
});

const CreateSellerRequestSchema = z.object({
  userPublicId: z.string().uuid().optional(),
  email: z.string().email().optional(),
  representativePublicId: z.string().uuid().optional(),
  defaultCommissionBps: z.number().int().min(0).max(10000).optional(),
});

const UpdateCommissionRequestSchema = z.object({
  defaultCommissionBps: z.number().int().min(0).max(10000),
});

const TenantParamsSchema = z.object({
  tenantPublicId: z.string().uuid(),
});

async function resolveUserIdFromInput(
  input: { userPublicId?: string | undefined; email?: string | undefined },
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

export const commercialRoutes: FastifyPluginAsyncZod<CommercialRoutesOptions> = async (app, options) => {

  app.get(
    '/commercial/me',
    {
      schema: {
        response: {
          200: z.object({
            publicId: z.string(),
            email: z.string(),
            role: z.string(),
            active: z.boolean(),
            defaultCommissionBps: z.number(),
          }),
        },
      },
    },
    async (request) => {
      const auth = request.auth as AuthRequestContext;

      if (!auth?.user?.id) {
        throw new AppError({
          code: 'AUTH_REQUIRED',
          message: 'Autenticação obrigatória',
          statusCode: 401,
        });
      }

      const scope = await getCommercialScopeForUser(auth.user.id, options.prisma);

      if (!scope || scope.type === 'GLOBAL') {
        throw new AppError({
          code: 'NOT_COMMERCIAL_USER',
          message: 'Usuário não tem conta comercial',
          statusCode: 403,
        });
      }

      const account = await options.prisma.commercialAccount.findUnique({
        where: { id: scope.accountId },
        include: { user: true },
      });

      if (!account) {
        throw new AppError({
          code: 'ACCOUNT_NOT_FOUND',
          message: 'Conta comercial não encontrada',
          statusCode: 404,
        });
      }

      return {
        publicId: account.publicId,
        email: account.user.email,
        role: account.role,
        active: account.active,
        defaultCommissionBps: account.defaultCommissionBps,
      };
    },
  );

  app.get(
    '/commercial/dashboard',
    async (request) => {
      const auth = request.auth as AuthRequestContext;

      if (!auth?.user?.id) {
        throw new AppError({
          code: 'AUTH_REQUIRED',
          message: 'Autenticação obrigatória',
          statusCode: 401,
        });
      }

      const scope = await getCommercialScopeForUser(auth.user.id, options.prisma);

      if (!scope || scope.type === 'GLOBAL') {
        throw new AppError({
          code: 'NOT_COMMERCIAL_USER',
          message: 'Usuário não tem conta comercial',
          statusCode: 403,
        });
      }

      const tenantWhere = buildCommercialTenantWhere(scope);
      const totalClients = await options.prisma.tenant.count({
        where: tenantWhere,
      });

      const tenants = await options.prisma.tenant.findMany({
        where: tenantWhere,
        select: {
          id: true,
          subscriptions: {
            select: { status: true },
            take: 1,
            orderBy: { createdAt: 'desc' as const },
          },
        },
      });

      const statusCounts = {
        active: 0,
        inactive: 0,
        trial: 0,
      };

      tenants.forEach((tenant) => {
        const status = tenant.subscriptions[0]?.status || 'INACTIVE';
        if (status === 'TRIALING') statusCounts.trial++;
        else if (status === 'ACTIVE' || status === 'PAST_DUE') statusCounts.active++;
        else statusCounts.inactive++;
      });

      const teamCount = await options.prisma.commercialAccount.count({
        where: { parentId: scope.accountId },
      });

      return {
        totalClients,
        activeClients: statusCounts.active,
        inactiveClients: statusCounts.inactive,
        trialClients: statusCounts.trial,
        teamMembers: teamCount,
      };
    },
  );

  app.get(
    '/commercial/clients',
    async (request) => {
      const auth = request.auth as AuthRequestContext;

      if (!auth?.user?.id) {
        throw new AppError({
          code: 'AUTH_REQUIRED',
          message: 'Autenticação obrigatória',
          statusCode: 401,
        });
      }

      const scope = await getCommercialScopeForUser(auth.user.id, options.prisma);

      if (!scope || scope.type === 'GLOBAL') {
        throw new AppError({
          code: 'NOT_COMMERCIAL_USER',
          message: 'Usuário não tem conta comercial',
          statusCode: 403,
        });
      }

      const tenantWhere = buildCommercialTenantWhere(scope);
      const tenants = await options.prisma.tenant.findMany({
        where: tenantWhere,
        include: {
          commercialAssignment: {
            include: {
              manager: { include: { user: true } },
              representative: { include: { user: true } },
              seller: { include: { user: true } },
            },
          },
          subscriptions: { take: 1, orderBy: { createdAt: 'desc' as const } },
        },
      });

      return tenants.map((t) => ({
        tenantId: t.id,
        tenantName: t.displayName,
        tenantPublicId: t.publicId,
        status: t.subscriptions[0]?.status || 'INACTIVE',
        assignedAt: t.commercialAssignment?.assignedAt || null,
        managerId: t.commercialAssignment?.manager?.publicId || null,
        managerEmail: t.commercialAssignment?.manager?.user.email || null,
        representativeId: t.commercialAssignment?.representative?.publicId || null,
        representativeEmail: t.commercialAssignment?.representative?.user.email || null,
        sellerId: t.commercialAssignment?.seller?.publicId || null,
        sellerEmail: t.commercialAssignment?.seller?.user.email || null,
      }));
    },
  );

  app.get(
    '/commercial/team',
    async (request) => {
      const auth = request.auth as AuthRequestContext;

      if (!auth?.user?.id) {
        throw new AppError({
          code: 'AUTH_REQUIRED',
          message: 'Autenticação obrigatória',
          statusCode: 401,
        });
      }

      const scope = await getCommercialScopeForUser(auth.user.id, options.prisma);

      if (!scope || scope.type === 'GLOBAL') {
        throw new AppError({
          code: 'NOT_COMMERCIAL_USER',
          message: 'Usuário não tem conta comercial',
          statusCode: 403,
        });
      }

      // Get direct subordinates
      const subordinates = await options.prisma.commercialAccount.findMany({
        where: { parentId: scope.accountId },
        include: { user: true },
      });

      // Get team with client counts
      const team = await Promise.all(
        subordinates.map(async (sub) => {
          const clientCount = await options.prisma.tenantCommercialAssignment.count({
            where: { [scope.type === 'MANAGER' ? 'representativeId' : 'sellerId']: sub.id },
          });

          return {
            publicId: sub.publicId,
            email: sub.user.email,
            role: sub.role,
            active: sub.active,
            defaultCommissionBps: sub.defaultCommissionBps,
            clientCount,
          };
        }),
      );

      return { team };
    },
  );

  app.post(
    '/commercial/representatives',
    {
      schema: {
        body: CreateRepresentativeRequestSchema,
      },
    },
    async (request, reply) => {
      const auth = request.auth as AuthRequestContext;

      if (!auth?.user?.id) {
        throw new AppError({
          code: 'AUTH_REQUIRED',
          message: 'Autenticação obrigatória',
          statusCode: 401,
        });
      }

      const scope = await getCommercialScopeForUser(auth.user.id, options.prisma);

      if (!scope || scope.type === 'GLOBAL') {
        throw new AppError({
          code: 'NOT_COMMERCIAL_USER',
          message: 'Usuário não tem conta comercial',
          statusCode: 403,
        });
      }

      if (scope.type !== 'MANAGER') {
        throw new AppError({
          code: 'INVALID_ROLE_FOR_ACTION',
          message: 'Apenas gerentes podem criar representantes',
          statusCode: 403,
        });
      }

      const userId = await resolveUserIdFromInput(request.body, options.prisma);
      if (!userId) {
        throw new AppError({
          code: 'INVALID_INPUT',
          message: 'Informe userPublicId ou email',
          statusCode: 400,
        });
      }

      const accountService2 = new CommercialAccountService(options.prisma);
      const account = await accountService2.createRepresentative(
        {
          userId,
          defaultCommissionBps: request.body.defaultCommissionBps || 0,
        } as any,
        auth.user.id,
        { managerId: scope.managerId },
      );

      return reply.status(201).send({
        publicId: account.publicId,
        email: account.user.email,
        role: account.role,
        active: account.active,
        defaultCommissionBps: account.defaultCommissionBps,
      });
    },
  );

  app.post(
    '/commercial/sellers',
    {
      schema: {
        body: CreateSellerRequestSchema,
      },
    },
    async (request, reply) => {
      const auth = request.auth as AuthRequestContext;

      if (!auth?.user?.id) {
        throw new AppError({
          code: 'AUTH_REQUIRED',
          message: 'Autenticação obrigatória',
          statusCode: 401,
        });
      }

      const scope = await getCommercialScopeForUser(auth.user.id, options.prisma);

      if (!scope || scope.type === 'GLOBAL') {
        throw new AppError({
          code: 'NOT_COMMERCIAL_USER',
          message: 'Usuário não tem conta comercial',
          statusCode: 403,
        });
      }

      if (scope.type !== 'MANAGER' && scope.type !== 'REPRESENTATIVE') {
        throw new AppError({
          code: 'INVALID_ROLE_FOR_ACTION',
          message: 'Apenas gerentes e representantes podem criar vendedores',
          statusCode: 403,
        });
      }

      const userId = await resolveUserIdFromInput(request.body, options.prisma);
      if (!userId) {
        throw new AppError({
          code: 'INVALID_INPUT',
          message: 'Informe userPublicId ou email',
          statusCode: 400,
        });
      }

      let parentId = scope.type === 'MANAGER' ? scope.managerId : scope.representativeId;

      if (request.body.representativePublicId) {
        if (scope.type !== 'MANAGER') {
          throw new AppError({
            code: 'INVALID_ACTION',
            message: 'Apenas gerentes podem especificar representante',
            statusCode: 403,
          });
        }

        const rep = await options.prisma.commercialAccount.findUnique({
          where: { publicId: request.body.representativePublicId },
        });

        if (!rep || rep.parentId !== scope.managerId) {
          throw new AppError({
            code: 'INVALID_REPRESENTATIVE',
            message: 'Representante não encontrado ou não pertence a este gerente',
            statusCode: 400,
          });
        }

        parentId = rep.id;
      }

      const accountService2 = new CommercialAccountService(options.prisma);
      const account = await accountService2.createSeller(
        {
          userId,
          parentId,
          defaultCommissionBps: request.body.defaultCommissionBps || 0,
        } as any,
        auth.user.id,
      );

      return reply.status(201).send({
        publicId: account.publicId,
        email: account.user.email,
        role: account.role,
        active: account.active,
        defaultCommissionBps: account.defaultCommissionBps,
      });
    },
  );

  // FASE 2B: Commission endpoints

  app.get(
    '/commercial/wallet',
    async (request) => {
      const auth = request.auth as AuthRequestContext;

      if (!auth?.user?.id) {
        throw new AppError({
          code: 'AUTH_REQUIRED',
          message: 'Autenticação obrigatória',
          statusCode: 401,
        });
      }

      const scope = await getCommercialScopeForUser(auth.user.id, options.prisma);

      if (!scope || scope.type === 'GLOBAL') {
        throw new AppError({
          code: 'NOT_COMMERCIAL_USER',
          message: 'Usuário não tem conta comercial',
          statusCode: 403,
        });
      }

      const walletService = new CommercialWalletService(options.prisma);
      const balance = await walletService.getBalance(scope.accountId);

      return {
        publicId: scope.accountId.toString(),
        balance: Number(balance),
      };
    },
  );

  app.get(
    '/commercial/wallet/entries',
    {
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(100).default(50),
          page: z.coerce.number().int().min(1).default(1),
        }),
      },
    },
    async (request) => {
      const auth = request.auth as AuthRequestContext;

      if (!auth?.user?.id) {
        throw new AppError({
          code: 'AUTH_REQUIRED',
          message: 'Autenticação obrigatória',
          statusCode: 401,
        });
      }

      const scope = await getCommercialScopeForUser(auth.user.id, options.prisma);

      if (!scope || scope.type === 'GLOBAL') {
        throw new AppError({
          code: 'NOT_COMMERCIAL_USER',
          message: 'Usuário não tem conta comercial',
          statusCode: 403,
        });
      }

      const limit = Math.min(request.query.limit, 100);
      const page = Math.max(request.query.page, 1);
      const skip = (page - 1) * limit;

      const [entries, total] = await Promise.all([
        options.prisma.commercialWalletEntry.findMany({
          where: { commercialAccountId: scope.accountId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        options.prisma.commercialWalletEntry.count({
          where: { commercialAccountId: scope.accountId },
        }),
      ]);

      return {
        entries: entries.map((e) => ({
          publicId: e.publicId,
          type: e.type,
          amountCents: Number(e.amountCents),
          description: e.description,
          createdAt: e.createdAt,
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasNextPage: page < Math.ceil(total / limit),
        },
      };
    },
  );

  app.get(
    '/commercial/commissions',
    async (request) => {
      const auth = request.auth as AuthRequestContext;

      if (!auth?.user?.id) {
        throw new AppError({
          code: 'AUTH_REQUIRED',
          message: 'Autenticação obrigatória',
          statusCode: 401,
        });
      }

      const scope = await getCommercialScopeForUser(auth.user.id, options.prisma);

      if (!scope || scope.type === 'GLOBAL') {
        throw new AppError({
          code: 'NOT_COMMERCIAL_USER',
          message: 'Usuário não tem conta comercial',
          statusCode: 403,
        });
      }

      const commissionService = new CommercialCommissionService(options.prisma);
      const { commissions, total } = await commissionService.getCommissions(
        scope.accountId,
        50,
        0,
      );

      return { commissions, total };
    },
  );

  app.get(
    '/commercial/team/commissions',
    async (request) => {
      const auth = request.auth as AuthRequestContext;

      if (!auth?.user?.id) {
        throw new AppError({
          code: 'AUTH_REQUIRED',
          message: 'Autenticação obrigatória',
          statusCode: 401,
        });
      }

      const scope = await getCommercialScopeForUser(auth.user.id, options.prisma);

      if (!scope || scope.type === 'GLOBAL' || scope.type === 'SELLER') {
        throw new AppError({
          code: 'INSUFFICIENT_ROLE',
          message: 'Apenas gerentes e representantes podem ver comissões da equipe',
          statusCode: 403,
        });
      }

      const commissionService = new CommercialCommissionService(options.prisma);
      const commissions = await commissionService.getTeamCommissions(scope.accountId);

      return { commissions };
    },
  );

  app.get(
    '/commercial/commission-rules',
    async (request) => {
      const auth = request.auth as AuthRequestContext;

      if (!auth?.user?.id) {
        throw new AppError({
          code: 'AUTH_REQUIRED',
          message: 'Autenticação obrigatória',
          statusCode: 401,
        });
      }

      const scope = await getCommercialScopeForUser(auth.user.id, options.prisma);

      if (!scope || scope.type === 'GLOBAL') {
        throw new AppError({
          code: 'NOT_COMMERCIAL_USER',
          message: 'Usuário não tem conta comercial',
          statusCode: 403,
        });
      }

      const ruleService = new CommercialCommissionRuleService(options.prisma);
      const rules = await ruleService.getRules(scope.accountId);

      return { rules };
    },
  );

  app.patch(
    '/commercial/team/:accountPublicId/commission',
    {
      schema: {
        params: z.object({ accountPublicId: z.string().uuid() }),
        body: UpdateCommissionRequestSchema,
      },
    },
    async (request) => {
      const auth = request.auth as AuthRequestContext;

      if (!auth?.user?.id) {
        throw new AppError({
          code: 'AUTH_REQUIRED',
          message: 'Autenticação obrigatória',
          statusCode: 401,
        });
      }

      const scope = await getCommercialScopeForUser(auth.user.id, options.prisma);

      if (!scope || scope.type === 'GLOBAL' || scope.type === 'SELLER') {
        throw new AppError({
          code: 'INSUFFICIENT_ROLE',
          message: 'Apenas gerentes e representantes podem alterar comissões',
          statusCode: 403,
        });
      }

      // Find subordinate account
      const subordinate = await options.prisma.commercialAccount.findUnique({
        where: { publicId: request.params.accountPublicId },
      });

      if (!subordinate) {
        throw new AppError({
          code: 'ACCOUNT_NOT_FOUND',
          message: 'Conta não encontrada',
          statusCode: 404,
        });
      }

      // Verify subordinate belongs to manager
      if (subordinate.parentId !== scope.accountId) {
        throw new AppError({
          code: 'INVALID_SUBORDINATE',
          message: 'Este usuário não é subordinado seu',
          statusCode: 403,
        });
      }

      // Validate limit
      const ruleService = new CommercialCommissionRuleService(options.prisma);
      const validation = await ruleService.validateSubordinateCommissionLimit(
        scope.accountId,
      );

      if (!validation.valid) {
        throw new AppError({
          code: 'COMMISSION_LIMIT_EXCEEDED',
          message: validation.message || 'Limite de comissão excedido',
          statusCode: 400,
        });
      }

      // Update defaultCommissionBps
      const updated = await options.prisma.commercialAccount.update({
        where: { id: subordinate.id },
        data: {
          defaultCommissionBps: request.body.defaultCommissionBps,
        },
      });

      return {
        publicId: updated.publicId,
        defaultCommissionBps: updated.defaultCommissionBps,
      };
    },
  );

  app.get(
    '/commercial/clients/:tenantPublicId/payment-preview',
    {
      schema: {
        params: TenantParamsSchema,
      },
    },
    async (request) => {
      const auth = request.auth as AuthRequestContext;

      if (!auth?.user?.id) {
        throw new AppError({
          code: 'AUTH_REQUIRED',
          message: 'Autenticação obrigatória',
          statusCode: 401,
        });
      }

      const scope = await getCommercialScopeForUser(auth.user.id, options.prisma);

      if (!scope || scope.type === 'GLOBAL') {
        throw new AppError({
          code: 'COMMERCIAL_ACCOUNT_NOT_FOUND',
          message: 'Você não possui conta comercial',
          statusCode: 403,
        });
      }

      // Only MANAGER can see preview
      if (scope.type !== 'MANAGER') {
        throw new AppError({
          code: 'COMMERCIAL_INSUFFICIENT_ROLE',
          message: 'Apenas gerentes podem ver prévia de pagamento',
          statusCode: 403,
        });
      }

      const paymentService = new CommercialManualPaymentService(options.prisma);
      return paymentService.getPaymentPreview(scope.accountId, request.params.tenantPublicId);
    },
  );

  app.post(
    '/commercial/clients/:tenantPublicId/mark-paid',
    {
      schema: {
        params: TenantParamsSchema,
      },
    },
    async (request) => {
      const auth = request.auth as AuthRequestContext;

      if (!auth?.user?.id) {
        throw new AppError({
          code: 'AUTH_REQUIRED',
          message: 'Autenticação obrigatória',
          statusCode: 401,
        });
      }

      const scope = await getCommercialScopeForUser(auth.user.id, options.prisma);

      if (!scope || scope.type === 'GLOBAL') {
        throw new AppError({
          code: 'COMMERCIAL_ACCOUNT_NOT_FOUND',
          message: 'Você não possui conta comercial',
          statusCode: 403,
        });
      }

      // Only MANAGER can mark paid
      if (scope.type !== 'MANAGER') {
        throw new AppError({
          code: 'COMMERCIAL_INSUFFICIENT_ROLE',
          message: 'Apenas gerentes podem marcar como pago',
          statusCode: 403,
        });
      }

      const paymentService = new CommercialManualPaymentService(options.prisma);

      return paymentService.markSubscriptionPaid(
        scope.accountId,
        request.params.tenantPublicId,
      );
    },
  );

  // FASE 5: Team Management
  app.get(
    '/commercial/team',
    {
      schema: {
        response: {
          200: z.object({
            manager: z.object({
              publicId: z.string(),
              email: z.string(),
              role: z.string(),
              active: z.boolean(),
              defaultCommissionBps: z.number(),
              createdAt: z.string(),
            }),
            representatives: z.array(z.object({
              publicId: z.string(),
              email: z.string(),
              role: z.string(),
              active: z.boolean(),
              defaultCommissionBps: z.number(),
              createdAt: z.string(),
              sellers: z.array(z.object({
                publicId: z.string(),
                email: z.string(),
                role: z.string(),
                active: z.boolean(),
                defaultCommissionBps: z.number(),
                createdAt: z.string(),
              })),
            })),
            directSellers: z.array(z.object({
              publicId: z.string(),
              email: z.string(),
              role: z.string(),
              active: z.boolean(),
              defaultCommissionBps: z.number(),
              createdAt: z.string(),
            })),
          }),
        },
      },
    },
    async (request) => {
      const auth = request.auth as AuthRequestContext;

      if (!auth?.user?.id) {
        throw new AppError({
          code: 'AUTH_REQUIRED',
          message: 'Autenticação obrigatória',
          statusCode: 401,
        });
      }

      const scope = await getCommercialScopeForUser(auth.user.id, options.prisma);
      if (!scope || scope.type === 'GLOBAL') {
        throw new AppError({
          code: 'NOT_MANAGER',
          message: 'Acesso negado',
          statusCode: 403,
        });
      }

      const manager = await options.prisma.commercialAccount.findUnique({
        where: { id: scope.accountId },
        include: { user: true },
      });

      if (!manager || manager.role !== 'MANAGER') {
        throw new AppError({
          code: 'NOT_MANAGER',
          message: 'Apenas gerentes podem acessar equipe',
          statusCode: 403,
        });
      }

      const representatives = await options.prisma.commercialAccount.findMany({
        where: { parentId: scope.accountId, role: 'REPRESENTATIVE', active: true },
        include: { user: true },
        orderBy: { createdAt: 'desc' },
      });

      const directSellers = await options.prisma.commercialAccount.findMany({
        where: { parentId: scope.accountId, role: 'SELLER', active: true },
        include: { user: true },
        orderBy: { createdAt: 'desc' },
      });

      const reps = await Promise.all(
        representatives.map(async (rep) => {
          const sellers = await options.prisma.commercialAccount.findMany({
            where: { parentId: rep.id, role: 'SELLER', active: true },
            include: { user: true },
            orderBy: { createdAt: 'desc' },
          });

          return {
            publicId: rep.publicId,
            email: rep.user.email,
            role: rep.role,
            active: rep.active,
            defaultCommissionBps: rep.defaultCommissionBps,
            createdAt: rep.createdAt.toISOString(),
            sellers: sellers.map((s) => ({
              publicId: s.publicId,
              email: s.user.email,
              role: s.role,
              active: s.active,
              defaultCommissionBps: s.defaultCommissionBps,
              createdAt: s.createdAt.toISOString(),
            })),
          };
        }),
      );

      return {
        manager: {
          publicId: manager.publicId,
          email: manager.user.email,
          role: manager.role,
          active: manager.active,
          defaultCommissionBps: manager.defaultCommissionBps,
          createdAt: manager.createdAt.toISOString(),
        },
        representatives: reps,
        directSellers: directSellers.map((s) => ({
          publicId: s.publicId,
          email: s.user.email,
          role: s.role,
          active: s.active,
          defaultCommissionBps: s.defaultCommissionBps,
          createdAt: s.createdAt.toISOString(),
        })),
      };
    },
  );

  app.post(
    '/commercial/team/representatives',
    {
      schema: {
        body: z.object({
          email: z.string().email(),
          name: z.string().min(1).optional(),
          phone: z.string().optional(),
          password: z.string().min(8).optional(),
          defaultCommissionBps: z.number().int().min(0).max(10000),
        }),
        response: {
          201: z.object({
            publicId: z.string(),
            email: z.string(),
            role: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const auth = request.auth as AuthRequestContext;

      if (!auth?.user?.id) {
        throw new AppError({
          code: 'AUTH_REQUIRED',
          message: 'Autenticação obrigatória',
          statusCode: 401,
        });
      }

      const scope = await getCommercialScopeForUser(auth.user.id, options.prisma);
      if (!scope || scope.type === 'GLOBAL') {
        throw new AppError({
          code: 'NOT_MANAGER',
          message: 'Acesso negado',
          statusCode: 403,
        });
      }

      const manager = await options.prisma.commercialAccount.findUnique({
        where: { id: scope.accountId },
      });

      if (!manager || manager.role !== 'MANAGER') {
        throw new AppError({
          code: 'NOT_MANAGER',
          message: 'Apenas gerentes podem criar representantes',
          statusCode: 403,
        });
      }

      const normalized = request.body.email.toLowerCase();
      const existingUser = await options.prisma.user.findUnique({
        where: { normalizedEmail: normalized },
      });

      if (existingUser) {
        const existing = await options.prisma.commercialAccount.findFirst({
          where: { userId: existingUser.id },
        });
        if (existing) {
          throw new AppError({
            code: 'USER_ALREADY_HAS_COMMERCIAL_ACCOUNT',
            message: 'Este usuário já possui vínculo comercial',
            statusCode: 409,
          });
        }
      }

      const result = await options.prisma.$transaction(async (tx) => {
        let user = existingUser;

        if (!user) {
          if (!request.body.password) {
            throw new AppError({
              code: 'PASSWORD_REQUIRED',
              message: 'Senha obrigatória para novo usuário',
              statusCode: 400,
            });
          }

          const passwordService = options.passwordService;
          if (!passwordService) {
            throw new AppError({
              code: 'PASSWORD_SERVICE_UNAVAILABLE',
              message: 'Serviço de senha não disponível',
              statusCode: 500,
            });
          }

          const passwordHash = await passwordService.hash(request.body.password);

          user = await tx.user.create({
            data: {
              email: request.body.email,
              normalizedEmail: normalized,
              passwordHash,
              publicId: crypto.randomUUID(),
              status: 'ACTIVE',
              emailVerifiedAt: new Date(),
            },
          });
        }

        const representative = await tx.commercialAccount.create({
          data: {
            publicId: crypto.randomUUID(),
            userId: user.id,
            role: 'REPRESENTATIVE',
            parentId: manager.id,
            active: true,
            defaultCommissionBps: request.body.defaultCommissionBps,
            createdByUserId: auth.user.id,
          },
          include: { user: true },
        });

        return representative;
      });

      reply.status(201);
      return {
        publicId: result.publicId,
        email: result.user.email,
        role: result.role,
      };
    },
  );

  app.post(
    '/commercial/team/sellers',
    {
      schema: {
        body: z.object({
          email: z.string().email(),
          name: z.string().min(1).optional(),
          phone: z.string().optional(),
          password: z.string().min(8).optional(),
          defaultCommissionBps: z.number().int().min(0).max(10000),
          representativePublicId: z.string().uuid().optional(),
        }),
        response: {
          201: z.object({
            publicId: z.string(),
            email: z.string(),
            role: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const auth = request.auth as AuthRequestContext;

      if (!auth?.user?.id) {
        throw new AppError({
          code: 'AUTH_REQUIRED',
          message: 'Autenticação obrigatória',
          statusCode: 401,
        });
      }

      const scope = await getCommercialScopeForUser(auth.user.id, options.prisma);
      if (!scope || scope.type === 'GLOBAL') {
        throw new AppError({
          code: 'NOT_MANAGER',
          message: 'Acesso negado',
          statusCode: 403,
        });
      }

      const manager = await options.prisma.commercialAccount.findUnique({
        where: { id: scope.accountId },
      });

      if (!manager || manager.role !== 'MANAGER') {
        throw new AppError({
          code: 'NOT_MANAGER',
          message: 'Apenas gerentes podem criar vendedores',
          statusCode: 403,
        });
      }

      let parentId = manager.id;

      if (request.body.representativePublicId) {
        const representative = await options.prisma.commercialAccount.findUnique({
          where: { publicId: request.body.representativePublicId },
        });

        if (!representative) {
          throw new AppError({
            code: 'REPRESENTATIVE_NOT_FOUND',
            message: 'Representante não encontrado',
            statusCode: 404,
          });
        }

        if (representative.role !== 'REPRESENTATIVE' || representative.parentId !== manager.id || !representative.active) {
          throw new AppError({
            code: 'INVALID_REPRESENTATIVE',
            message: 'Representante inválido ou inativo',
            statusCode: 403,
          });
        }

        parentId = representative.id;
      }

      const normalized = request.body.email.toLowerCase();
      const existingUser = await options.prisma.user.findUnique({
        where: { normalizedEmail: normalized },
      });

      if (existingUser) {
        const existing = await options.prisma.commercialAccount.findFirst({
          where: { userId: existingUser.id },
        });
        if (existing) {
          throw new AppError({
            code: 'USER_ALREADY_HAS_COMMERCIAL_ACCOUNT',
            message: 'Este usuário já possui vínculo comercial',
            statusCode: 409,
          });
        }
      }

      const result = await options.prisma.$transaction(async (tx) => {
        let user = existingUser;

        if (!user) {
          if (!request.body.password) {
            throw new AppError({
              code: 'PASSWORD_REQUIRED',
              message: 'Senha obrigatória para novo usuário',
              statusCode: 400,
            });
          }

          const passwordService = options.passwordService;
          if (!passwordService) {
            throw new AppError({
              code: 'PASSWORD_SERVICE_UNAVAILABLE',
              message: 'Serviço de senha não disponível',
              statusCode: 500,
            });
          }

          const passwordHash = await passwordService.hash(request.body.password);

          user = await tx.user.create({
            data: {
              email: request.body.email,
              normalizedEmail: normalized,
              passwordHash,
              publicId: crypto.randomUUID(),
              status: 'ACTIVE',
              emailVerifiedAt: new Date(),
            },
          });
        }

        const seller = await tx.commercialAccount.create({
          data: {
            publicId: crypto.randomUUID(),
            userId: user.id,
            role: 'SELLER',
            parentId,
            active: true,
            defaultCommissionBps: request.body.defaultCommissionBps,
            createdByUserId: auth.user.id,
          },
          include: { user: true },
        });

        return seller;
      });

      reply.status(201);
      return {
        publicId: result.publicId,
        email: result.user.email,
        role: result.role,
      };
    },
  );

};
