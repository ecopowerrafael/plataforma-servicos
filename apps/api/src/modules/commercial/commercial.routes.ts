import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { type AuthRequestContext } from '../auth/identity.repository.js';
import {
  CommercialAccountService,
  CommercialCommissionService,
  CommercialCommissionRuleService,
  CommercialManualPaymentService,
  getCommercialScopeForUser,
  buildCommercialTenantWhere,
} from './index.js';
import { AppError } from '../../errors/AppError.js';
import { type PrismaClient } from '../../database-client/client.js';

interface CommercialRoutesOptions {
  prisma: PrismaClient;
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
      const idempotencyKey = randomUUID();

      return paymentService.markSubscriptionPaid(
        scope.accountId,
        request.params.tenantPublicId,
        idempotencyKey,
      );
    },
  );
};
