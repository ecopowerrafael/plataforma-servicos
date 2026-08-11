import cookie from '@fastify/cookie';
import { PublicTenantSiteResponseSchema, TenantWhiteLabelResponseSchema } from '@plataforma/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  publicTenantWhiteLabelRoutes,
  tenantWhiteLabelRoutes,
} from './tenant-white-label.routes.js';
import { TenantWhiteLabelService } from './tenant-white-label.service.js';
import { type ServiceImageStorage } from '../services/service-image.storage.js';

const tenantPublicId = '11111111-1111-4111-8111-111111111111';
const openApps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

function legacyTenant() {
  return {
    id: 41n,
    publicId: tenantPublicId,
    slug: 'barbearia-silva',
    displayName: 'Barbearia Silva',
    businessProfile: 'BARBERSHOP' as const,
    branding: null,
    terminology: null,
    publicSite: null,
  };
}

async function createApp() {
  const repository = {
    findTenant: vi.fn().mockResolvedValue(legacyTenant()),
    findPublicTenant: vi.fn().mockResolvedValue({
      ...legacyTenant(),
      mediaAssets: [],
      services: [],
      professionals: [],
      businessUnits: [],
    }),
    listAssets: vi.fn().mockResolvedValue([]),
  };
  const unusedStorage = {} as ServiceImageStorage;
  const service = new TenantWhiteLabelService(
    repository as never,
    unusedStorage,
    unusedStorage,
    unusedStorage,
  );
  const authService = {
    authenticate: vi.fn().mockResolvedValue({
      user: { id: 7n, publicId: '22222222-2222-4222-8222-222222222222', email: 'owner@test', status: 'ACTIVE' },
      session: { id: 8n, publicId: '33333333-3333-4333-8333-333333333333', expiresAt: new Date(Date.now() + 60_000) },
    }),
    resolveTenant: vi.fn().mockResolvedValue({
      id: 41n,
      publicId: tenantPublicId,
      slug: 'barbearia-silva',
      displayName: 'Barbearia Silva',
      status: 'ACTIVE',
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      currency: 'BRL',
      membership: {
        id: 9n,
        publicId: '44444444-4444-4444-8444-444444444444',
        status: 'ACTIVE',
        roleCode: 'OWNER',
        permissions: ['tenant.branding.read'],
        isOwner: true,
      },
    }),
    requirePermission: vi.fn(),
  };
  const baseApp = Fastify({ logger: false });
  const app = baseApp.withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(cookie);
  await app.register(publicTenantWhiteLabelRoutes, { service });
  await app.register(tenantWhiteLabelRoutes, {
    service,
    authService: authService as never,
    cookieName: 'ps_session',
  });
  openApps.push(baseApp);
  return baseApp;
}

describe('Brand Studio HTTP', () => {
  it(
    'serializes GET /tenant/white-label as 200 for a legacy tenant',
    async () => {
      const app = await createApp();

      const response = await app.inject({
        method: 'GET',
        url: '/tenant/white-label',
        headers: { cookie: 'ps_session=diagnostic-session', 'x-tenant-id': tenantPublicId },
      });

      expect(response.statusCode).toBe(200);
      const body = TenantWhiteLabelResponseSchema.parse(JSON.parse(response.body) as unknown);
      expect(body.slug).toBe('barbearia-silva');
      expect(body.displayName).toBe('Barbearia Silva');
      expect(body.site.theme).toBe('CLASSIC');
      expect(body.assets).toEqual([]);
    },
    15_000,
  );

  it('serializes the public site response without the same Zod encode failure', async () => {
    const app = await createApp();

    const response = await app.inject({ method: 'GET', url: '/public/sites/barbearia-silva' });

    expect(response.statusCode).toBe(200);
    const body = PublicTenantSiteResponseSchema.parse(JSON.parse(response.body) as unknown);
    expect(body.slug).toBe('barbearia-silva');
    expect(body.displayName).toBe('Barbearia Silva');
    expect(body.assets).toEqual([]);
  });
});
