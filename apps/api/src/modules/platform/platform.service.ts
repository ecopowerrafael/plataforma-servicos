import { randomUUID } from 'node:crypto';

import {
  BusinessProfileCatalog,
  publicSiteDefaultsFor,
  CreateTenantCustomFieldRequestSchema,
  CommercialPlanPublicSchema,
  PlanBenefitPublicSchema,
  PlatformAuditResponseSchema,
  type CreateCommercialPlanRequest,
  type CreatePlanBenefitRequest,
  type CreateSubscriptionRequest,
  type PlatformPermissionCode,
  PlatformTenantDetailResponseSchema,
  SubscriptionDetailResponseSchema,
  SubscriptionPublicSchema,
  type UpdateCommercialPlanRequest,
  type UpdatePlanBenefitRequest,
  type TenantTerminologyOverrides,
  type TenantBranding,
  type TenantFeatureCode,
  type CreateTenantCustomFieldRequest,
  type UpdateTenantCustomFieldRequest,
  type TenantSettings,
} from '@plataforma/shared';

import { auditReadDetails } from './audit-sanitizer.js';
import { TenantCommercialPolicyService } from './tenant-commercial-policy.service.js';
import { Prisma, type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { type AuthRequestContext, type RequestMetadata } from '../auth/identity.repository.js';
import { generateOpaqueToken, generatePublicId, hashOpaqueToken } from '../auth/token.service.js';
import { PrismaTenantRepository } from '../tenants/prisma-tenant.repository.js';
import { TenantCustomFieldsResolver } from '../tenants/tenant-custom-fields.resolver.js';
import { TenantExperienceResolver } from '../tenants/tenant-experience.resolver.js';
import { TenantFeaturesResolver } from '../tenants/tenant-features.resolver.js';
import { TenantService } from '../tenants/tenant.service.js';

const effectiveStatuses = new Set(['TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED']);
const platformPermissions = [
  'platform.dashboard.read',
  'platform.tenant.read',
  'platform.tenant.create',
  'platform.tenant.update',
  'platform.tenant.status.manage',
  'platform.plan.read',
  'platform.plan.create',
  'platform.plan.update',
  'platform.plan.status.manage',
  'platform.subscription.read',
  'platform.subscription.create',
  'platform.subscription.update',
  'platform.subscription.status.manage',
  'platform.audit.read',
  'platform.metrics.read',
  'platform.commercial_policy.read',
  'platform.commercial_policy.manage',
  'platform.prospecting.read',
  'platform.prospecting.update',
  'platform.worker.execute',
] as const satisfies readonly PlatformPermissionCode[];

interface PageRequest {
  page: number;
  limit: number;
}

export interface PlatformAuthContext {
  administrator: { id: bigint; publicId: string; status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE' };
  user: AuthRequestContext['user'];
  permissions: PlatformPermissionCode[];
}

function publicMoney(value: bigint): string {
  return value.toString();
}

function pageMeta(total: number, request: PageRequest) {
  return {
    page: request.page,
    limit: request.limit,
    total,
    totalPages: Math.ceil(total / request.limit),
  };
}

function appError(code: string, message: string, statusCode: number): AppError {
  return new AppError({ code, message, statusCode });
}

function subscriptionEffectiveKey(status: string): string | null {
  return effectiveStatuses.has(status) ? 'EFFECTIVE' : null;
}

function periodEnd(start: Date, cycle: string): Date {
  const end = new Date(start);
  const months =
    cycle === 'QUARTERLY' ? 3 : cycle === 'SEMIANNUAL' ? 6 : cycle === 'ANNUAL' ? 12 : 1;
  end.setUTCMonth(end.getUTCMonth() + months);
  return end;
}

function auditData(input: {
  action: string;
  targetType: string;
  targetPublicId?: string;
  tenantId?: bigint;
  userId?: bigint;
  sessionId?: bigint;
  metadata?: Record<string, string | boolean | null>;
  request: RequestMetadata;
}): Prisma.AuditLogUncheckedCreateInput {
  return {
    publicId: generatePublicId(),
    action: input.action,
    targetType: input.targetType,
    ...(input.targetPublicId === undefined ? {} : { targetPublicId: input.targetPublicId }),
    ...(input.tenantId === undefined ? {} : { tenantId: input.tenantId }),
    ...(input.userId === undefined ? {} : { userId: input.userId }),
    ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    ipAddress: input.request.ipAddress,
    userAgent: input.request.userAgent,
  };
}

export function mapPlan(plan: {
  publicId: string;
  code: string;
  name: string;
  subtitle: string | null;
  shortDescription: string | null;
  description: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  billingCycle: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL' | 'CUSTOM';
  priceCents: bigint;
  monthlyPriceCents: bigint | null;
  annualPriceCents: bigint | null;
  currency: string;
  trialDays: number | null;
  isPublic: boolean;
  highlighted: boolean;
  badge: string | null;
  ctaText: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  limits: {
    key: string;
    valueType: 'INTEGER' | 'BOOLEAN' | 'STRING';
    integerValue: bigint | null;
    booleanValue: boolean | null;
    stringValue: string | null;
  }[];
  benefits?:
    | {
        publicId: string;
        text: string;
        sortOrder: number;
        enabled: boolean;
      }[]
    | undefined;
  billingOptions?: {
    publicId: string;
    billingCycle: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL' | 'CUSTOM';
    priceCents: bigint;
    active: boolean;
    sortOrder: number;
    recommended: boolean;
  }[];
}) {
  return CommercialPlanPublicSchema.parse({
    ...plan,
    priceCents: publicMoney(plan.priceCents),
    monthlyPriceCents: plan.monthlyPriceCents === null ? null : publicMoney(plan.monthlyPriceCents),
    annualPriceCents: plan.annualPriceCents === null ? null : publicMoney(plan.annualPriceCents),
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
    limits: plan.limits.map((limit) => ({
      ...limit,
      integerValue: limit.integerValue === null ? null : publicMoney(limit.integerValue),
    })),
    benefits: plan.benefits ?? [],
    billingOptions: (plan.billingOptions ?? [])
      .filter((option) => option.billingCycle !== 'CUSTOM')
      .map((option) => ({ ...option, priceCents: publicMoney(option.priceCents) })),
  });
}

export function mapSubscription(subscription: {
  publicId: string;
  status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELED' | 'EXPIRED';
  startsAt: Date;
  trialEndsAt: Date | null;
  currentPeriodStartsAt: Date;
  currentPeriodEndsAt: Date;
  canceledAt: Date | null;
  suspendedAt: Date | null;
  endsAt: Date | null;
  priceCents: bigint;
  currency: string;
  billingCycle: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL' | 'CUSTOM';
  createdAt: Date;
  updatedAt: Date;
  tenant: { publicId: string };
  plan: {
    publicId: string;
    code: string;
    name: string;
    status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  };
}) {
  return SubscriptionPublicSchema.parse({
    ...subscription,
    tenantPublicId: subscription.tenant.publicId,
    priceCents: publicMoney(subscription.priceCents),
    startsAt: subscription.startsAt.toISOString(),
    trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
    currentPeriodStartsAt: subscription.currentPeriodStartsAt.toISOString(),
    currentPeriodEndsAt: subscription.currentPeriodEndsAt.toISOString(),
    canceledAt: subscription.canceledAt?.toISOString() ?? null,
    suspendedAt: subscription.suspendedAt?.toISOString() ?? null,
    endsAt: subscription.endsAt?.toISOString() ?? null,
    createdAt: subscription.createdAt.toISOString(),
    updatedAt: subscription.updatedAt.toISOString(),
  });
}

// All platform audit actions — used for filtering audit logs without collation conflicts
export const PLATFORM_AUDIT_ACTIONS = [
  'platform.admin.created',
  'platform.admin.provisioned',
  'platform.commercial_policy.updated',
  'platform.dev_fixture.ready',
  'platform.plan.benefit.created',
  'platform.plan.benefit.deleted',
  'platform.plan.benefit.updated',
  'platform.plan.created',
  'platform.plan.deleted',
  'platform.plan.updated',
  'platform.subscription.created',
  'platform.subscription.period_adjusted',
  'platform.subscription.plan_changed',
  'platform.subscription.trial_extended',
  'platform.tenant.branding.updated',
  'platform.tenant.created',
  'platform.tenant.custom_field.created',
  'platform.tenant.custom_field.updated',
  'platform.tenant.features.updated',
  'platform.tenant.terminology.updated',
  'platform.tenant.updated',
  'platform.tenant.settings_updated',
  'platform.tenant.media_uploaded',
  'platform.tenant.media_updated',
  'platform.tenant.media_removed',
  'platform.tenant.public_site_updated',
  'platform.tenant.pwa_published',
  'platform.tenant.service_created',
  'platform.tenant.service_updated',
  'platform.tenant.service_activated',
  'platform.tenant.service_deactivated',
  'platform.tenant.service_image_updated',
  'platform.tenant.service_image_removed',
  'platform.tenant.service_category_created',
  'platform.tenant.service_category_updated',
  'platform.tenant.service_category_activated',
  'platform.tenant.service_category_deactivated',
  'platform.tenant.professional_created',
  'platform.tenant.professional_updated',
  'platform.tenant.professional_activated',
  'platform.tenant.professional_deactivated',
  'platform.tenant.professional_photo_replaced',
  'platform.tenant.professional_photo_removed',
  'platform.tenant.professional_password_changed',
];

export class PlatformService {
  private readonly experienceResolver: TenantExperienceResolver;
  private readonly featuresResolver: TenantFeaturesResolver;
  private readonly customFieldsResolver: TenantCustomFieldsResolver;
  private readonly commercialPolicyService: TenantCommercialPolicyService;
  private readonly tenantService: TenantService;

  public constructor(private readonly client: PrismaClient) {
    this.experienceResolver = new TenantExperienceResolver(client);
    this.featuresResolver = new TenantFeaturesResolver(client);
    this.customFieldsResolver = new TenantCustomFieldsResolver(client);
    this.commercialPolicyService = new TenantCommercialPolicyService(client);
    this.tenantService = new TenantService(new PrismaTenantRepository(client));
  }

  /** Resolve o publicId de um tenant para o id interno, ou 404. */
  public async resolveTenantId(publicId: string): Promise<bigint> {
    const tenant = await this.client.tenant.findUnique({ where: { publicId }, select: { id: true } });
    if (tenant === null)
      throw appError('PLATFORM_TENANT_NOT_FOUND', 'O estabelecimento não foi encontrado.', 404);
    return tenant.id;
  }

  public async updateTenantSettings(
    publicId: string,
    input: TenantSettings,
    actor: PlatformAuthContext,
    metadata: RequestMetadata,
  ) {
    const tenantId = await this.resolveTenantId(publicId);
    const settings = await this.tenantService.updateSettings(tenantId, input);
    await this.client.auditLog.create({
      data: auditData({
        action: 'platform.tenant.settings_updated',
        targetType: 'tenant_settings',
        targetPublicId: publicId,
        tenantId,
        userId: actor.user.id,
        request: metadata,
      }),
    });
    return { settings };
  }

  /**
   * Registra uma ação administrativa do /platform sobre um tenant sem tocar
   * no audit log interno do próprio estabelecimento (a ação não deve
   * aparecer no histórico que o dono do tenant vê).
   */
  public async recordTenantAudit(
    action: string,
    targetType: string,
    targetPublicId: string,
    tenantId: bigint,
    actor: PlatformAuthContext,
    metadata: RequestMetadata,
  ): Promise<void> {
    await this.client.auditLog.create({
      data: auditData({
        action,
        targetType,
        targetPublicId,
        tenantId,
        userId: actor.user.id,
        request: metadata,
      }),
    });
  }

  public async resolveAuth(auth: AuthRequestContext): Promise<PlatformAuthContext> {
    const administrator = await this.client.platformAdministrator.findUnique({
      where: { userId: auth.user.id },
      include: {
        roles: {
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
      },
    });
    if (auth.user.status !== 'ACTIVE' || administrator?.status !== 'ACTIVE') {
      throw appError(
        'PLATFORM_ACCESS_DENIED',
        'O acesso administrativo global não está autorizado.',
        403,
      );
    }
    const permissions = [
      ...new Set(
        administrator.roles.flatMap(({ role }) =>
          role.permissions.map(({ permission }) => permission.code),
        ),
      ),
    ].filter((value): value is PlatformPermissionCode =>
      platformPermissions.includes(value as PlatformPermissionCode),
    );
    await this.client.platformAdministrator.update({
      where: { id: administrator.id },
      data: { lastAccessAt: new Date() },
    });
    return {
      administrator: {
        id: administrator.id,
        publicId: administrator.publicId,
        status: administrator.status,
      },
      user: auth.user,
      permissions,
    };
  }

  public requirePermission(context: PlatformAuthContext, permission: PlatformPermissionCode): void {
    if (!context.permissions.includes(permission))
      throw appError(
        'PLATFORM_PERMISSION_DENIED',
        'A permissão global necessária não foi concedida.',
        403,
      );
  }

  public async createInitialAdministrator(
    email: string,
    metadata: RequestMetadata,
  ): Promise<string> {
    const normalizedEmail = email.trim().toLowerCase();
    return this.client
      .$transaction(async (transaction) => {
        const user = await transaction.user.findUnique({
          where: { normalizedEmail },
          select: { id: true, publicId: true },
        });
        if (user === null)
          throw appError('PLATFORM_ADMIN_USER_NOT_FOUND', 'O usuário informado não existe.', 404);
        const role = await transaction.platformRole.findUnique({
          where: { code: 'PLATFORM_ADMIN' },
        });
        if (role === null) throw new Error('O bootstrap global não foi executado.');
        const administrator = await transaction.platformAdministrator.create({
          data: { publicId: randomUUID(), userId: user.id, status: 'ACTIVE' },
        });
        await transaction.platformAdministratorRole.create({
          data: { administratorId: administrator.id, roleId: role.id },
        });
        await transaction.auditLog.create({
          data: auditData({
            action: 'platform.admin.created',
            targetType: 'platform_administrator',
            targetPublicId: administrator.publicId,
            userId: user.id,
            request: metadata,
          }),
        });
        return administrator.publicId;
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
          throw appError(
            'PLATFORM_ADMIN_CONFLICT',
            'O usuário já possui administração global.',
            409,
          );
        throw error;
      });
  }

  /**
   * Provisionamento idempotente do primeiro administrador da plataforma a partir
   * de credenciais fornecidas por ambiente (uso: primeiro acesso). Cria o usuário
   * (ACTIVE, senha já com hash) caso não exista e o promove a PLATFORM_ADMIN.
   * Se o usuário já existe, apenas promove; se já é administrador, não faz nada.
   * A senha NUNCA trafega/armazena em texto puro — o hash é calculado pelo
   * mecanismo de autenticação existente antes de chamar este método, e só é
   * aplicado quando o usuário é criado (nunca sobrescreve senha existente).
   */
  public async ensureInitialAdministrator(input: {
    email: string;
    hashPassword: () => Promise<string>;
    metadata: RequestMetadata;
  }): Promise<'created' | 'promoted' | 'exists'> {
    const normalizedEmail = input.email.trim().toLowerCase();
    return this.client.$transaction(async (transaction) => {
      const role = await transaction.platformRole.findUnique({
        where: { code: 'PLATFORM_ADMIN' },
      });
      if (role === null)
        throw new Error('O bootstrap global não foi executado (papel PLATFORM_ADMIN ausente).');

      let user = await transaction.user.findUnique({
        where: { normalizedEmail },
        select: { id: true, publicId: true },
      });

      let created = false;
      if (user === null) {
        const now = new Date();
        user = await transaction.user.create({
          data: {
            publicId: randomUUID(),
            email: input.email.trim(),
            normalizedEmail,
            passwordHash: await input.hashPassword(),
            status: 'ACTIVE',
            emailVerifiedAt: now,
            passwordChangedAt: now,
          },
          select: { id: true, publicId: true },
        });
        created = true;
      }

      const existing = await transaction.platformAdministrator.findFirst({
        where: { userId: user.id },
        select: { id: true },
      });
      if (existing !== null) {
        return 'exists';
      }

      const administrator = await transaction.platformAdministrator.create({
        data: { publicId: randomUUID(), userId: user.id, status: 'ACTIVE' },
      });
      await transaction.platformAdministratorRole.create({
        data: { administratorId: administrator.id, roleId: role.id },
      });
      await transaction.auditLog.create({
        data: auditData({
          action: 'platform.admin.provisioned',
          targetType: 'platform_administrator',
          targetPublicId: administrator.publicId,
          userId: user.id,
          request: input.metadata,
        }),
      });
      return created ? 'created' : 'promoted';
    });
  }

  public async getMe(context: PlatformAuthContext) {
    return {
      administrator: {
        publicId: context.administrator.publicId,
        status: context.administrator.status,
        user: {
          publicId: context.user.publicId,
          email: context.user.email,
          status: context.user.status,
        },
        permissions: context.permissions,
        lastAccessAt:
          (
            await this.client.platformAdministrator.findUniqueOrThrow({
              where: { id: context.administrator.id },
              select: { lastAccessAt: true },
            })
          ).lastAccessAt?.toISOString() ?? null,
      },
    };
  }

  public async listPlans(query: {
    page: number;
    limit: number;
    status?: string | undefined;
    billingCycle?: string | undefined;
    isPublic?: boolean | undefined;
    orderBy: string;
    direction: 'asc' | 'desc';
  }) {
    const where = {
      ...(query.status === undefined
        ? {}
        : { status: query.status as 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' }),
      ...(query.billingCycle === undefined
        ? {}
        : {
            billingCycle: query.billingCycle as
              'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL' | 'CUSTOM',
          }),
      ...(query.isPublic === undefined ? {} : { isPublic: query.isPublic }),
    };
    const [total, plans] = await this.client.$transaction([
      this.client.commercialPlan.count({ where }),
      this.client.commercialPlan.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { [query.orderBy]: query.direction },
        include: {
          limits: { orderBy: { key: 'asc' } },
          benefits: { orderBy: { sortOrder: 'asc' } },
          billingOptions: { orderBy: { sortOrder: 'asc' } },
        },
      }),
    ]);
    return { items: plans.map(mapPlan), page: pageMeta(total, query) };
  }

  public async listPublicPlans(defaultTrialDays: number) {
    const plans = await this.client.commercialPlan.findMany({
      where: { status: 'ACTIVE', isPublic: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        limits: { orderBy: { key: 'asc' } },
        benefits: { where: { enabled: true }, orderBy: { sortOrder: 'asc' } },
        billingOptions: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
    return plans.map((plan) =>
      mapPlan({
        ...plan,
        trialDays: plan.trialDays ?? defaultTrialDays,
      }),
    );
  }

  public async getPlan(publicId: string) {
    const plan = await this.client.commercialPlan.findUnique({
      where: { publicId },
      include: {
        limits: { orderBy: { key: 'asc' } },
        benefits: { orderBy: { sortOrder: 'asc' } },
        billingOptions: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (plan === null)
      throw appError('PLATFORM_PLAN_NOT_FOUND', 'O plano não foi encontrado.', 404);
    return { plan: mapPlan(plan) };
  }

  public async createPlan(
    input: CreateCommercialPlanRequest,
    actor: PlatformAuthContext,
    metadata: RequestMetadata,
  ) {
    try {
      const plan = await this.client.$transaction(
        async (transaction) => {
          const defaultBillingOption =
            input.billingOptions.find((option) => option.active && option.recommended) ??
            input.billingOptions.find((option) => option.active);
          const created = await transaction.commercialPlan.create({
            data: {
              publicId: randomUUID(),
              code: input.code,
              name: input.name,
              subtitle: input.subtitle ?? null,
              shortDescription: input.shortDescription ?? null,
              description: input.description ?? null,
              billingCycle: defaultBillingOption?.billingCycle ?? input.billingCycle,
              priceCents: BigInt(defaultBillingOption?.priceCents ?? input.priceCents),
              monthlyPriceCents:
                input.monthlyPriceCents === undefined || input.monthlyPriceCents === null
                  ? null
                  : BigInt(input.monthlyPriceCents),
              annualPriceCents:
                input.annualPriceCents === undefined || input.annualPriceCents === null
                  ? null
                  : BigInt(input.annualPriceCents),
              currency: input.currency,
              trialDays: input.trialDays ?? null,
              isPublic: input.isPublic,
              highlighted: input.highlighted,
              badge: input.badge ?? null,
              ctaText: input.ctaText ?? null,
              sortOrder: input.sortOrder,
              limits: {
                create: input.limits.map((limit) => ({
                  key: limit.key,
                  valueType: limit.valueType,
                  integerValue:
                    limit.integerValue === undefined || limit.integerValue === null
                      ? null
                      : BigInt(limit.integerValue),
                  booleanValue: limit.booleanValue ?? null,
                  stringValue: limit.stringValue ?? null,
                })),
              },
              billingOptions: {
                create: input.billingOptions.map((option) => ({
                  publicId: randomUUID(),
                  billingCycle: option.billingCycle,
                  priceCents: BigInt(option.priceCents),
                  active: option.active,
                  sortOrder: option.sortOrder,
                  recommended: option.recommended,
                })),
              },
            },
            include: {
              limits: { orderBy: { key: 'asc' } },
              benefits: { orderBy: { sortOrder: 'asc' } },
              billingOptions: { orderBy: { sortOrder: 'asc' } },
            },
          });
          await transaction.auditLog.create({
            data: auditData({
              action: 'platform.plan.created',
              targetType: 'commercial_plan',
              targetPublicId: created.publicId,
              userId: actor.user.id,
              metadata: { code: created.code },
              request: metadata,
            }),
          });
          return created;
        },
        { isolationLevel: 'Serializable' },
      );
      return { plan: mapPlan(plan) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw appError('PLATFORM_PLAN_CODE_CONFLICT', 'O código do plano já está em uso.', 409);
      throw error;
    }
  }

  public async updatePlan(
    publicId: string,
    input: UpdateCommercialPlanRequest,
    actor: PlatformAuthContext,
    metadata: RequestMetadata,
  ) {
    const existing = await this.client.commercialPlan.findUnique({
      where: { publicId },
      include: { subscriptions: { where: { effectiveKey: 'EFFECTIVE' }, take: 1 } },
    });
    if (existing === null)
      throw appError('PLATFORM_PLAN_NOT_FOUND', 'O plano não foi encontrado.', 404);
    if (
      input.code !== undefined &&
      input.code !== existing.code &&
      existing.subscriptions.length > 0
    )
      throw appError(
        'PLATFORM_PLAN_CODE_LOCKED',
        'O código não pode mudar com assinatura efetiva.',
        409,
      );
    try {
      const plan = await this.client.$transaction(
        async (transaction) => {
          const updated = await transaction.commercialPlan.update({
            where: { id: existing.id },
            data: {
              ...(input.code === undefined ? {} : { code: input.code }),
              ...(input.name === undefined ? {} : { name: input.name }),
              ...(input.subtitle === undefined ? {} : { subtitle: input.subtitle }),
              ...(input.shortDescription === undefined
                ? {}
                : { shortDescription: input.shortDescription }),
              ...(input.description === undefined ? {} : { description: input.description }),
              ...(input.billingCycle === undefined ? {} : { billingCycle: input.billingCycle }),
              ...(input.priceCents === undefined ? {} : { priceCents: BigInt(input.priceCents) }),
              ...(input.monthlyPriceCents === undefined
                ? {}
                : {
                    monthlyPriceCents:
                      input.monthlyPriceCents === null ? null : BigInt(input.monthlyPriceCents),
                  }),
              ...(input.annualPriceCents === undefined
                ? {}
                : {
                    annualPriceCents:
                      input.annualPriceCents === null ? null : BigInt(input.annualPriceCents),
                  }),
              ...(input.currency === undefined ? {} : { currency: input.currency }),
              ...(input.trialDays === undefined ? {} : { trialDays: input.trialDays }),
              ...(input.isPublic === undefined ? {} : { isPublic: input.isPublic }),
              ...(input.highlighted === undefined ? {} : { highlighted: input.highlighted }),
              ...(input.badge === undefined ? {} : { badge: input.badge }),
              ...(input.ctaText === undefined ? {} : { ctaText: input.ctaText }),
              ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
              ...(input.limits === undefined
                ? {}
                : {
                    limits: {
                      deleteMany: {},
                      create: input.limits.map((limit) => ({
                        key: limit.key,
                        valueType: limit.valueType,
                        integerValue:
                          limit.integerValue === undefined || limit.integerValue === null
                            ? null
                            : BigInt(limit.integerValue),
                        booleanValue: limit.booleanValue ?? null,
                        stringValue: limit.stringValue ?? null,
                      })),
                    },
                  }),
              ...(input.billingOptions === undefined
                ? {}
                : {
                    billingOptions: {
                      deleteMany: {},
                      create: input.billingOptions.map((option) => ({
                        publicId: randomUUID(),
                        billingCycle: option.billingCycle,
                        priceCents: BigInt(option.priceCents),
                        active: option.active,
                        sortOrder: option.sortOrder,
                        recommended: option.recommended,
                      })),
                    },
                  }),
            },
            include: {
              limits: { orderBy: { key: 'asc' } },
              benefits: { orderBy: { sortOrder: 'asc' } },
              billingOptions: { orderBy: { sortOrder: 'asc' } },
            },
          });
          await transaction.auditLog.create({
            data: auditData({
              action: 'platform.plan.updated',
              targetType: 'commercial_plan',
              targetPublicId: updated.publicId,
              userId: actor.user.id,
              request: metadata,
            }),
          });
          return updated;
        },
        { isolationLevel: 'Serializable' },
      );
      return { plan: mapPlan(plan) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw appError('PLATFORM_PLAN_CODE_CONFLICT', 'O código do plano já está em uso.', 409);
      throw error;
    }
  }

  public async changePlanStatus(
    publicId: string,
    status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED',
    actor: PlatformAuthContext,
    metadata: RequestMetadata,
  ) {
    const plan = await this.client.commercialPlan.findUnique({ where: { publicId } });
    if (plan === null)
      throw appError('PLATFORM_PLAN_NOT_FOUND', 'O plano não foi encontrado.', 404);
    const updated = await this.client.$transaction(async (transaction) => {
      const value = await transaction.commercialPlan.update({
        where: { id: plan.id },
        data: { status },
        include: {
          limits: { orderBy: { key: 'asc' } },
          benefits: { orderBy: { sortOrder: 'asc' } },
        },
      });
      await transaction.auditLog.create({
        data: auditData({
          action:
            status === 'ACTIVE'
              ? 'platform.plan.activated'
              : status === 'INACTIVE'
                ? 'platform.plan.deactivated'
                : 'platform.plan.archived',
          targetType: 'commercial_plan',
          targetPublicId: value.publicId,
          userId: actor.user.id,
          request: metadata,
        }),
      });
      return value;
    });
    return { plan: mapPlan(updated) };
  }

  public async deletePlan(
    publicId: string,
    actor: PlatformAuthContext,
    metadata: RequestMetadata,
  ): Promise<void> {
    const plan = await this.client.commercialPlan.findUnique({ where: { publicId } });
    if (plan === null)
      throw appError('PLATFORM_PLAN_NOT_FOUND', 'O plano nao foi encontrado.', 404);
    const [subscriptions, history] = await Promise.all([
      this.client.tenantSubscription.count({ where: { planId: plan.id } }),
      this.client.subscriptionHistory.count({
        where: { OR: [{ previousPlanId: plan.id }, { newPlanId: plan.id }] },
      }),
    ]);
    const references = subscriptions + history;
    if (references > 0)
      throw appError(
        'PLAN_IN_USE',
        `Este plano ja possui assinaturas vinculadas e nao pode ser excluido. Voce pode desativa-lo para impedir novas assinaturas. Referencias encontradas: ${String(references)}.`,
        409,
      );
    await this.client.$transaction(async (transaction) => {
      await transaction.planBenefit.deleteMany({ where: { planId: plan.id } });
      await transaction.planBillingOption.deleteMany({ where: { planId: plan.id } });
      await transaction.planLimit.deleteMany({ where: { planId: plan.id } });
      await transaction.commercialPlan.delete({ where: { id: plan.id } });
      await transaction.auditLog.create({
        data: auditData({
          action: 'platform.plan.deleted',
          targetType: 'commercial_plan',
          targetPublicId: plan.publicId,
          userId: actor.user.id,
          metadata: { code: plan.code },
          request: metadata,
        }),
      });
    });
  }

  public async listPlanBenefits(planPublicId: string) {
    const plan = await this.client.commercialPlan.findUnique({
      where: { publicId: planPublicId },
      select: { id: true },
    });
    if (plan === null)
      throw appError('PLATFORM_PLAN_NOT_FOUND', 'O plano não foi encontrado.', 404);
    const benefits = await this.client.planBenefit.findMany({
      where: { planId: plan.id },
      orderBy: { sortOrder: 'asc' },
    });
    return { items: benefits.map((benefit) => PlanBenefitPublicSchema.parse(benefit)) };
  }

  public async createPlanBenefit(
    planPublicId: string,
    input: CreatePlanBenefitRequest,
    actor: PlatformAuthContext,
    metadata: RequestMetadata,
  ) {
    const plan = await this.client.commercialPlan.findUnique({
      where: { publicId: planPublicId },
      select: { id: true },
    });
    if (plan === null)
      throw appError('PLATFORM_PLAN_NOT_FOUND', 'O plano não foi encontrado.', 404);
    const benefit = await this.client.$transaction(async (transaction) => {
      const created = await transaction.planBenefit.create({
        data: {
          publicId: randomUUID(),
          planId: plan.id,
          text: input.text,
          sortOrder: input.sortOrder,
          enabled: input.enabled,
        },
      });
      await transaction.auditLog.create({
        data: auditData({
          action: 'platform.plan.benefit.created',
          targetType: 'plan_benefit',
          targetPublicId: created.publicId,
          userId: actor.user.id,
          request: metadata,
        }),
      });
      return created;
    });
    return { benefit: PlanBenefitPublicSchema.parse(benefit) };
  }

  public async updatePlanBenefit(
    publicId: string,
    input: UpdatePlanBenefitRequest,
    actor: PlatformAuthContext,
    metadata: RequestMetadata,
  ) {
    const existing = await this.client.planBenefit.findUnique({ where: { publicId } });
    if (existing === null)
      throw appError('PLATFORM_PLAN_BENEFIT_NOT_FOUND', 'O benefício não foi encontrado.', 404);
    const benefit = await this.client.$transaction(async (transaction) => {
      const updated = await transaction.planBenefit.update({
        where: { id: existing.id },
        data: {
          ...(input.text === undefined ? {} : { text: input.text }),
          ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
          ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
        },
      });
      await transaction.auditLog.create({
        data: auditData({
          action: 'platform.plan.benefit.updated',
          targetType: 'plan_benefit',
          targetPublicId: updated.publicId,
          userId: actor.user.id,
          request: metadata,
        }),
      });
      return updated;
    });
    return { benefit: PlanBenefitPublicSchema.parse(benefit) };
  }

  public async deletePlanBenefit(
    publicId: string,
    actor: PlatformAuthContext,
    metadata: RequestMetadata,
  ) {
    const existing = await this.client.planBenefit.findUnique({ where: { publicId } });
    if (existing === null)
      throw appError('PLATFORM_PLAN_BENEFIT_NOT_FOUND', 'O benefício não foi encontrado.', 404);
    await this.client.$transaction(async (transaction) => {
      await transaction.planBenefit.delete({ where: { id: existing.id } });
      await transaction.auditLog.create({
        data: auditData({
          action: 'platform.plan.benefit.deleted',
          targetType: 'plan_benefit',
          targetPublicId: existing.publicId,
          userId: actor.user.id,
          request: metadata,
        }),
      });
    });
  }

  public async createSubscription(
    tenantPublicId: string,
    input: CreateSubscriptionRequest,
    actor: PlatformAuthContext,
    metadata: RequestMetadata,
  ) {
    const now = input.startsAt === undefined ? new Date() : new Date(input.startsAt);
    const policy = await this.commercialPolicyService.getOrCreateRaw();
    return this.client.$transaction(
      async (transaction) => {
        const [tenant, plan] = await Promise.all([
          transaction.tenant.findUnique({ where: { publicId: tenantPublicId } }),
          transaction.commercialPlan.findUnique({
            where: { publicId: input.planPublicId },
            include: { billingOptions: true },
          }),
        ]);
        if (tenant === null)
          throw appError('PLATFORM_TENANT_NOT_FOUND', 'O estabelecimento não foi encontrado.', 404);
        if (plan?.status !== 'ACTIVE')
          throw appError(
            'PLATFORM_PLAN_UNAVAILABLE',
            'O plano não está disponível para nova assinatura.',
            409,
          );
        const effectiveTrialDays = plan.trialDays ?? policy.defaultTrialDays;
        const billingCycle =
          input.billingCycle ??
          plan.billingOptions.find((option) => option.recommended && option.active)?.billingCycle ??
          plan.billingOptions.find((option) => option.active)?.billingCycle ??
          plan.billingCycle;
        const option = plan.billingOptions.find(
          (item) => item.billingCycle === billingCycle && item.active,
        );
        if (plan.billingOptions.length > 0 && option === undefined)
          throw appError(
            'PLATFORM_BILLING_OPTION_UNAVAILABLE',
            'Esta periodicidade não está disponível para o plano.',
            409,
          );
        const priceCents =
          option?.priceCents ??
          (billingCycle === 'ANNUAL'
            ? (plan.annualPriceCents ?? plan.priceCents)
            : billingCycle === 'MONTHLY'
              ? (plan.monthlyPriceCents ?? plan.priceCents)
              : plan.priceCents);
        const trialEndsAt =
          input.trial && effectiveTrialDays > 0
            ? new Date(now.getTime() + effectiveTrialDays * 86_400_000)
            : null;
        const status = trialEndsAt === null ? 'ACTIVE' : 'TRIALING';
        const currentPeriodEndsAt =
          input.currentPeriodEndsAt === undefined
            ? periodEnd(now, billingCycle)
            : new Date(input.currentPeriodEndsAt);
        if (currentPeriodEndsAt <= now)
          throw appError(
            'PLATFORM_SUBSCRIPTION_DATES_INVALID',
            'O período da assinatura é inválido.',
            400,
          );
        try {
          const subscription = await transaction.tenantSubscription.create({
            data: {
              publicId: randomUUID(),
              tenantId: tenant.id,
              planId: plan.id,
              status,
              startsAt: now,
              trialStartedAt: trialEndsAt === null ? null : now,
              trialEndsAt,
              currentPeriodStartsAt: now,
              currentPeriodEndsAt,
              priceCents,
              currency: plan.currency,
              billingCycle,
              effectiveKey: 'EFFECTIVE',
            },
            include: { tenant: true, plan: true },
          });
          await transaction.subscriptionHistory.create({
            data: {
              publicId: randomUUID(),
              subscriptionId: subscription.id,
              tenantId: tenant.id,
              action: status === 'TRIALING' ? 'TRIAL_STARTED' : 'CREATED',
              newStatus: status,
              newPlanId: plan.id,
              reason: input.reason,
              performedByUserId: actor.user.id,
            },
          });
          await transaction.auditLog.create({
            data: auditData({
              action: 'platform.subscription.created',
              targetType: 'tenant_subscription',
              targetPublicId: subscription.publicId,
              tenantId: tenant.id,
              userId: actor.user.id,
              metadata: { status },
              request: metadata,
            }),
          });
          return { subscription: mapSubscription(subscription) };
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
            throw appError(
              'PLATFORM_SUBSCRIPTION_CONFLICT',
              'Já existe uma assinatura efetiva para o estabelecimento.',
              409,
            );
          throw error;
        }
      },
      { isolationLevel: 'Serializable' },
    );
  }

  public async listSubscriptions(query: {
    page: number;
    limit: number;
    status?: string | undefined;
    planPublicId?: string | undefined;
    tenantPublicId?: string | undefined;
    orderBy: string;
    direction: 'asc' | 'desc';
  }) {
    const where = {
      ...(query.status === undefined ? {} : { status: query.status as never }),
      ...(query.planPublicId === undefined ? {} : { plan: { publicId: query.planPublicId } }),
      ...(query.tenantPublicId === undefined ? {} : { tenant: { publicId: query.tenantPublicId } }),
    };
    const total = await this.client.tenantSubscription.count({ where });
    const items = await this.client.tenantSubscription.findMany({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { [query.orderBy]: query.direction },
      include: { tenant: true, plan: true },
    });
    return { items: items.map(mapSubscription), page: pageMeta(total, query) };
  }

  public async getSubscription(publicId: string, page: PageRequest) {
    const subscription = await this.client.tenantSubscription.findUnique({
      where: { publicId },
      include: { tenant: true, plan: true },
    });
    if (subscription === null)
      throw appError('PLATFORM_SUBSCRIPTION_NOT_FOUND', 'A assinatura não foi encontrada.', 404);
    const total = await this.client.subscriptionHistory.count({ where: { subscriptionId: subscription.id } });
    const history = await this.client.subscriptionHistory.findMany({
      where: { subscriptionId: subscription.id },
      skip: (page.page - 1) * page.limit,
      take: page.limit,
      orderBy: { createdAt: 'desc' },
      include: { performedByUser: true },
    });
    return SubscriptionDetailResponseSchema.parse({
      subscription: mapSubscription(subscription),
      history: history.map((item) => ({
        publicId: item.publicId,
        action: item.action,
        previousStatus: item.previousStatus,
        newStatus: item.newStatus,
        reason: item.reason,
        performedBy:
          item.performedByUser === null
            ? null
            : {
                publicId: item.performedByUser.publicId,
                email: item.performedByUser.email,
                status: item.performedByUser.status,
              },
        createdAt: item.createdAt.toISOString(),
      })),
      historyPage: pageMeta(total, page),
    });
  }

  public async transitionSubscription(
    publicId: string,
    action: 'ACTIVATED' | 'SUSPENDED' | 'REACTIVATED' | 'CANCELED',
    reason: string,
    actor: PlatformAuthContext,
    metadata: RequestMetadata,
  ) {
    const nextStatus =
      action === 'ACTIVATED' || action === 'REACTIVATED'
        ? 'ACTIVE'
        : action === 'SUSPENDED'
          ? 'SUSPENDED'
          : 'CANCELED';
    const subscription = await this.client.tenantSubscription.findUnique({
      where: { publicId },
      include: { tenant: true, plan: true },
    });
    if (subscription === null)
      throw appError('PLATFORM_SUBSCRIPTION_NOT_FOUND', 'A assinatura não foi encontrada.', 404);
    if (subscription.status === 'EXPIRED')
      throw appError(
        'PLATFORM_SUBSCRIPTION_INVALID_STATE',
        'A assinatura expirada não pode receber esta alteração.',
        409,
      );
    const allowed =
      action === 'ACTIVATED'
        ? ['TRIALING', 'PAST_DUE'].includes(subscription.status)
        : action === 'REACTIVATED'
          ? subscription.status === 'SUSPENDED'
          : action === 'SUSPENDED'
            ? ['TRIALING', 'ACTIVE', 'PAST_DUE'].includes(subscription.status)
            : !['CANCELED', 'EXPIRED'].includes(subscription.status);
    if (!allowed)
      throw appError(
        'PLATFORM_SUBSCRIPTION_INVALID_STATE',
        'O estado atual da assinatura nao permite esta acao.',
        409,
      );
    const value = await this.client.$transaction(
      async (transaction) => {
        const now = new Date();
        const activating = action === 'ACTIVATED' || action === 'REACTIVATED';
        const resetPeriod = activating && subscription.currentPeriodEndsAt <= now;
        const updated = await transaction.tenantSubscription.update({
          where: { id: subscription.id },
          data: {
            status: nextStatus,
            effectiveKey: subscriptionEffectiveKey(nextStatus),
            ...(nextStatus === 'SUSPENDED' ? { suspendedAt: now } : {}),
            ...(nextStatus === 'CANCELED' ? { canceledAt: now, endsAt: now } : {}),
            ...(action === 'ACTIVATED' || action === 'REACTIVATED' ? { graceEndsAt: null } : {}),
            ...(resetPeriod
              ? {
                  currentPeriodStartsAt: now,
                  currentPeriodEndsAt: periodEnd(now, subscription.billingCycle),
                }
              : {}),
            ...(action === 'ACTIVATED' && subscription.status === 'TRIALING'
              ? { trialEndsAt: now }
              : {}),
          },
          include: { tenant: true, plan: true },
        });
        await transaction.subscriptionHistory.create({
          data: {
            publicId: randomUUID(),
            subscriptionId: updated.id,
            tenantId: updated.tenantId,
            action,
            previousStatus: subscription.status,
            newStatus: nextStatus,
            previousPlanId: subscription.planId,
            newPlanId: updated.planId,
            reason,
            performedByUserId: actor.user.id,
          },
        });
        const auditAction = {
          ACTIVATED: 'platform.subscription.activated',
          SUSPENDED: 'platform.subscription.suspended',
          REACTIVATED: 'platform.subscription.reactivated',
          CANCELED: 'platform.subscription.canceled',
        }[action];
        await transaction.auditLog.create({
          data: auditData({
            action: auditAction,
            targetType: 'tenant_subscription',
            targetPublicId: updated.publicId,
            tenantId: updated.tenantId,
            userId: actor.user.id,
            metadata: { previousStatus: subscription.status, newStatus: nextStatus, reason },
            request: metadata,
          }),
        });
        return updated;
      },
      { isolationLevel: 'Serializable' },
    );
    return { subscription: mapSubscription(value) };
  }

  public async extendTrial(
    publicId: string,
    trialEndsAt: string,
    reason: string,
    actor: PlatformAuthContext,
    metadata: RequestMetadata,
  ) {
    const subscription = await this.client.tenantSubscription.findUnique({
      where: { publicId },
      include: { tenant: true, plan: true },
    });
    if (subscription === null)
      throw appError('PLATFORM_SUBSCRIPTION_NOT_FOUND', 'A assinatura não foi encontrada.', 404);
    const end = new Date(trialEndsAt);
    if (subscription.status !== 'TRIALING')
      throw appError(
        'PLATFORM_TRIAL_INVALID_STATE',
        'Este trial nao pode mais ser estendido neste estado.',
        409,
      );
    if (
      end <= new Date() ||
      end <= subscription.startsAt ||
      (subscription.trialEndsAt !== null && end <= subscription.trialEndsAt)
    )
      throw appError(
        'PLATFORM_TRIAL_INVALID',
        'A nova data deve ampliar o periodo de teste atual.',
        409,
      );
    const value = await this.client.$transaction(
      async (transaction) => {
        const updated = await transaction.tenantSubscription.update({
          where: { id: subscription.id },
          data: { trialEndsAt: end },
          include: { tenant: true, plan: true },
        });
        await transaction.subscriptionHistory.create({
          data: {
            publicId: randomUUID(),
            subscriptionId: updated.id,
            tenantId: updated.tenantId,
            action: 'TRIAL_EXTENDED',
            previousStatus: subscription.status,
            newStatus: updated.status,
            previousPlanId: updated.planId,
            newPlanId: updated.planId,
            reason,
            performedByUserId: actor.user.id,
          },
        });
        await transaction.auditLog.create({
          data: auditData({
            action: 'platform.subscription.trial_extended',
            targetType: 'tenant_subscription',
            targetPublicId: updated.publicId,
            tenantId: updated.tenantId,
            userId: actor.user.id,
            metadata: {
              previousTrialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
              newTrialEndsAt: end.toISOString(),
              reason,
            },
            request: metadata,
          }),
        });
        return updated;
      },
      { isolationLevel: 'Serializable' },
    );
    return { subscription: mapSubscription(value) };
  }

  public async changeSubscriptionPlan(
    publicId: string,
    planPublicId: string,
    requestedBillingCycle: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL' | 'CUSTOM' | undefined,
    reason: string,
    actor: PlatformAuthContext,
    metadata: RequestMetadata,
  ) {
    const subscription = await this.client.tenantSubscription.findUnique({
      where: { publicId },
      include: { tenant: true, plan: true },
    });
    const plan = await this.client.commercialPlan.findUnique({
      where: { publicId: planPublicId },
      include: { billingOptions: true },
    });
    if (subscription === null)
      throw appError('PLATFORM_SUBSCRIPTION_NOT_FOUND', 'A assinatura não foi encontrada.', 404);
    if (plan === null)
      throw appError('PLATFORM_PLAN_NOT_FOUND', 'O plano nao foi encontrado.', 404);
    if (plan.status !== 'ACTIVE')
      throw appError('PLATFORM_PLAN_INACTIVE', 'Este plano esta inativo.', 409);
    if (plan.id === subscription.planId)
      throw appError('PLATFORM_PLAN_UNCHANGED', 'A assinatura ja utiliza este plano.', 409);
    if (plan.currency !== subscription.currency)
      throw appError('PLATFORM_CURRENCY_CONFLICT', 'A moeda do plano é incompatível.', 409);
    const billingCycle =
      requestedBillingCycle ??
      plan.billingOptions.find((option) => option.recommended && option.active)?.billingCycle ??
      plan.billingOptions.find((option) => option.active)?.billingCycle ??
      plan.billingCycle;
    const option = plan.billingOptions.find(
      (item) => item.billingCycle === billingCycle && item.active,
    );
    if (plan.billingOptions.length > 0 && option === undefined)
      throw appError(
        'PLATFORM_BILLING_OPTION_UNAVAILABLE',
        'Esta periodicidade não está disponível para o plano.',
        409,
      );
    const priceCents =
      option?.priceCents ??
      (billingCycle === 'ANNUAL'
        ? (plan.annualPriceCents ?? plan.priceCents)
        : billingCycle === 'MONTHLY'
          ? (plan.monthlyPriceCents ?? plan.priceCents)
          : plan.priceCents);
    const value = await this.client.$transaction(
      async (transaction) => {
        const updated = await transaction.tenantSubscription.update({
          where: { id: subscription.id },
          data: { planId: plan.id, priceCents, billingCycle },
          include: { tenant: true, plan: true },
        });
        await transaction.subscriptionHistory.create({
          data: {
            publicId: randomUUID(),
            subscriptionId: updated.id,
            tenantId: updated.tenantId,
            action: 'PLAN_CHANGED',
            previousStatus: subscription.status,
            newStatus: updated.status,
            previousPlanId: subscription.planId,
            newPlanId: plan.id,
            reason,
            performedByUserId: actor.user.id,
          },
        });
        await transaction.auditLog.create({
          data: auditData({
            action: 'platform.subscription.plan_changed',
            targetType: 'tenant_subscription',
            targetPublicId: updated.publicId,
            tenantId: updated.tenantId,
            userId: actor.user.id,
            metadata: {
              previousPlanPublicId: subscription.plan.publicId,
              newPlanPublicId: plan.publicId,
              billingCycle,
              previousPriceCents: subscription.priceCents.toString(),
              newPriceCents: priceCents.toString(),
              reason,
            },
            request: metadata,
          }),
        });
        return updated;
      },
      { isolationLevel: 'Serializable' },
    );
    return { subscription: mapSubscription(value) };
  }

  public async updateSubscriptionPeriod(
    publicId: string,
    startsAt: string,
    endsAt: string,
    reason: string,
    actor: PlatformAuthContext,
    metadata: RequestMetadata,
  ) {
    const subscription = await this.client.tenantSubscription.findUnique({
      where: { publicId },
      include: { tenant: true, plan: true },
    });
    if (subscription === null)
      throw appError('PLATFORM_SUBSCRIPTION_NOT_FOUND', 'A assinatura nao foi encontrada.', 404);
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (start >= end)
      throw appError(
        'PLATFORM_SUBSCRIPTION_DATES_INVALID',
        'O fim do periodo deve ser posterior ao inicio.',
        400,
      );
    const value = await this.client.$transaction(async (transaction) => {
      const updated = await transaction.tenantSubscription.update({
        where: { id: subscription.id },
        data: { currentPeriodStartsAt: start, currentPeriodEndsAt: end },
        include: { tenant: true, plan: true },
      });
      const periodMetadata = {
        previousStartsAt: subscription.currentPeriodStartsAt.toISOString(),
        previousEndsAt: subscription.currentPeriodEndsAt.toISOString(),
        newStartsAt: start.toISOString(),
        newEndsAt: end.toISOString(),
      };
      await transaction.subscriptionHistory.create({
        data: {
          publicId: randomUUID(),
          subscriptionId: updated.id,
          tenantId: updated.tenantId,
          action: 'PERIOD_ADJUSTED',
          previousStatus: subscription.status,
          newStatus: updated.status,
          previousPlanId: subscription.planId,
          newPlanId: updated.planId,
          reason,
          performedByUserId: actor.user.id,
          metadata: periodMetadata,
        },
      });
      await transaction.auditLog.create({
        data: auditData({
          action: 'platform.subscription.period_adjusted',
          targetType: 'tenant_subscription',
          targetPublicId: updated.publicId,
          tenantId: updated.tenantId,
          userId: actor.user.id,
          metadata: { ...periodMetadata, reason },
          request: metadata,
        }),
      });
      return updated;
    });
    return { subscription: mapSubscription(value) };
  }

  public async listTenants(query: {
    page: number;
    limit: number;
    status?: string | undefined;
    planPublicId?: string | undefined;
    subscriptionStatus?: string | undefined;
    search?: string | undefined;
    trialActive?: boolean | undefined;
    subscriptionExpired?: boolean | undefined;
    orderBy: string;
    direction: 'asc' | 'desc';
  }) {
    const now = new Date();
    const where: Prisma.TenantWhereInput = {
      ...(query.status === undefined ? {} : { status: query.status as never }),
      ...(query.search === undefined
        ? {}
        : {
            OR: [{ displayName: { contains: query.search } }, { slug: { contains: query.search } }],
          }),
      ...(query.planPublicId === undefined &&
      query.subscriptionStatus === undefined &&
      query.trialActive === undefined &&
      query.subscriptionExpired === undefined
        ? {}
        : {
            subscriptions: {
              some: {
                effectiveKey: 'EFFECTIVE',
                ...(query.planPublicId === undefined
                  ? {}
                  : { plan: { publicId: query.planPublicId } }),
                ...(query.subscriptionStatus === undefined
                  ? {}
                  : { status: query.subscriptionStatus as never }),
                ...(query.trialActive === undefined
                  ? {}
                  : query.trialActive
                    ? { status: 'TRIALING', trialEndsAt: { gt: now } }
                    : { NOT: { status: 'TRIALING' } }),
                ...(query.subscriptionExpired === undefined
                  ? {}
                  : query.subscriptionExpired
                    ? { currentPeriodEndsAt: { lt: now } }
                    : { currentPeriodEndsAt: { gte: now } }),
              },
            },
          }),
    };
    const orderBy: Prisma.TenantOrderByWithRelationInput =
      query.orderBy === 'name'
        ? { displayName: query.direction }
        : query.orderBy === 'status'
          ? { status: query.direction }
          : { createdAt: query.direction };
    const [total, tenants] = await this.client.$transaction([
      this.client.tenant.count({ where }),
      this.client.tenant.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy,
        include: {
          subscriptions: {
            where: { effectiveKey: 'EFFECTIVE' },
            include: { tenant: true, plan: true },
            take: 1,
          },
          _count: { select: { businessUnits: true, memberships: true } },
        },
      }),
    ]);
    return {
      items: tenants.map((tenant) => ({
        publicId: tenant.publicId,
        displayName: tenant.displayName,
        slug: tenant.slug,
        status: tenant.status,
        subscription:
          tenant.subscriptions[0] === undefined ? null : mapSubscription(tenant.subscriptions[0]),
        unitCount: tenant._count.businessUnits,
        memberCount: tenant._count.memberships,
        createdAt: tenant.createdAt.toISOString(),
      })),
      page: pageMeta(total, query),
    };
  }

  public async getTenant(publicId: string) {
    const tenant = await this.client.tenant.findUnique({
      where: { publicId },
      include: {
        settings: true,
        businessUnits: { orderBy: { name: 'asc' } },
        memberships: { where: { isOwner: true }, include: { user: true }, take: 1 },
        subscriptions: {
          where: { effectiveKey: 'EFFECTIVE' },
          include: { tenant: true, plan: true },
          take: 1,
        },
        subscriptionHistory: {
          take: 20,
          orderBy: { createdAt: 'desc' },
          include: { performedByUser: true },
        },
        auditLogs: {
          where: { action: { in: PLATFORM_AUDIT_ACTIONS } },
          take: 20,
          orderBy: { createdAt: 'desc' },
        },
        _count: { select: { businessUnits: true, memberships: true } },
      },
    });
    if (!tenant?.settings)
      throw appError('PLATFORM_TENANT_NOT_FOUND', 'O estabelecimento não foi encontrado.', 404);
    return PlatformTenantDetailResponseSchema.parse({
      tenant: {
        publicId: tenant.publicId,
        slug: tenant.slug,
        legalName: tenant.legalName,
        displayName: tenant.displayName,
        status: tenant.status,
        timezone: tenant.timezone,
        locale: tenant.locale,
        currency: tenant.currency,
      },
      settings: {
        ...tenant.settings,
        timeFormat: tenant.settings.timeFormat === 'H24' ? '24H' : '12H',
      },
      units: tenant.businessUnits.map((unit) => ({ ...unit })),
      owner:
        tenant.memberships[0] === undefined
          ? null
          : {
              publicId: tenant.memberships[0].user.publicId,
              email: tenant.memberships[0].user.email,
              status: tenant.memberships[0].user.status,
            },
      subscription:
        tenant.subscriptions[0] === undefined ? null : mapSubscription(tenant.subscriptions[0]),
      subscriptionHistory: tenant.subscriptionHistory.map((item) => ({
        publicId: item.publicId,
        action: item.action,
        previousStatus: item.previousStatus,
        newStatus: item.newStatus,
        reason: item.reason,
        performedBy:
          item.performedByUser === null
            ? null
            : {
                publicId: item.performedByUser.publicId,
                email: item.performedByUser.email,
                status: item.performedByUser.status,
              },
        createdAt: item.createdAt.toISOString(),
      })),
      audit: tenant.auditLogs.map((item) => ({
        publicId: item.publicId,
        action: item.action,
        targetType: item.targetType,
        createdAt: item.createdAt.toISOString(),
      })),
      counts: { units: tenant._count.businessUnits, members: tenant._count.memberships },
    });
  }

  public async updateTenant(
    publicId: string,
    input: {
      legalName?: string | undefined;
      displayName?: string | undefined;
      slug?: string | undefined;
      timezone?: string | undefined;
      locale?: string | undefined;
      currency?: string | undefined;
    },
    actor: PlatformAuthContext,
    metadata: RequestMetadata,
  ) {
    const tenant = await this.client.tenant.findUnique({ where: { publicId } });
    if (tenant === null)
      throw appError('PLATFORM_TENANT_NOT_FOUND', 'O estabelecimento não foi encontrado.', 404);
    try {
      const updated = await this.client.$transaction(async (transaction) => {
        const value = await transaction.tenant.update({
          where: { id: tenant.id },
          data: {
            ...(input.legalName === undefined ? {} : { legalName: input.legalName }),
            ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
            ...(input.slug === undefined ? {} : { slug: input.slug }),
            ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
            ...(input.locale === undefined ? {} : { locale: input.locale }),
            ...(input.currency === undefined ? {} : { currency: input.currency }),
          },
        });
        await transaction.auditLog.create({
          data: auditData({
            action: 'platform.tenant.updated',
            targetType: 'tenant',
            targetPublicId: value.publicId,
            tenantId: value.id,
            userId: actor.user.id,
            request: metadata,
          }),
        });
        return value;
      });
      return {
        tenant: {
          publicId: updated.publicId,
          slug: updated.slug,
          displayName: updated.displayName,
          status: updated.status,
          timezone: updated.timezone,
          locale: updated.locale,
          currency: updated.currency,
        },
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw appError('TENANT_SLUG_CONFLICT', 'O slug do estabelecimento já está em uso.', 409);
      throw error;
    }
  }

  public async getTenantExperience(publicId: string) {
    const experience = await this.experienceResolver.findByTenantPublicId(publicId);
    if (experience === null)
      throw appError('PLATFORM_TENANT_NOT_FOUND', 'O estabelecimento não foi encontrado.', 404);
    return experience;
  }

  public async updateTenantBranding(
    publicId: string,
    input: { [Key in keyof TenantBranding]?: TenantBranding[Key] | undefined },
    actor: PlatformAuthContext,
    metadata: RequestMetadata,
  ) {
    const tenant = await this.client.tenant.findUnique({
      where: { publicId },
      include: { branding: true },
    });
    if (tenant === null)
      throw appError('PLATFORM_TENANT_NOT_FOUND', 'O estabelecimento não foi encontrado.', 404);

    const defaults = BusinessProfileCatalog[tenant.businessProfile].theme;
    const themeFields = [
      'primaryColor',
      'secondaryColor',
      'accentColor',
      'backgroundColor',
      'surfaceColor',
      'textColor',
      'mutedTextColor',
      'borderColor',
      'borderRadius',
      'fontFamily',
    ] as const;
    const hasThemeChange = themeFields.some((field) => input[field] !== undefined);
    const createData = {
      tenantId: tenant.id,
      useProfileDefaults:
        input.useProfileDefaults ??
        (hasThemeChange ? false : (tenant.branding?.useProfileDefaults ?? true)),
      primaryColor: input.primaryColor ?? tenant.branding?.primaryColor ?? defaults.primaryColor,
      secondaryColor:
        input.secondaryColor ?? tenant.branding?.secondaryColor ?? defaults.secondaryColor,
      accentColor: input.accentColor ?? tenant.branding?.accentColor ?? defaults.accentColor,
      backgroundColor:
        input.backgroundColor ?? tenant.branding?.backgroundColor ?? defaults.backgroundColor,
      surfaceColor: input.surfaceColor ?? tenant.branding?.surfaceColor ?? defaults.surfaceColor,
      textColor: input.textColor ?? tenant.branding?.textColor ?? defaults.textColor,
      mutedTextColor:
        input.mutedTextColor ?? tenant.branding?.mutedTextColor ?? defaults.mutedTextColor,
      borderColor: input.borderColor ?? tenant.branding?.borderColor ?? defaults.borderColor,
      borderRadius: input.borderRadius ?? tenant.branding?.borderRadius ?? defaults.borderRadius,
      fontFamily: input.fontFamily ?? tenant.branding?.fontFamily ?? defaults.fontFamily,
      logoUrl: input.logoUrl === undefined ? (tenant.branding?.logoUrl ?? null) : input.logoUrl,
      faviconUrl:
        input.faviconUrl === undefined ? (tenant.branding?.faviconUrl ?? null) : input.faviconUrl,
      bannerUrl:
        input.bannerUrl === undefined ? (tenant.branding?.bannerUrl ?? null) : input.bannerUrl,
      pwaIconUrl:
        input.pwaIconUrl === undefined ? (tenant.branding?.pwaIconUrl ?? null) : input.pwaIconUrl,
      splashUrl:
        input.splashUrl === undefined ? (tenant.branding?.splashUrl ?? null) : input.splashUrl,
    };
    await this.client.$transaction(async (transaction) => {
      await transaction.tenantBranding.upsert({
        where: { tenantId: tenant.id },
        create: createData,
        update: createData,
      });
      await transaction.auditLog.create({
        data: auditData({
          action: 'platform.tenant.branding.updated',
          targetType: 'tenant_branding',
          targetPublicId: tenant.publicId,
          tenantId: tenant.id,
          userId: actor.user.id,
          request: metadata,
        }),
      });
    });
    return this.getTenantExperience(publicId);
  }

  public async updateTenantTerminology(
    publicId: string,
    input: TenantTerminologyOverrides,
    actor: PlatformAuthContext,
    metadata: RequestMetadata,
  ) {
    const tenant = await this.client.tenant.findUnique({ where: { publicId } });
    if (tenant === null)
      throw appError('PLATFORM_TENANT_NOT_FOUND', 'O estabelecimento não foi encontrado.', 404);
    const terminologyData = {
      ...(input.professionalSingular === undefined
        ? {}
        : { professionalSingular: input.professionalSingular }),
      ...(input.professionalPlural === undefined
        ? {}
        : { professionalPlural: input.professionalPlural }),
      ...(input.customerSingular === undefined ? {} : { customerSingular: input.customerSingular }),
      ...(input.customerPlural === undefined ? {} : { customerPlural: input.customerPlural }),
      ...(input.serviceSingular === undefined ? {} : { serviceSingular: input.serviceSingular }),
      ...(input.servicePlural === undefined ? {} : { servicePlural: input.servicePlural }),
      ...(input.appointmentSingular === undefined
        ? {}
        : { appointmentSingular: input.appointmentSingular }),
      ...(input.appointmentPlural === undefined
        ? {}
        : { appointmentPlural: input.appointmentPlural }),
      ...(input.unitSingular === undefined ? {} : { unitSingular: input.unitSingular }),
      ...(input.unitPlural === undefined ? {} : { unitPlural: input.unitPlural }),
      ...(input.treatmentPlanModuleTitle === undefined
        ? {}
        : { treatmentPlanModuleTitle: input.treatmentPlanModuleTitle }),
      ...(input.treatmentPlanSingular === undefined
        ? {}
        : { treatmentPlanSingular: input.treatmentPlanSingular }),
      ...(input.treatmentPlanPlural === undefined
        ? {}
        : { treatmentPlanPlural: input.treatmentPlanPlural }),
      ...(input.treatmentPlanSessionSingular === undefined
        ? {}
        : { treatmentPlanSessionSingular: input.treatmentPlanSessionSingular }),
      ...(input.treatmentPlanSessionPlural === undefined
        ? {}
        : { treatmentPlanSessionPlural: input.treatmentPlanSessionPlural }),
    };
    await this.client.$transaction(async (transaction) => {
      await transaction.tenantTerminology.upsert({
        where: { tenantId: tenant.id },
        create: { tenantId: tenant.id, ...terminologyData },
        update: terminologyData,
      });
      await transaction.auditLog.create({
        data: auditData({
          action: 'platform.tenant.terminology.updated',
          targetType: 'tenant_terminology',
          targetPublicId: tenant.publicId,
          tenantId: tenant.id,
          userId: actor.user.id,
          request: metadata,
        }),
      });
    });
    return this.getTenantExperience(publicId);
  }

  public async getTenantFeatures(publicId: string) {
    const features = await this.featuresResolver.findByTenantPublicId(publicId);
    if (features === null)
      throw appError('PLATFORM_TENANT_NOT_FOUND', 'O estabelecimento não foi encontrado.', 404);
    return features;
  }

  public async updateTenantFeatures(
    publicId: string,
    input: { code: TenantFeatureCode; enabled: boolean }[],
    actor: PlatformAuthContext,
    metadata: RequestMetadata,
  ) {
    const tenant = await this.client.tenant.findUnique({ where: { publicId } });
    if (tenant === null)
      throw appError('PLATFORM_TENANT_NOT_FOUND', 'O estabelecimento não foi encontrado.', 404);
    const recommended = new Set(BusinessProfileCatalog[tenant.businessProfile].recommendedFeatures);
    await this.client.$transaction(async (transaction) => {
      for (const feature of input) {
        if (feature.enabled === recommended.has(feature.code)) {
          if (feature.enabled) {
            await transaction.tenantFeatureOverride.upsert({
              where: { tenantId_code: { tenantId: tenant.id, code: feature.code } },
              create: { tenantId: tenant.id, code: feature.code, enabled: true, source: 'PROFILE' },
              update: { enabled: true, source: 'PROFILE' },
            });
          } else {
            await transaction.tenantFeatureOverride.deleteMany({
              where: { tenantId: tenant.id, code: feature.code },
            });
          }
          continue;
        }
        await transaction.tenantFeatureOverride.upsert({
          where: { tenantId_code: { tenantId: tenant.id, code: feature.code } },
          create: {
            tenantId: tenant.id,
            code: feature.code,
            enabled: feature.enabled,
            source: 'OVERRIDE',
          },
          update: { enabled: feature.enabled, source: 'OVERRIDE' },
        });
      }
      await transaction.auditLog.create({
        data: auditData({
          action: 'platform.tenant.features.updated',
          targetType: 'tenant_features',
          targetPublicId: tenant.publicId,
          tenantId: tenant.id,
          userId: actor.user.id,
          metadata: { featureCount: String(input.length) },
          request: metadata,
        }),
      });
    });
    return this.getTenantFeatures(publicId);
  }

  public async getTenantCustomFields(publicId: string) {
    const fields = await this.customFieldsResolver.findByTenantPublicId(publicId);
    if (fields === null)
      throw appError('PLATFORM_TENANT_NOT_FOUND', 'O estabelecimento não foi encontrado.', 404);
    return fields;
  }

  public async createTenantCustomField(
    publicId: string,
    input: CreateTenantCustomFieldRequest,
    actor: PlatformAuthContext,
    metadata: RequestMetadata,
  ) {
    const tenant = await this.client.tenant.findUnique({ where: { publicId } });
    if (tenant === null)
      throw appError('PLATFORM_TENANT_NOT_FOUND', 'O estabelecimento não foi encontrado.', 404);
    try {
      await this.client.$transaction(async (transaction) => {
        const field = await transaction.tenantCustomFieldDefinition.create({
          data: {
            publicId: randomUUID(),
            tenantId: tenant.id,
            key: input.key,
            label: input.label,
            description: input.description ?? null,
            type: input.type,
            scope: input.scope,
            required: input.required,
            active: input.active,
            sortOrder: input.order,
            options: input.options ?? Prisma.JsonNull,
            validation: input.validation ?? Prisma.JsonNull,
            source: 'OVERRIDE',
          },
        });
        await transaction.auditLog.create({
          data: auditData({
            action: 'platform.tenant.custom_field.created',
            targetType: 'tenant_custom_field',
            targetPublicId: field.publicId,
            tenantId: tenant.id,
            userId: actor.user.id,
            request: metadata,
          }),
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw appError(
          'PLATFORM_CUSTOM_FIELD_CONFLICT',
          'A chave já está em uso neste escopo.',
          409,
        );
      throw error;
    }
    return this.getTenantCustomFields(publicId);
  }

  public async updateTenantCustomField(
    publicId: string,
    fieldPublicId: string,
    input: UpdateTenantCustomFieldRequest,
    actor: PlatformAuthContext,
    metadata: RequestMetadata,
  ) {
    const field = await this.client.tenantCustomFieldDefinition.findFirst({
      where: { publicId: fieldPublicId, tenant: { publicId } },
    });
    if (field === null)
      throw appError('PLATFORM_CUSTOM_FIELD_NOT_FOUND', 'O campo não foi encontrado.', 404);
    try {
      await this.client.$transaction(async (transaction) => {
        await transaction.tenantCustomFieldDefinition.update({
          where: { id: field.id },
          data: {
            key: input.key,
            label: input.label,
            description: input.description ?? null,
            type: input.type,
            scope: input.scope,
            required: input.required,
            active: input.active,
            sortOrder: input.order,
            options: input.options ?? Prisma.JsonNull,
            validation: input.validation ?? Prisma.JsonNull,
            source: 'OVERRIDE',
          },
        });
        await transaction.auditLog.create({
          data: auditData({
            action: 'platform.tenant.custom_field.updated',
            targetType: 'tenant_custom_field',
            targetPublicId: field.publicId,
            tenantId: field.tenantId,
            userId: actor.user.id,
            request: metadata,
          }),
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw appError(
          'PLATFORM_CUSTOM_FIELD_CONFLICT',
          'A chave já está em uso neste escopo.',
          409,
        );
      throw error;
    }
    return this.getTenantCustomFields(publicId);
  }

  public async setTenantCustomFieldActive(
    publicId: string,
    fieldPublicId: string,
    active: boolean,
    actor: PlatformAuthContext,
    metadata: RequestMetadata,
  ) {
    const field = await this.client.tenantCustomFieldDefinition.findFirst({
      where: { publicId: fieldPublicId, tenant: { publicId } },
    });
    if (field === null)
      throw appError('PLATFORM_CUSTOM_FIELD_NOT_FOUND', 'O campo não foi encontrado.', 404);
    await this.client.$transaction(async (transaction) => {
      await transaction.tenantCustomFieldDefinition.update({
        where: { id: field.id },
        data: { active, source: 'OVERRIDE' },
      });
      await transaction.auditLog.create({
        data: auditData({
          action: active
            ? 'platform.tenant.custom_field.activated'
            : 'platform.tenant.custom_field.deactivated',
          targetType: 'tenant_custom_field',
          targetPublicId: field.publicId,
          tenantId: field.tenantId,
          userId: actor.user.id,
          request: metadata,
        }),
      });
    });
    return this.getTenantCustomFields(publicId);
  }

  public async changeTenantStatus(
    publicId: string,
    status: 'SUSPENDED' | 'ACTIVE' | 'INACTIVE',
    reason: string,
    actor: PlatformAuthContext,
    metadata: RequestMetadata,
  ) {
    const tenant = await this.client.tenant.findUnique({ where: { publicId } });
    if (tenant === null)
      throw appError('PLATFORM_TENANT_NOT_FOUND', 'O estabelecimento não foi encontrado.', 404);
    const value = await this.client.$transaction(async (transaction) => {
      const updated = await transaction.tenant.update({
        where: { id: tenant.id },
        data: { status },
      });
      const action =
        status === 'SUSPENDED'
          ? 'platform.tenant.suspended'
          : status === 'ACTIVE'
            ? 'platform.tenant.reactivated'
            : 'platform.tenant.deactivated';
      await transaction.auditLog.create({
        data: auditData({
          action,
          targetType: 'tenant',
          targetPublicId: updated.publicId,
          tenantId: updated.id,
          userId: actor.user.id,
          metadata: { reason },
          request: metadata,
        }),
      });
      return updated;
    });
    return {
      tenant: {
        publicId: value.publicId,
        slug: value.slug,
        displayName: value.displayName,
        status: value.status,
        timezone: value.timezone,
        locale: value.locale,
        currency: value.currency,
      },
    };
  }

  public async createTenant(
    input: {
      legalName: string;
      displayName: string;
      slug: string;
      timezone: string;
      locale: string;
      currency: string;
      businessProfile:
        | 'BARBERSHOP'
        | 'BEAUTY_SALON'
        | 'AESTHETIC_CLINIC'
        | 'MEDICAL_CLINIC'
        | 'PSYCHOLOGY'
        | 'NUTRITION'
        | 'DENTISTRY'
        | 'STUDIO'
        | 'TATTOO_STUDIO'
        | 'PET_CARE'
        | 'SPA'
        | 'MASSAGE'
        | 'PERSONAL_TRAINER'
        | 'CONSULTING'
        | 'GENERIC';
      settings: {
        allowMultipleUnits: boolean;
        defaultAppointmentIntervalMinutes: number;
        weekStartsOn: 'SUNDAY' | 'MONDAY';
        dateFormat: 'DD/MM/YYYY';
        timeFormat: '24H' | '12H';
      };
      initialUnit: {
        name: string;
        slug: string;
        postalCode?: string | undefined;
        street?: string | undefined;
        number?: string | undefined;
        complement?: string | undefined;
        district?: string | undefined;
        city?: string | undefined;
        state?: string | undefined;
        countryCode?: string | undefined;
        latitude?: number | undefined;
        longitude?: number | undefined;
        googleMapsUrl?: string | undefined;
      };
      ownerEmail: string;
      planPublicId: string;
      billingCycle: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL' | 'CUSTOM';
      trial: boolean;
      startsAt?: string | undefined;
    },
    actor: PlatformAuthContext,
    metadata: RequestMetadata,
  ) {
    const normalizedEmail = input.ownerEmail.trim().toLowerCase();
    try {
      return await this.client.$transaction(
        async (transaction) => {
          const [plan, ownerRole] = await Promise.all([
            transaction.commercialPlan.findUnique({
              where: { publicId: input.planPublicId },
              include: { billingOptions: true },
            }),
            transaction.role.findFirst({
              where: { code: 'OWNER', isSystem: true, tenantId: null },
            }),
          ]);
          if (plan?.status !== 'ACTIVE')
            throw appError('PLATFORM_PLAN_UNAVAILABLE', 'O plano não está disponível.', 409);
          const billingOption = plan.billingOptions.find(
            (option) => option.active && option.billingCycle === input.billingCycle,
          );
          if (plan.billingOptions.length > 0 && billingOption === undefined)
            throw appError(
              'PLATFORM_BILLING_OPTION_UNAVAILABLE',
              'Esta periodicidade não está disponível para o plano.',
              409,
            );
          if (ownerRole === null) throw new Error('O papel OWNER não foi inicializado.');
          const tenant = await transaction.tenant.create({
            data: {
              publicId: randomUUID(),
              legalName: input.legalName,
              displayName: input.displayName,
              slug: input.slug,
              status: 'ACTIVE',
              timezone: input.timezone,
              locale: input.locale,
              currency: input.currency,
              businessProfile: input.businessProfile,
            },
          });
          const profileTheme = BusinessProfileCatalog[input.businessProfile].theme;
          const publicSiteDefaults = publicSiteDefaultsFor(
            input.businessProfile,
            input.displayName,
          );
          const profileFeatures = BusinessProfileCatalog[input.businessProfile].recommendedFeatures;
          const profileCustomFields = BusinessProfileCatalog[
            input.businessProfile
          ].recommendedCustomFields.map((field) =>
            CreateTenantCustomFieldRequestSchema.parse(field),
          );
          await Promise.all([
            transaction.tenantBranding.create({
              data: {
                tenantId: tenant.id,
                useProfileDefaults: true,
                primaryColor: profileTheme.primaryColor,
                secondaryColor: profileTheme.secondaryColor,
                accentColor: profileTheme.accentColor,
                backgroundColor: profileTheme.backgroundColor,
                surfaceColor: profileTheme.surfaceColor,
                textColor: profileTheme.textColor,
                mutedTextColor: profileTheme.mutedTextColor,
                borderColor: profileTheme.borderColor,
                borderRadius: profileTheme.borderRadius,
                fontFamily: profileTheme.fontFamily,
              },
            }),
            transaction.tenantTerminology.create({ data: { tenantId: tenant.id } }),
            transaction.tenantPublicSite.create({
              data: {
                tenantId: tenant.id,
                theme: 'CLASSIC',
                ...publicSiteDefaults,
                pwaName: input.displayName,
                pwaShortName: input.displayName.slice(0, 30),
              },
            }),
            transaction.tenantFeatureOverride.createMany({
              data: profileFeatures.map((code) => ({
                tenantId: tenant.id,
                code,
                enabled: true,
                source: 'PROFILE' as const,
              })),
            }),
            transaction.tenantCustomFieldDefinition.createMany({
              data: profileCustomFields.map((field) => ({
                publicId: randomUUID(),
                tenantId: tenant.id,
                key: field.key,
                label: field.label,
                description: field.description ?? null,
                type: field.type,
                scope: field.scope,
                required: field.required,
                active: field.active,
                sortOrder: field.order,
                options: field.options ?? Prisma.JsonNull,
                validation: field.validation ?? Prisma.JsonNull,
                source: 'PROFILE' as const,
              })),
            }),
          ]);
          await transaction.tenantSettings.create({
            data: {
              tenantId: tenant.id,
              allowMultipleUnits: input.settings.allowMultipleUnits,
              defaultAppointmentIntervalMinutes: input.settings.defaultAppointmentIntervalMinutes,
              weekStartsOn: input.settings.weekStartsOn,
              dateFormat: input.settings.dateFormat,
              timeFormat: input.settings.timeFormat === '24H' ? 'H24' : 'H12',
            },
          });
          await transaction.businessUnit.create({
            data: {
              publicId: randomUUID(),
              tenantId: tenant.id,
              name: input.initialUnit.name,
              slug: input.initialUnit.slug,
              status: 'ACTIVE',
              isHeadquarters: true,
              timezone: input.timezone,
              postalCode: input.initialUnit.postalCode ?? null,
              street: input.initialUnit.street ?? null,
              number: input.initialUnit.number ?? null,
              complement: input.initialUnit.complement ?? null,
              district: input.initialUnit.district ?? null,
              city: input.initialUnit.city ?? null,
              state: input.initialUnit.state ?? null,
              countryCode: input.initialUnit.countryCode ?? null,
              latitude: input.initialUnit.latitude ?? null,
              longitude: input.initialUnit.longitude ?? null,
              googleMapsUrl: input.initialUnit.googleMapsUrl ?? null,
            },
          });
          let owner = await transaction.user.findUnique({ where: { normalizedEmail } });
          owner ??= await transaction.user.create({
            data: {
              publicId: randomUUID(),
              email: input.ownerEmail,
              normalizedEmail,
              passwordHash: null,
              status: 'INVITED',
            },
          });
          const membership = await transaction.tenantMembership.create({
            data: {
              publicId: randomUUID(),
              tenantId: tenant.id,
              userId: owner.id,
              roleId: ownerRole.id,
              status: 'ACTIVE',
              isOwner: true,
            },
          });
          const rawToken = generateOpaqueToken();
          const invitation = await transaction.userInvitation.create({
            data: {
              publicId: randomUUID(),
              tenantId: tenant.id,
              email: owner.email,
              normalizedEmail,
              roleId: ownerRole.id,
              tokenHash: hashOpaqueToken(rawToken),
              status: 'PENDING',
              expiresAt: new Date(Date.now() + 48 * 3_600_000),
              invitedByUserId: actor.user.id,
            },
          });
          const startsAt = input.startsAt === undefined ? new Date() : new Date(input.startsAt);
          const commercialPolicy = await this.commercialPolicyService.getOrCreateRaw();
          const effectiveTrialDays = plan.trialDays ?? commercialPolicy.defaultTrialDays;
          const trialEndsAt =
            input.trial && effectiveTrialDays > 0
              ? new Date(startsAt.getTime() + effectiveTrialDays * 86_400_000)
              : null;
          const status = trialEndsAt === null ? 'ACTIVE' : 'TRIALING';
          const subscription = await transaction.tenantSubscription.create({
            data: {
              publicId: randomUUID(),
              tenantId: tenant.id,
              planId: plan.id,
              status,
              startsAt,
              trialStartedAt: trialEndsAt === null ? null : startsAt,
              trialEndsAt,
              currentPeriodStartsAt: startsAt,
              currentPeriodEndsAt: periodEnd(startsAt, input.billingCycle),
              priceCents: billingOption?.priceCents ?? plan.priceCents,
              currency: plan.currency,
              billingCycle: input.billingCycle,
              effectiveKey: 'EFFECTIVE',
            },
            include: { tenant: true, plan: true },
          });
          await transaction.subscriptionHistory.create({
            data: {
              publicId: randomUUID(),
              subscriptionId: subscription.id,
              tenantId: tenant.id,
              action: status === 'TRIALING' ? 'TRIAL_STARTED' : 'CREATED',
              newStatus: status,
              newPlanId: plan.id,
              reason: 'Provisionamento administrativo',
              performedByUserId: actor.user.id,
            },
          });
          await transaction.auditLog.create({
            data: auditData({
              action: 'platform.tenant.created',
              targetType: 'tenant',
              targetPublicId: tenant.publicId,
              tenantId: tenant.id,
              userId: actor.user.id,
              metadata: { invitation: invitation.publicId, membership: membership.publicId },
              request: metadata,
            }),
          });
          return {
            tenant: {
              publicId: tenant.publicId,
              slug: tenant.slug,
              displayName: tenant.displayName,
              status: tenant.status,
              timezone: tenant.timezone,
              locale: tenant.locale,
              currency: tenant.currency,
            },
            subscription: mapSubscription(subscription),
            invitationDelivery: 'PENDING_CONFIGURATION' as const,
          };
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw appError(
          'PLATFORM_PROVISIONING_CONFLICT',
          'O slug, proprietário ou vínculo já está em uso.',
          409,
        );
      throw error;
    }
  }

  public async dashboard(period: '7d' | '30d' | '90d' | '12m') {
    const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 365;
    const from = new Date(Date.now() - days * 86_400_000);
    const optional = async <T>(query: PromiseLike<T>): Promise<T | null> => {
      try {
        return await query;
      } catch {
        return null;
      }
    };
    const [
      tenants,
      activeTenants,
      suspendedTenants,
      pendingTenants,
      tenantsCreated,
      users,
      activeMembers,
      units,
      trialingSubscriptions,
      activeSubscriptions,
      pastDueSubscriptions,
      suspendedSubscriptions,
      canceledSubscriptions,
      expiredSubscriptions,
      recentTenants,
      recentAudit,
      revenueSubscriptions,
    ] = await Promise.all([
      optional(this.client.tenant.count()),
      optional(this.client.tenant.count({ where: { status: 'ACTIVE' } })),
      optional(this.client.tenant.count({ where: { status: 'SUSPENDED' } })),
      optional(this.client.tenant.count({ where: { status: 'PENDING' } })),
      optional(this.client.tenant.count({ where: { createdAt: { gte: from } } })),
      optional(this.client.user.count()),
      optional(this.client.tenantMembership.count({ where: { status: 'ACTIVE' } })),
      optional(this.client.businessUnit.count()),
      optional(this.client.tenantSubscription.count({ where: { status: 'TRIALING' } })),
      optional(this.client.tenantSubscription.count({ where: { status: 'ACTIVE' } })),
      optional(this.client.tenantSubscription.count({ where: { status: 'PAST_DUE' } })),
      optional(this.client.tenantSubscription.count({ where: { status: 'SUSPENDED' } })),
      optional(this.client.tenantSubscription.count({ where: { status: 'CANCELED' } })),
      optional(this.client.tenantSubscription.count({ where: { status: 'EXPIRED' } })),
      optional(this.listTenants({ page: 1, limit: 5, orderBy: 'createdAt', direction: 'desc' })),
      optional(
        this.client.auditLog.findMany({
          where: { action: { in: PLATFORM_AUDIT_ACTIONS } },
          take: 10,
          orderBy: { createdAt: 'desc' },
        }),
      ),
      optional(
        this.client.tenantSubscription.findMany({
          where: { effectiveKey: 'EFFECTIVE' },
          select: {
            priceCents: true,
            billingCycle: true,
            plan: { select: { publicId: true, name: true } },
          },
        }),
      ),
    ]);
    const monthlyValue = (amount: bigint, cycle: string) =>
      cycle === 'QUARTERLY'
        ? amount / 3n
        : cycle === 'SEMIANNUAL'
          ? amount / 6n
          : cycle === 'ANNUAL'
            ? amount / 12n
            : amount;
    const revenueByPlan = new Map<
      string,
      { planPublicId: string; planName: string; subscriptions: number; monthlyCents: bigint }
    >();
    for (const subscription of revenueSubscriptions ?? []) {
      const current = revenueByPlan.get(subscription.plan.publicId) ?? {
        planPublicId: subscription.plan.publicId,
        planName: subscription.plan.name,
        subscriptions: 0,
        monthlyCents: 0n,
      };
      current.subscriptions += 1;
      current.monthlyCents += monthlyValue(subscription.priceCents, subscription.billingCycle);
      revenueByPlan.set(subscription.plan.publicId, current);
    }
    const byPlan = [...revenueByPlan.values()].map(({ monthlyCents, ...entry }) => ({
      ...entry,
      estimatedMonthlyCents: publicMoney(monthlyCents),
    }));
    const mrr = byPlan.reduce((total, value) => total + BigInt(value.estimatedMonthlyCents), 0n);
    return {
      period,
      counts: {
        tenants,
        activeTenants,
        suspendedTenants,
        pendingTenants,
        tenantsCreated,
        users,
        activeMembers,
        units,
        trialingSubscriptions,
        activeSubscriptions,
        pastDueSubscriptions,
        suspendedSubscriptions,
        canceledSubscriptions,
        expiredSubscriptions,
      },
      estimatedRevenue:
        revenueSubscriptions === null
          ? null
          : {
              mrrCents: publicMoney(mrr),
              arrCents: publicMoney(mrr * 12n),
              currency: 'BRL',
              disclaimer: 'Valores contratuais estimados; não representam recebimentos.' as const,
            },
      byPlan,
      recentTenants: recentTenants?.items ?? [],
      recentAudit: (recentAudit ?? []).map((item) => ({
        publicId: item.publicId,
        action: item.action,
        targetType: item.targetType,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }

  public async listAudit(query: {
    page: number;
    limit: number;
    action?: string | undefined;
    userPublicId?: string | undefined;
    tenantPublicId?: string | undefined;
    targetType?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
    direction: 'asc' | 'desc';
  }) {
    const where: Prisma.AuditLogWhereInput = {
      action: query.action ?? { in: PLATFORM_AUDIT_ACTIONS },
      ...(query.userPublicId === undefined ? {} : { user: { publicId: query.userPublicId } }),
      ...(query.tenantPublicId === undefined ? {} : { tenant: { publicId: query.tenantPublicId } }),
      ...(query.targetType === undefined ? {} : { targetType: query.targetType }),
      ...(query.from === undefined && query.to === undefined
        ? {}
        : {
            createdAt: {
              ...(query.from === undefined ? {} : { gte: new Date(query.from) }),
              ...(query.to === undefined ? {} : { lte: new Date(query.to) }),
            },
          }),
    };
    const total = await this.client.auditLog.count({ where });
    const items = await this.client.auditLog.findMany({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { createdAt: query.direction },
      include: { tenant: true, user: true },
    });
    return PlatformAuditResponseSchema.parse({
      items: items.map((item) => ({
        publicId: item.publicId,
        action: item.action,
        targetType: item.targetType,
        targetPublicId: item.targetPublicId,
        tenantPublicId: item.tenant?.publicId ?? null,
        user:
          item.user === null
            ? null
            : { publicId: item.user.publicId, email: item.user.email, status: item.user.status },
        createdAt: item.createdAt.toISOString(),
        ...auditReadDetails(item.metadata),
      })),
      page: pageMeta(total, query),
    });
  }
}
