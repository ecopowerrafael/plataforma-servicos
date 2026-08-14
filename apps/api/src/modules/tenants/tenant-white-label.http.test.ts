import cookie from '@fastify/cookie';
import { PublicTenantSiteResponseSchema, TenantWhiteLabelResponseSchema } from '@plataforma/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type TenantMediaStorage } from './tenant-media.storage.js';
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

async function createApp(
  tenantOverrides: Omit<Partial<ReturnType<typeof legacyTenant>>, 'publicSite' | 'branding'> & {
    publicSite?: Record<string, unknown> | null;
    branding?: Record<string, unknown> | null;
  } = {},
  businessUnits: Record<string, unknown>[] = [],
) {
  const tenant = { ...legacyTenant(), ...tenantOverrides };
  const repository = {
    findTenant: vi.fn().mockResolvedValue(tenant),
    findPublicTenant: vi.fn().mockResolvedValue({
      ...tenant,
      mediaAssets: [],
      services: [],
      professionals: [],
      businessUnits,
    }),
    listAssets: vi.fn().mockResolvedValue([]),
    findPwaState: vi.fn().mockResolvedValue({ status: 'DRAFT', publishedAt: null }),
  };
  const unusedStorage = {} as ServiceImageStorage & TenantMediaStorage;
  const service = new TenantWhiteLabelService(
    repository as never,
    unusedStorage,
    unusedStorage,
    unusedStorage,
  );
  const authService = {
    authenticate: vi.fn().mockResolvedValue({
      user: {
        id: 7n,
        publicId: '22222222-2222-4222-8222-222222222222',
        email: 'owner@test',
        status: 'ACTIVE',
      },
      session: {
        id: 8n,
        publicId: '33333333-3333-4333-8333-333333333333',
        expiresAt: new Date(Date.now() + 60_000),
      },
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
  it('serializes GET /tenant/white-label as 200 for a legacy tenant', async () => {
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
  }, 15_000);

  it('serializes the public site response without the same Zod encode failure', async () => {
    const app = await createApp(
      {
        publicSite: {
          theme: 'MODERN',
          // Sem `layout` a fixture não representava a linha real (que tem
          // default no banco) e o endpoint respondia 500 no teste.
          layout: 'CLASSIC',
          heroTitle: 'Barbearia Silva',
          heroSubtitle: 'Seu estilo, no seu tempo.',
          aboutText: 'Agende seu horário de forma rápida e prática.',
          primaryCallToAction: 'Agendar horário',
          footerText: null,
          seoTitle: null,
          seoDescription: null,
          pwaName: 'Barbearia Silva',
          pwaShortName: 'Barbearia Silva',
          pwaDescription: null,
        },
        branding: {
          useProfileDefaults: false,
          primaryColor: '#2457D6',
          secondaryColor: '#1B419F',
          accentColor: '#4F78DE',
          backgroundColor: '#F6F8FD',
          surfaceColor: '#FFFFFF',
          textColor: '#0F172A',
          mutedTextColor: '#64748B',
          borderColor: '#D5DDF4',
          borderRadius: '0.75rem',
          fontFamily: 'Inter',
          logoUrl: null,
          faviconUrl: null,
          bannerUrl: null,
          pwaIconUrl: null,
          splashUrl: null,
        },
      },
      [
        {
          publicId: '55555555-5555-4555-8555-555555555555',
          name: 'Matriz',
          isHeadquarters: true,
          street: 'Rua das Acácias',
          number: '123',
          complement: null,
          district: 'Centro',
          city: 'Ibiúna',
          state: 'SP',
          postalCode: '18150-000',
          countryCode: 'BR',
          latitude: -23.65,
          longitude: -47.22,
          googleMapsUrl: 'https://maps.app.goo.gl/local',
          timezone: 'America/Sao_Paulo',
          status: 'ACTIVE',
        },
      ],
    );

    const response = await app.inject({ method: 'GET', url: '/public/sites/barbearia-silva' });

    expect(response.statusCode).toBe(200);
    const body = PublicTenantSiteResponseSchema.parse(JSON.parse(response.body) as unknown);
    expect(body.slug).toBe('barbearia-silva');
    expect(body.displayName).toBe('Barbearia Silva');
    expect(body.site).toMatchObject({
      theme: 'MODERN',
      heroTitle: 'Barbearia Silva',
      heroSubtitle: 'Seu estilo, no seu tempo.',
      primaryCallToAction: 'Agendar horário',
    });
    expect(body.branding.primaryColor).toBe('#2457D6');
    expect(body.assets).toEqual([]);
    expect(body.unit).toMatchObject({
      street: 'Rua das Acácias',
      district: 'Centro',
      latitude: -23.65,
      googleMapsUrl: 'https://maps.app.goo.gl/local',
    });
    expect(body.units).toHaveLength(1);
  });
});
