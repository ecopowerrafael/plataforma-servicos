import { z } from 'zod';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { type AuthRequestContext } from '../auth/identity.repository.js';
import {
  CommercialAccountService,
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
};
