import { randomUUID } from 'node:crypto';

import { type CookieSerializeOptions } from '@fastify/cookie';
import {
  AcceptInvitationRequestSchema,
  AuthMeResponseSchema,
  AuthSessionsResponseSchema,
  CreateTenantWithOwnerRequestSchema,
  CreateTenantWithOwnerResponseSchema,
  ForgotPasswordRequestSchema,
  ForgotPasswordResponseSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  PublicRegistrationRequestSchema,
  PublicRegistrationResponseSchema,
  normalizeEmail,
  ResetPasswordRequestSchema,
  SuccessResponseSchema,
} from '@plataforma/shared';
import { type FastifyReply } from 'fastify';
import {
  type FastifyPluginAsyncZod,
  type FastifyPluginCallbackZod,
} from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type AuthService } from './auth.service.js';
import { authenticationPlugin } from './authentication.plugin.js';
import { requestMetadata } from './request-context.js';
import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';

interface AuthRoutesOptions {
  service: AuthService;
  client: PrismaClient;
  cookieName: string;
  cookieSecure: boolean;
  sessionTtlHours: number;
  rateLimitMax: number;
  rateLimitWindowMinutes: number;
}

const EmptyBodySchema = z.object({}).strict();
const SessionParamsSchema = z.object({ sessionPublicId: z.uuid() });

function cookieOptions(options: AuthRoutesOptions): CookieSerializeOptions {
  return {
    httpOnly: true,
    secure: options.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: options.sessionTtlHours * 3_600,
  };
}

function clearAuthCookie(reply: FastifyReply, options: AuthRoutesOptions) {
  reply.clearCookie(options.cookieName, {
    httpOnly: true,
    secure: options.cookieSecure,
    sameSite: 'lax',
    path: '/',
  });
}
function periodEnd(now: Date, cycle: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL' | 'CUSTOM') {
  const months = cycle === 'ANNUAL' ? 12 : cycle === 'SEMIANNUAL' ? 6 : cycle === 'QUARTERLY' ? 3 : 1;
  const end = new Date(now);
  end.setMonth(end.getMonth() + months);
  return end;
}

const rateLimitConfig = (options: AuthRoutesOptions) => ({
  rateLimit: {
    max: options.rateLimitMax,
    timeWindow: options.rateLimitWindowMinutes * 60_000,
  },
});

const loginRateLimitConfig = (options: AuthRoutesOptions) => ({
  rateLimit: {
    ...rateLimitConfig(options).rateLimit,
    keyGenerator(request: { ip: string; body?: unknown }) {
      const parsed = LoginRequestSchema.safeParse(request.body);
      return parsed.success ? `${request.ip}:${normalizeEmail(parsed.data.email)}` : request.ip;
    },
  },
});

export const publicAuthRoutes: FastifyPluginCallbackZod<AuthRoutesOptions> = (
  app,
  options,
  done,
) => {
  app.post(
    '/auth/register',
    { config: rateLimitConfig(options), schema: { body: PublicRegistrationRequestSchema, response: { 201: PublicRegistrationResponseSchema } } },
    async (request, reply) => {
      const plan = await options.client.commercialPlan.findUnique({ where: { publicId: request.body.planPublicId }, include: { billingOptions: true } });
      if (plan?.status !== 'ACTIVE' || !plan.isPublic)
        throw new AppError({ code: 'PLAN_UNAVAILABLE', message: 'O plano escolhido não está disponível.', statusCode: 409 });
      const option = plan.billingOptions.find((item) => item.billingCycle === request.body.billingCycle && item.active);
      if (option === undefined)
        throw new AppError({ code: 'BILLING_OPTION_UNAVAILABLE', message: 'A periodicidade escolhida não está disponível para este plano.', statusCode: 409 });
      const baseSlug = request.body.name.normalize('NFD').replace(/[^\w\s-]/gu, '').trim().replace(/\s+/gu, '-').toLowerCase().slice(0, 48) || 'estabelecimento';
      const created = await options.service.createTenantWithOwner({
        legalName: request.body.name,
        displayName: request.body.name,
        slug: `${baseSlug}-${randomUUID().slice(0, 8)}`,
        timezone: 'America/Sao_Paulo', locale: 'pt-BR', currency: 'BRL',
        settings: { allowMultipleUnits: false, defaultAppointmentIntervalMinutes: 15, minimumAdvanceMinutes: 0, maximumAdvanceDays: 180, weekStartsOn: 'MONDAY', dateFormat: 'DD/MM/YYYY', timeFormat: '24H' },
        initialUnit: { name: 'Unidade principal', slug: 'principal' },
        owner: { email: request.body.email, password: request.body.password },
      });
      const now = new Date();
      const policy = await options.client.tenantCommercialPolicy.findFirst();
      const trialDays = plan.trialDays ?? policy?.defaultTrialDays ?? 0;
      const trialEndsAt = trialDays > 0 ? new Date(now.getTime() + trialDays * 86_400_000) : null;
      const tenant = await options.client.tenant.findUniqueOrThrow({ where: { publicId: created.tenant.publicId }, select: { id: true } });
      const subscription = await options.client.tenantSubscription.create({ data: { publicId: randomUUID(), tenantId: tenant.id, planId: plan.id, status: trialEndsAt === null ? 'ACTIVE' : 'TRIALING', startsAt: now, trialStartedAt: trialEndsAt === null ? null : now, trialEndsAt, currentPeriodStartsAt: now, currentPeriodEndsAt: periodEnd(now, request.body.billingCycle), priceCents: option.priceCents, currency: plan.currency, billingCycle: request.body.billingCycle, effectiveKey: 'EFFECTIVE' } });
      await options.client.subscriptionHistory.create({ data: { publicId: randomUUID(), subscriptionId: subscription.id, tenantId: tenant.id, action: trialEndsAt === null ? 'CREATED' : 'TRIAL_STARTED', newStatus: subscription.status, newPlanId: plan.id, reason: 'Cadastro público com plano selecionado.' } });
      const result = await options.service.login({ email: request.body.email, password: request.body.password }, requestMetadata(request));
      reply.setCookie(options.cookieName, result.rawSessionToken, cookieOptions(options));
      return reply.status(201).send({ user: result.user, tenants: result.tenants, requiresTenantSelection: result.requiresTenantSelection, tenantPublicId: created.tenant.publicId });
    },
  );
  app.post(
    '/auth/login',
    {
      config: loginRateLimitConfig(options),
      schema: { body: LoginRequestSchema, response: { 200: LoginResponseSchema } },
    },
    async (request, reply) => {
      const result = await options.service.login(request.body, requestMetadata(request));
      reply.setCookie(options.cookieName, result.rawSessionToken, cookieOptions(options));
      return {
        user: result.user,
        tenants: result.tenants,
        requiresTenantSelection: result.requiresTenantSelection,
      };
    },
  );

  app.post(
    '/auth/logout',
    { schema: { body: EmptyBodySchema, response: { 200: SuccessResponseSchema } } },
    async (request, reply) => {
      const auth = await options.service.authenticateOptional(request.cookies[options.cookieName]);
      if (auth !== null) await options.service.logout(auth, requestMetadata(request));
      clearAuthCookie(reply, options);
      return { success: true } as const;
    },
  );

  app.post(
    '/auth/password/forgot',
    {
      config: rateLimitConfig(options),
      schema: {
        body: ForgotPasswordRequestSchema,
        response: { 200: ForgotPasswordResponseSchema },
      },
    },
    async (request) => {
      await options.service.forgotPassword(request.body.email, requestMetadata(request));
      return { message: 'Se o e-mail estiver cadastrado, as instruções serão enviadas.' } as const;
    },
  );

  app.post(
    '/auth/password/reset',
    {
      config: rateLimitConfig(options),
      schema: { body: ResetPasswordRequestSchema, response: { 200: SuccessResponseSchema } },
    },
    async (request) => {
      await options.service.resetPassword(
        request.body.token,
        request.body.newPassword,
        requestMetadata(request),
      );
      return { success: true } as const;
    },
  );

  app.post(
    '/auth/invitations/accept',
    {
      config: rateLimitConfig(options),
      schema: { body: AcceptInvitationRequestSchema, response: { 200: SuccessResponseSchema } },
    },
    async (request) => {
      const auth = await options.service.authenticateOptional(request.cookies[options.cookieName]);
      await options.service.acceptInvitation(request.body, auth, requestMetadata(request));
      return { success: true } as const;
    },
  );

  done();
};

export const protectedAuthRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = async (
  app,
  options,
) => {
  await app.register(authenticationPlugin, {
    service: options.service,
    cookieName: options.cookieName,
  });

  app.post('/auth/onboarding', { schema: { body: z.object({ name: z.string().trim().min(2).max(120), planPublicId: z.uuid(), billingCycle: z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL']) }).strict() } }, async (request) => {
    const plan = await options.client.commercialPlan.findUnique({ where: { publicId: request.body.planPublicId }, include: { billingOptions: true } });
    const option = plan?.billingOptions.find((item) => item.billingCycle === request.body.billingCycle && item.active);
    if (plan?.status !== 'ACTIVE' || !plan.isPublic || option === undefined)
      throw new AppError({ code: 'PLAN_UNAVAILABLE', message: 'O plano ou a periodicidade escolhidos não estão disponíveis.', statusCode: 409 });
    const slug = `${request.body.name.normalize('NFD').replace(/[^\w\s-]/gu, '').trim().replace(/\s+/gu, '-').toLowerCase().slice(0, 48) || 'estabelecimento'}-${randomUUID().slice(0, 8)}`;
    const now = new Date();
    const trialDays = plan.trialDays ?? (await options.client.tenantCommercialPolicy.findFirst())?.defaultTrialDays ?? 0;
    return options.client.$transaction(async (tx) => {
      const ownerRole = await tx.role.findFirstOrThrow({ where: { code: 'OWNER', isSystem: true, tenantId: null }, select: { id: true } });
      const tenant = await tx.tenant.create({ data: { publicId: randomUUID(), slug, legalName: request.body.name, displayName: request.body.name, status: 'ACTIVE', timezone: 'America/Sao_Paulo', locale: 'pt-BR', currency: 'BRL' } });
      await tx.tenantSettings.create({ data: { tenantId: tenant.id, allowMultipleUnits: false, defaultAppointmentIntervalMinutes: 15, minimumAdvanceMinutes: 0, maximumAdvanceDays: 180, weekStartsOn: 'MONDAY', dateFormat: 'DD/MM/YYYY', timeFormat: 'H24' } });
      await tx.businessUnit.create({ data: { publicId: randomUUID(), tenantId: tenant.id, name: 'Unidade principal', slug: 'principal', status: 'ACTIVE', isHeadquarters: true, timezone: 'America/Sao_Paulo' } });
      await tx.tenantMembership.create({ data: { publicId: randomUUID(), tenantId: tenant.id, userId: request.auth.user.id, roleId: ownerRole.id, status: 'ACTIVE', isOwner: true, joinedAt: now } });
      const trialEndsAt = trialDays > 0 ? new Date(now.getTime() + trialDays * 86_400_000) : null;
      await tx.tenantSubscription.create({ data: { publicId: randomUUID(), tenantId: tenant.id, planId: plan.id, status: trialEndsAt === null ? 'ACTIVE' : 'TRIALING', startsAt: now, trialStartedAt: trialEndsAt === null ? null : now, trialEndsAt, currentPeriodStartsAt: now, currentPeriodEndsAt: periodEnd(now, request.body.billingCycle), priceCents: option.priceCents, currency: plan.currency, billingCycle: request.body.billingCycle, effectiveKey: 'EFFECTIVE' } });
      return { tenantPublicId: tenant.publicId };
    });
  });

  app.get('/auth/me', { schema: { response: { 200: AuthMeResponseSchema } } }, (request) =>
    options.service.me(
      request.auth,
      typeof request.headers['x-tenant-id'] === 'string'
        ? request.headers['x-tenant-id']
        : undefined,
    ),
  );

  app.get(
    '/auth/sessions',
    { schema: { response: { 200: AuthSessionsResponseSchema } } },
    async (request) => ({ sessions: await options.service.listSessions(request.auth) }),
  );

  app.delete(
    '/auth/sessions/:sessionPublicId',
    {
      schema: {
        params: SessionParamsSchema,
        response: { 200: SuccessResponseSchema },
      },
    },
    async (request, reply) => {
      const current = await options.service.revokeSession(
        request.auth,
        request.params.sessionPublicId,
        requestMetadata(request),
      );
      if (current) clearAuthCookie(reply, options);
      return { success: true } as const;
    },
  );

  app.post(
    '/auth/logout-all',
    { schema: { body: EmptyBodySchema, response: { 200: SuccessResponseSchema } } },
    async (request, reply) => {
      await options.service.logoutAll(request.auth, requestMetadata(request));
      clearAuthCookie(reply, options);
      return { success: true } as const;
    },
  );
};

export const internalIdentityRoutes: FastifyPluginCallbackZod<AuthRoutesOptions> = (
  app,
  options,
  done,
) => {
  app.post(
    '/internal/tenants',
    {
      schema: {
        body: CreateTenantWithOwnerRequestSchema,
        response: { 201: CreateTenantWithOwnerResponseSchema },
      },
    },
    async (request, reply) =>
      reply.status(201).send(await options.service.createTenantWithOwner(request.body)),
  );
  done();
};
