import { TenantPublicIdSchema } from '@plataforma/shared';
import { type FastifyPluginAsync } from 'fastify';
import plugin from 'fastify-plugin';

import { AppError } from '../../errors/AppError.js';
import { type AuthService } from '../auth/auth.service.js';
import { authenticationPlugin } from '../auth/authentication.plugin.js';
import { type AuthorizedTenantContext } from '../auth/identity.repository.js';

declare module 'fastify' {
  interface FastifyRequest {
    tenant: AuthorizedTenantContext;
  }
}

interface TenantContextPluginOptions {
  authService: AuthService;
  cookieName: string;
}

const tenantContext: FastifyPluginAsync<TenantContextPluginOptions> = async (app, options) => {
  await app.register(authenticationPlugin, {
    service: options.authService,
    cookieName: options.cookieName,
  });
  if (!app.hasRequestDecorator('tenant')) app.decorateRequest('tenant');
  app.addHook('preHandler', async (request) => {
    const tenantHeader = request.headers['x-tenant-id'];
    if (tenantHeader === undefined) {
      throw new AppError({
        code: 'TENANT_HEADER_REQUIRED',
        message: 'A identificação do estabelecimento é obrigatória.',
        statusCode: 400,
      });
    }
    if (Array.isArray(tenantHeader)) {
      throw new AppError({
        code: 'TENANT_HEADER_INVALID',
        message: 'A identificação do estabelecimento é inválida.',
        statusCode: 400,
      });
    }
    const parsed = TenantPublicIdSchema.safeParse(tenantHeader);
    if (!parsed.success) {
      throw new AppError({
        code: 'TENANT_HEADER_INVALID',
        message: 'A identificação do estabelecimento é inválida.',
        statusCode: 400,
      });
    }
    request.tenant = Object.freeze(
      await options.authService.resolveTenant(request.auth, parsed.data),
    );
  });
};

export const tenantContextPlugin = plugin(tenantContext, { name: 'authorized-tenant-context' });
