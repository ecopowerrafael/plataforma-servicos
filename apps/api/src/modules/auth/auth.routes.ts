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

interface AuthRoutesOptions {
  service: AuthService;
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
