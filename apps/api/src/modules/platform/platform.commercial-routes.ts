import { z } from 'zod';
import { randomUUID } from 'crypto';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { type PlatformService, type PlatformAuthContext, auditData } from './platform.service.js';
import { type PasswordService } from '../auth/password.service.js';
import { requestMetadata } from '../auth/request-context.js';
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
  passwordService: PasswordService;
}

const PublicIdParamsSchema = z.object({ publicId: z.uuid() });
const RegionPublicIdParamsSchema = z.object({ regionPublicId: z.uuid() });

const UserLookupResponseSchema = z.object({
  exists: z.boolean(),
  user: z.object({
    publicId: z.string().uuid(),
    name: z.string().nullable(),
    email: z.string().email(),
    phone: z.string().nullable(),
    hasCommercialAccount: z.boolean(),
    commercialRole: z.string().nullable(),
  }).nullable(),
});

const CreateManagerRequestSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  password: z.string().min(8).optional(),
  defaultCommissionBps: z.number().int().min(0).max(10000),
  active: z.boolean().optional().default(true),
  region: z.object({
    name: z.string().min(1),
    cities: z.array(
      z.object({
        ibgeCode: z.string().regex(/^\d{7}$/),
        city: z.string().min(1),
        state: z.string().length(2).toUpperCase(),
      }),
    ).optional().default([]),
  }).optional(),
});

const UpdateManagerRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(255).optional(),
  phone: z.string().trim().max(32).nullable().optional(),
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
  userId: z.string(),
  role: z.string(),
  active: z.boolean(),
  defaultCommissionBps: z.number(),
  parentId: z.string().nullable(),
  createdAt: z.string().datetime(),
});

const CommercialAccountListItemSchema = z.object({
  publicId: z.string(),
  userId: z.string(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  phone: z.string().nullable(),
  regionsCount: z.number(),
  citiesCount: z.number(),
  clientsCount: z.number(),
  representativesCount: z.number(),
  sellersCount: z.number(),
  role: z.string(),
  active: z.boolean(),
  defaultCommissionBps: z.number(),
  parentId: z.string().nullable(),
  createdAt: z.string(),
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
            data: z.array(CommercialAccountListItemSchema),
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
      const managerIds = accounts.filter((account: any) => account.role === 'MANAGER').map((account: any) => account.id);
      const [regionCounts, cityCounts, clientCounts, representativeCounts, sellerCounts] = await Promise.all([
        options.prisma.commercialRegion.groupBy({ by: ['managerId'], where: { managerId: { in: managerIds } }, _count: true }),
        options.prisma.commercialRegionCity.groupBy({ by: ['regionId'], _count: true }),
        options.prisma.tenantCommercialAssignment.groupBy({ by: ['managerId'], where: { managerId: { in: managerIds } }, _count: true }),
        options.prisma.commercialAccount.groupBy({ by: ['parentId'], where: { parentId: { in: managerIds }, role: 'REPRESENTATIVE' }, _count: true }),
        options.prisma.commercialAccount.groupBy({ by: ['parentId'], where: { parentId: { in: managerIds }, role: 'SELLER' }, _count: true }),
      ]);
      const countBy = (groups: Array<any>, field: string) => new Map(groups.map((group) => [group[field]?.toString(), group._count]));
      const regionByManager = countBy(regionCounts, 'managerId');
      const clientsByManager = countBy(clientCounts, 'managerId');
      const representativesByManager = countBy(representativeCounts, 'parentId');
      const sellersByManager = countBy(sellerCounts, 'parentId');
      const cityByRegion = countBy(cityCounts, 'regionId');
      const citiesByManager = new Map<string, number>();
      for (const region of regionCounts) citiesByManager.set(region.managerId.toString(), 0);
      const regionsForCities = await options.prisma.commercialRegion.findMany({ where: { managerId: { in: managerIds } }, select: { id: true, managerId: true } });
      for (const region of regionsForCities) citiesByManager.set(region.managerId.toString(), (citiesByManager.get(region.managerId.toString()) || 0) + (cityByRegion.get(region.id.toString()) || 0));

      const page = request.query.page;
      const limit = request.query.limit;
      const start = (page - 1) * limit;
      const paginated = accounts.slice(start, start + limit);

      return {
        data: paginated.map((a: any) => ({
          publicId: a.publicId,
          userId: a.userId.toString(),
          email: a.user.email,
          displayName: a.displayName,
          phone: a.phone,
          regionsCount: regionByManager.get(a.id.toString()) || 0,
          citiesCount: citiesByManager.get(a.id.toString()) || 0,
          clientsCount: clientsByManager.get(a.id.toString()) || 0,
          representativesCount: representativesByManager.get(a.id.toString()) || 0,
          sellersCount: sellersByManager.get(a.id.toString()) || 0,
          role: a.role,
          active: a.active,
          defaultCommissionBps: a.defaultCommissionBps,
          parentId: a.parentId ? a.parentId.toString() : null,
          createdAt: a.createdAt.toISOString(),
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

  app.get(
    '/platform/commercial/cities/:state',
    {
      schema: {
        params: z.object({ state: z.string().length(2).toUpperCase() }),
        response: {
          200: z.array(
            z.object({
              ibgeCode: z.string(),
              city: z.string(),
              state: z.string(),
            }),
          ),
        },
      },
    },
    async (request) => {
      allow(request, 'platform.commercial.read');

      const cities = await options.prisma.commercialRegionCity.findMany({
        where: { state: request.params.state },
        select: { ibgeCode: true, city: true, state: true },
        distinct: ['ibgeCode'],
        orderBy: { city: 'asc' },
      });

      return cities;
    },
  );

  app.get(
    '/platform/commercial/user-lookup',
    {
      schema: {
        querystring: z.object({
          email: z.string().email(),
        }),
        response: {
          200: UserLookupResponseSchema,
        },
      },
    },
    async (request) => {
      allow(request, 'platform.commercial.read');

      const normalizedEmail = request.query.email.toLowerCase();
      const user = await options.prisma.user.findUnique({
        where: { normalizedEmail },
      });

      if (!user) {
        return { exists: false, user: null };
      }

      const commercialAccount = await options.prisma.commercialAccount.findFirst({
        where: { userId: user.id },
      });

      return {
        exists: true,
        user: {
          publicId: user.publicId,
          name: user.email.split('@')[0] || null,
          email: user.email,
          phone: null,
          hasCommercialAccount: !!commercialAccount,
          commercialRole: commercialAccount?.role ?? null,
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

      const normalizedEmail = request.body.email.toLowerCase();
      const existingUser = await options.prisma.user.findUnique({
        where: { normalizedEmail },
      });
      if (!existingUser) {
        if (!request.body.password) {
          throw new AppError({
            code: 'PASSWORD_REQUIRED',
            message: 'Senha obrigatória para novo usuário',
            statusCode: 400,
          });
        }
      }

      const passwordHash = request.body.password
        ? await options.passwordService.hash(request.body.password)
        : undefined;
      const account = await options.prisma.$transaction(async (transaction) => {
        const user = await transaction.user.findUnique({ where: { normalizedEmail } });
        let userId = user?.id;

        if (!user) {
          const newUser = await transaction.user.create({
            data: {
              publicId: randomUUID(),
              email: request.body.email,
              normalizedEmail,
              passwordHash: passwordHash!,
              status: 'ACTIVE',
              emailVerifiedAt: new Date(),
            },
          });
          userId = newUser.id;
        } else {
          const existingCommercialAccount = await transaction.commercialAccount.findFirst({
            where: { userId: user.id },
          });
          if (existingCommercialAccount) {
            throw new AppError({
              code: 'USER_ALREADY_COMMERCIAL',
              message: `Este usuário já é ${existingCommercialAccount.role} comercial`,
              statusCode: 400,
            });
          }
        }

        const cities = request.body.region?.cities ?? [];
        for (const city of cities) {
          const existingCity = await transaction.commercialRegionCity.findFirst({
            where: { ibgeCode: city.ibgeCode, region: { active: true } },
            include: { region: { include: { manager: { include: { user: true } } } } },
          });
          if (existingCity) {
            throw new AppError({
              code: 'CITY_ALREADY_ASSIGNED',
              message: `Esta cidade já está atribuída ao gerente ${existingCity.region.manager.user.email}`,
              statusCode: 400,
            });
          }
        }

        const transactionAccountService = new CommercialAccountService(transaction);
        const manager = await transactionAccountService.createManager(
          { userId: userId!, defaultCommissionBps: request.body.defaultCommissionBps } as any,
          request.platformAuth.user.id,
        );

        if (request.body.region && cities.length > 0) {
          await transaction.commercialRegion.create({
            data: {
              publicId: randomUUID(),
              managerId: manager.id,
              name: request.body.region.name,
              active: true,
              cities: {
                create: cities.map((city) => ({
                  ibgeCode: city.ibgeCode,
                  city: city.city,
                  state: city.state,
                })),
              },
            },
          });
        }

        return manager;
      });

      return reply.status(201).send({
        publicId: account.publicId,
        userId: account.userId.toString(),
        role: account.role,
        active: account.active,
        defaultCommissionBps: account.defaultCommissionBps,
        parentId: account.parentId?.toString() ?? null,
        createdAt: account.createdAt.toISOString(),
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
      if (request.body.displayName !== undefined) updates.displayName = request.body.displayName;
      if (request.body.phone !== undefined) updates.phone = request.body.phone;
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
      await options.prisma.auditLog.create({
        data: auditData({ action: 'commercial.manager.updated', targetType: 'commercial_manager', targetPublicId: updated.publicId, userId: request.platformAuth.user.id, metadata: { previous: JSON.stringify({ active: account.active, displayName: account.displayName, phone: account.phone, defaultCommissionBps: account.defaultCommissionBps }), next: JSON.stringify(updates) }, request: requestMetadata(request) }),
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

  app.delete('/platform/commercial/managers/:publicId', { schema: { params: PublicIdParamsSchema } }, async (request) => {
    allow(request, 'platform.commercial.manage');
    const manager = await accountService.getAccountByPublicId(request.params.publicId);
    if (!manager) throw new AppError({ code: 'MANAGER_NOT_FOUND', message: 'Gerente não encontrado', statusCode: 404 });
    await options.prisma.$transaction(async (transaction) => {
      await transaction.commercialAccount.update({ where: { id: manager.id }, data: { active: false } });
      await transaction.commercialRegion.updateMany({ where: { managerId: manager.id, active: true }, data: { active: false } });
      await transaction.auditLog.create({ data: auditData({ action: 'commercial.manager.deactivated', targetType: 'commercial_manager', targetPublicId: manager.publicId, userId: request.platformAuth.user.id, metadata: { regionsDeactivated: String(await transaction.commercialRegion.count({ where: { managerId: manager.id } })) }, request: requestMetadata(request) }) });
    });
    return { success: true, mode: 'deactivated' };
  });

  app.get(
    '/platform/commercial/regions',
    async (request) => {
      allow(request, 'platform.commercial.read');
      const regions = await options.prisma.commercialRegion.findMany({
        include: { manager: { include: { user: true } }, cities: true },
        orderBy: { name: 'asc' },
      });
      return {
        data: regions.map((region) => ({
          publicId: region.publicId,
          name: region.name,
          active: region.active,
          manager: {
            publicId: region.manager.publicId,
            displayName: region.manager.displayName,
            email: region.manager.user.email,
          },
          cities: region.cities.map((city) => ({
            id: city.id.toString(), ibgeCode: city.ibgeCode, city: city.city, state: city.state,
          })),
        })),
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
      await options.prisma.auditLog.create({ data: auditData({ action: 'commercial.region.updated', targetType: 'commercial_region', targetPublicId: region.publicId, userId: request.platformAuth.user.id, metadata: { updates }, request: requestMetadata(request) }) });

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

      await options.prisma.$transaction(async (transaction) => {
        await transaction.commercialRegion.delete({ where: { id: region.id } });
        await transaction.auditLog.create({ data: auditData({ action: 'commercial.region.deleted', targetType: 'commercial_region', targetPublicId: region.publicId, userId: request.platformAuth.user.id, metadata: { managerId: region.managerId.toString(), cities: region.cities.length, assignmentsPreserved: true }, request: requestMetadata(request) }) });
      });

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
          displayName: manager.displayName,
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
              displayName: rep.displayName,
              email: rep.user.email,
              role: rep.role,
              active: rep.active,
              defaultCommissionBps: rep.defaultCommissionBps,
              clients: repClients,
              sellers: rep.children.map((seller) => ({
                publicId: seller.publicId,
                displayName: seller.displayName,
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
              displayName: seller.displayName,
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

      const limit = Math.min(parseInt(request.query?.limit || '100', 10), 500);
      const commissions = await options.prisma.commercialCommission.findMany({
        include: {
          tenant: { select: { publicId: true, displayName: true } },
          subscription: { select: { publicId: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      // Convert BigInt fields to strings for JSON serialization
      return {
        commissions: commissions.map((c: any) => ({
          publicId: c.publicId,
          commercialAccountId: c.commercialAccountId.toString(),
          tenantId: c.tenantId.toString(),
          subscriptionId: c.subscriptionId.toString(),
          baseAmountCents: c.baseAmountCents.toString(),
          percentageBpsSnapshot: c.percentageBpsSnapshot,
          commissionAmountCents: c.commissionAmountCents.toString(),
          roleSnapshot: c.roleSnapshot,
          status: c.status,
          paymentSource: c.paymentSource,
          paymentId: c.paymentId,
          createdAt: c.createdAt,
          reversedAt: c.reversedAt,
          tenant: c.tenant,
          subscription: c.subscription,
        })),
      };
    },
  );

  // POST /platform/commercial/assign-tenant - Atribuir tenant à hierarquia
  app.post(
    '/platform/commercial/assign-tenant',
    {
      schema: {
        body: z.object({
          tenantPublicId: z.string().uuid(),
          managerPublicId: z.string().uuid(),
          representativePublicId: z.string().uuid().optional(),
          sellerPublicId: z.string().uuid().optional(),
        }),
        response: { 201: z.object({ success: z.boolean() }) },
      },
    },
    async (request, reply) => {
      const tenant = await options.prisma.tenant.findUnique({ where: { publicId: request.body.tenantPublicId } });
      if (!tenant) throw new AppError({ code: 'TENANT_NOT_FOUND', message: 'Tenant não encontrado', statusCode: 404 });

      const manager = await options.prisma.commercialAccount.findUnique({ where: { publicId: request.body.managerPublicId } });
      if (!manager || manager.role !== 'MANAGER') throw new AppError({ code: 'INVALID_MANAGER', message: 'Manager inválido', statusCode: 400 });

      let representativeId: bigint | null = null;
      if (request.body.representativePublicId) {
        const rep = await options.prisma.commercialAccount.findUnique({
          where: { publicId: request.body.representativePublicId },
        });
        if (!rep || rep.role !== 'REPRESENTATIVE' || rep.parentId !== manager.id) {
          throw new AppError({ code: 'INVALID_REPRESENTATIVE', message: 'Representative inválido', statusCode: 400 });
        }
        representativeId = rep.id;
      }

      let sellerId: bigint | null = null;
      if (request.body.sellerPublicId) {
        const seller = await options.prisma.commercialAccount.findUnique({
          where: { publicId: request.body.sellerPublicId },
        });
        if (!seller || seller.role !== 'SELLER') throw new AppError({ code: 'INVALID_SELLER', message: 'Seller inválido', statusCode: 400 });

        // Validar seller pertence à cadeia do manager
        if (seller.parentId === manager.id) {
          // Seller direto
          if (representativeId !== null) throw new AppError({ code: 'INVALID_CHAIN', message: 'Cadeia inconsistente', statusCode: 400 });
        } else {
          // Seller sob representative
          const parent = await options.prisma.commercialAccount.findUnique({ where: { id: seller.parentId! } });
          if (!parent || parent.role !== 'REPRESENTATIVE' || parent.parentId !== manager.id) {
            throw new AppError({ code: 'INVALID_CHAIN', message: 'Cadeia inconsistente', statusCode: 400 });
          }
          if (representativeId !== parent.id) throw new AppError({ code: 'INVALID_CHAIN', message: 'Cadeia inconsistente', statusCode: 400 });
        }
        sellerId = seller.id;
      }

      // Capturar assignment anterior para auditoria
      const previous = await options.prisma.tenantCommercialAssignment.findUnique({
        where: { tenantId: tenant.id },
      });

      // Upsert assignment
      await options.prisma.tenantCommercialAssignment.upsert({
        where: { tenantId: tenant.id },
        create: {
          tenantId: tenant.id,
          managerId: manager.id,
          representativeId,
          sellerId,
          source: 'CREATED_BY_MANAGER',
        },
        update: {
          managerId: manager.id,
          representativeId,
          sellerId,
        },
      });

      // Registrar auditoria
      const action = previous ? 'commercial.tenant_assignment.changed' : 'commercial.tenant_assignment.created';
      await options.prisma.auditLog.create({
        data: auditData({
          action,
          targetType: 'tenant_assignment',
          targetPublicId: request.body.tenantPublicId,
          tenantId: tenant.id,
          metadata: {
            previous_manager: previous?.managerId?.toString() || null,
            previous_representative: previous?.representativeId?.toString() || null,
            previous_seller: previous?.sellerId?.toString() || null,
            new_manager: manager.id.toString(),
            new_representative: representativeId?.toString() || null,
            new_seller: sellerId?.toString() || null,
          },
          request: requestMetadata(request),
        }),
      });

      reply.status(201);
      return { success: true };
    },
  );

  // GET /platform/commercial/clients - Listar todos os clientes
  app.get(
    '/platform/commercial/clients',
    async (request) => {
      const page = parseInt((request.query as any).page || '1');
      const limit = Math.min(parseInt((request.query as any).limit || '50'), 100);
      const skip = (page - 1) * limit;

      const where: any = {};
      if ((request.query as any).managerPublicId) {
        const manager = await options.prisma.commercialAccount.findUnique({
          where: { publicId: (request.query as any).managerPublicId },
        });
        if (manager) where.managerId = manager.id;
      }
      if ((request.query as any).representativePublicId) {
        const rep = await options.prisma.commercialAccount.findUnique({
          where: { publicId: (request.query as any).representativePublicId },
        });
        if (rep) where.representativeId = rep.id;
      }
      if ((request.query as any).sellerPublicId) {
        const seller = await options.prisma.commercialAccount.findUnique({
          where: { publicId: (request.query as any).sellerPublicId },
        });
        if (seller) where.sellerId = seller.id;
      }
      if ((request.query as any).subscriptionStatus) {
        where.tenant = { subscriptions: { some: { status: (request.query as any).subscriptionStatus } } };
      }

      const [assignments, total] = await Promise.all([
        options.prisma.tenantCommercialAssignment.findMany({
          where,
          skip,
          take: limit,
          include: {
            tenant: { include: { subscriptions: { orderBy: { createdAt: 'desc' as const }, take: 1 } } },
            manager: { include: { user: true } },
            representative: { include: { user: true } },
            seller: { include: { user: true } },
          },
        }),
        options.prisma.tenantCommercialAssignment.count({ where }),
      ]);

      return {
        clients: assignments.map((a) => ({
          tenantPublicId: a.tenant.publicId,
          tenantName: a.tenant.displayName,
          subscription: a.tenant.subscriptions[0],
          manager: a.manager ? {
            publicId: a.manager.publicId,
            displayName: a.manager.displayName,
            email: a.manager.user.email,
          } : null,
          representative: a.representative ? {
            publicId: a.representative.publicId,
            displayName: a.representative.displayName,
            email: a.representative.user.email,
          } : null,
          seller: a.seller ? {
            publicId: a.seller.publicId,
            displayName: a.seller.displayName,
            email: a.seller.user.email,
          } : null,
          assignedAt: a.assignedAt.toISOString(),
        })),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      };
    },
  );

};
