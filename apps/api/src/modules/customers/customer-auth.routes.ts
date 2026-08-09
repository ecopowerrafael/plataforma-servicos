import { type CookieSerializeOptions } from '@fastify/cookie';
import {
  CustomerAuthResponseSchema,
  CustomerLoginRequestSchema,
  CustomerProfileResponseSchema,
  CustomerRegisterRequestSchema,
  SuccessResponseSchema,
  UpdateCustomerProfileRequestSchema,
} from '@plataforma/shared';
import { type FastifyReply, type FastifyRequest } from 'fastify';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type CustomerAuthService } from './customer-auth.service.js';
import { type CustomerProfileService } from './customer-profile.service.js';

interface Options {
  service: CustomerAuthService;
  profileService: CustomerProfileService;
  cookieName: string;
  cookieSecure: boolean;
  sessionTtlHours: number;
}

const SlugParamsSchema = z.object({ slug: z.string().trim().min(1).max(63) }).strict();

function requestMetadata(request: FastifyRequest) {
  const userAgent = request.headers['user-agent'];
  return {
    ipAddress: request.ip.slice(0, 45) || null,
    userAgent: userAgent === undefined ? null : userAgent.slice(0, 255),
  };
}

function cookieOptions(options: Options): CookieSerializeOptions {
  return {
    httpOnly: true,
    secure: options.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: options.sessionTtlHours * 3_600,
  };
}

function clearCookie(reply: FastifyReply, options: Options) {
  reply.clearCookie(options.cookieName, {
    httpOnly: true,
    secure: options.cookieSecure,
    sameSite: 'lax',
    path: '/',
  });
}

export const customerAuthRoutes: FastifyPluginAsyncZod<Options> = (app, options) => {
  app.post(
    '/public/sites/:slug/customer/register',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        params: SlugParamsSchema,
        body: CustomerRegisterRequestSchema,
        response: { 201: CustomerAuthResponseSchema },
      },
    },
    async (request, reply) => {
      const result = await options.service.register(
        request.params.slug,
        request.body,
        requestMetadata(request),
      );
      reply.setCookie(options.cookieName, result.rawSessionToken, cookieOptions(options));
      return reply.status(201).send({ customer: result.customer });
    },
  );

  app.post(
    '/public/sites/:slug/customer/login',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        params: SlugParamsSchema,
        body: CustomerLoginRequestSchema,
        response: { 200: CustomerAuthResponseSchema },
      },
    },
    async (request, reply) => {
      const result = await options.service.login(
        request.params.slug,
        request.body,
        requestMetadata(request),
      );
      reply.setCookie(options.cookieName, result.rawSessionToken, cookieOptions(options));
      return { customer: result.customer };
    },
  );

  app.post(
    '/public/sites/:slug/customer/logout',
    {
      schema: {
        params: SlugParamsSchema,
        body: z.object({}).strict(),
        response: { 200: SuccessResponseSchema },
      },
    },
    async (request, reply) => {
      await options.service.logout(request.cookies[options.cookieName], requestMetadata(request));
      clearCookie(reply, options);
      return { success: true } as const;
    },
  );

  app.get(
    '/public/sites/:slug/customer/me',
    { schema: { params: SlugParamsSchema, response: { 200: CustomerAuthResponseSchema } } },
    async (request) => {
      const session = await options.service.authenticate(request.cookies[options.cookieName]);
      return {
        customer: {
          publicId: session.customer.publicId,
          name: session.customer.name,
          email: session.customer.email,
          phone: session.customer.phone,
        },
      };
    },
  );
  app.get(
    '/public/sites/:slug/customer/profile',
    { schema: { params: SlugParamsSchema, response: { 200: CustomerProfileResponseSchema } } },
    async (request) => {
      const session = await options.service.authenticate(request.cookies[options.cookieName]);
      return options.profileService.get(session.tenantId, session.customer);
    },
  );

  app.patch(
    '/public/sites/:slug/customer/profile',
    {
      schema: {
        params: SlugParamsSchema,
        body: UpdateCustomerProfileRequestSchema,
        response: { 200: CustomerProfileResponseSchema },
      },
    },
    async (request) => {
      const session = await options.service.authenticate(request.cookies[options.cookieName]);
      return options.profileService.update(session.tenantId, session.customer, request.body);
    },
  );

  return Promise.resolve();
};
