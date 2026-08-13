import { type CookieSerializeOptions } from '@fastify/cookie';
import {
  CustomerAuthResponseSchema,
  CustomerForgotPasswordRequestSchema,
  CustomerLoginRequestSchema,
  CustomerResetPasswordRequestSchema,
  CustomerProfileResponseSchema,
  CustomerRegisterRequestSchema,
  SuccessResponseSchema,
  UpdateCustomerProfileRequestSchema,
} from '@plataforma/shared';
import { type FastifyReply, type FastifyRequest } from 'fastify';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';


import { type CustomerAuthService } from './customer-auth.service.js';
import { type CustomerPhotoService } from './customer-photo.service.js';
import { type CustomerProfileService } from './customer-profile.service.js';
import { AppError } from '../../errors/AppError.js';
import { validateServiceImageUpload } from '../services/service-image.storage.js';

interface Options {
  service: CustomerAuthService;
  profileService: CustomerProfileService;
  photoService?: CustomerPhotoService;
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

function customerPublic(customer: {
  publicId: string;
  name: string;
  email: string | null;
  phone: string | null;
  photoPath?: string | null;
  updatedAt?: Date;
}) {
  return {
    publicId: customer.publicId,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    photoUrl:
      customer.photoPath === null || customer.photoPath === undefined ? null : 'customer/photo',
    photoUpdatedAt: customer.updatedAt?.toISOString() ?? null,
  };
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
      return reply.status(201).send({ customer: customerPublic(result.customer) });
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
      return { customer: customerPublic(result.customer) };
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
      return { customer: customerPublic(session.customer) };
    },
  );
  app.post(
    '/public/sites/:slug/customer/forgot-password',
    {
      config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
      schema: {
        params: SlugParamsSchema,
        body: CustomerForgotPasswordRequestSchema,
        response: { 202: SuccessResponseSchema },
      },
    },
    async (request, reply) => {
      // Resposta neutra: nunca revela se existe conta com este e-mail.
      await options.service.forgotPassword(
        request.params.slug,
        request.body.email,
        requestMetadata(request),
      );
      return reply.status(202).send({ success: true } as const);
    },
  );
  app.post(
    '/public/sites/:slug/customer/reset-password',
    {
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
      schema: {
        params: SlugParamsSchema,
        body: CustomerResetPasswordRequestSchema,
        response: { 200: SuccessResponseSchema },
      },
    },
    async (request) => {
      await options.service.resetPassword(
        request.params.slug,
        request.body.token,
        request.body.newPassword,
      );
      return { success: true } as const;
    },
  );
  app.put(
    '/public/sites/:slug/customer/photo',
    { schema: { params: SlugParamsSchema, response: { 200: CustomerAuthResponseSchema } } },
    async (request) => {
      const session = await options.service.authenticate(request.cookies[options.cookieName]);
      const upload = await request.file();
      if (upload === undefined || options.photoService === undefined)
        throw new AppError({
          code: 'CUSTOMER_PHOTO_REQUIRED',
          message: 'Uma imagem é obrigatória.',
          statusCode: 400,
        });
      const image = await upload.toBuffer();
      validateServiceImageUpload(image, upload.filename, upload.mimetype);
      const customer = await options.photoService.replace(
        session.tenantId,
        session.customer.id,
        image,
      );
      return { customer: customerPublic(customer) };
    },
  );
  app.delete(
    '/public/sites/:slug/customer/photo',
    { schema: { params: SlugParamsSchema, response: { 200: CustomerAuthResponseSchema } } },
    async (request) => {
      const session = await options.service.authenticate(request.cookies[options.cookieName]);
      if (options.photoService === undefined)
        throw new AppError({
          code: 'CUSTOMER_PHOTO_UNAVAILABLE',
          message: 'O armazenamento de imagens não está disponível.',
          statusCode: 503,
        });
      const customer = await options.photoService.remove(session.tenantId, session.customer.id);
      return { customer: customerPublic(customer) };
    },
  );
  app.get(
    '/public/sites/:slug/customer/photo',
    { schema: { params: SlugParamsSchema } },
    async (request, reply) => {
      const session = await options.service.authenticate(request.cookies[options.cookieName]);
      if (options.photoService === undefined)
        throw new AppError({
          code: 'CUSTOMER_PHOTO_UNAVAILABLE',
          message: 'O armazenamento de imagens não está disponível.',
          statusCode: 503,
        });
      const image = await options.photoService.read(session.tenantId, session.customer.id);
      return reply
        .header('Cache-Control', 'private, max-age=60')
        .type(image.mimeType)
        .send(image.buffer);
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
