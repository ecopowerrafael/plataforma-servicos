import { TenantPublicIdSchema, type TenantCommercialStatus } from '@plataforma/shared';
import { type FastifyPluginAsync } from 'fastify';
import plugin from 'fastify-plugin';

import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { type AuthService } from '../auth/auth.service.js';
import { authenticationPlugin } from '../auth/authentication.plugin.js';
import { type AuthorizedTenantContext } from '../auth/identity.repository.js';
import { TenantCommercialPolicyService } from '../platform/tenant-commercial-policy.service.js';
import { TenantCommercialStatusResolver } from '../platform/tenant-commercial-status.resolver.js';

declare module 'fastify' {
  interface FastifyRequest {
    tenant: AuthorizedTenantContext;
    commercialStatus: TenantCommercialStatus;
  }
}

interface TenantContextPluginOptions {
  authService: AuthService;
  cookieName: string;
  client?: PrismaClient | undefined;
}

export const SUBSCRIPTION_RECOVERY_ROUTES = new Set([
  '/tenant/subscription',
  '/tenant/subscription/select-plan',
  '/tenant/subscription/billing',
  '/tenant/subscription/charges',
  '/tenant/subscription/changes/:publicId/charges',
  '/tenant/subscription/changes/:publicId/cancel',
  '/tenant/subscription/cancel-scheduled-change',
  '/tenant/billing/stripe/checkout',
  '/tenant/billing/stripe/portal',
  '/tenant/billing/stripe/cancel',
  '/tenant/billing/stripe/uncancel',
]);

const tenantContext: FastifyPluginAsync<TenantContextPluginOptions> = async (app, options) => {
  await app.register(authenticationPlugin, {
    service: options.authService,
    cookieName: options.cookieName,
  });
  if (!app.hasRequestDecorator('tenant')) app.decorateRequest('tenant');
  if (!app.hasRequestDecorator('commercialStatus')) app.decorateRequest('commercialStatus');
  const policyService =
    options.client === undefined ? undefined : new TenantCommercialPolicyService(options.client);
  const statusResolver = new TenantCommercialStatusResolver();
  app.addHook('preHandler', async (request) => {
    const routeUrl = request.routeOptions.url;
    const isSubscriptionRecoveryRequest = SUBSCRIPTION_RECOVERY_ROUTES.has(routeUrl ?? '');
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
    request.tenant = await options.authService.resolveTenant(request.auth, parsed.data);

    if (options.client !== undefined && policyService !== undefined) {
      const subscription = await options.client.tenantSubscription.findFirst({
        where: { tenantId: request.tenant.id, effectiveKey: 'EFFECTIVE' },
      });
      if (subscription === null) {
        if (routeUrl === '/tenant/subscription/select-plan') return;
        throw new AppError({
          code: 'TENANT_SUBSCRIPTION_REQUIRED',
          message: 'Este estabelecimento não possui uma assinatura vinculada.',
          statusCode: 403,
        });
      }
      {
        const policy = await policyService.getOrCreateRaw();
        const commercialStatus = statusResolver.resolve(subscription, policy);
        request.tenant = Object.freeze({ ...request.tenant, commercialStatus });
        request.commercialStatus = Object.freeze(commercialStatus);

        if (!commercialStatus.capabilities.canAccessAdmin) {
          throw new AppError({
            code: 'TENANT_COMMERCIAL_BLOCKED',
            message: commercialStatus.adminMessage ?? 'O acesso está temporariamente bloqueado.',
            statusCode: 403,
          });
        }
        if (
          request.method !== 'GET' &&
          !commercialStatus.capabilities.canManageData &&
          !isSubscriptionRecoveryRequest
        ) {
          throw new AppError({
            code: 'TENANT_COMMERCIAL_READ_ONLY',
            message:
              commercialStatus.adminMessage ??
              'Alterações estão temporariamente bloqueadas para este estabelecimento.',
            statusCode: 403,
          });
        }
      }
    }
  });
};

export const tenantContextPlugin = plugin(tenantContext, { name: 'authorized-tenant-context' });
