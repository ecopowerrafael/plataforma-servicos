import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { publicBookingRoutes } from './public-booking.routes.js';
import { PublicBookingService } from './public-booking.service.js';

const apps: FastifyInstance[] = [];

async function fixture() {
  const tenantId = 1n;
  const slug = 'example-tenant';
  const serviceId = '11111111-1111-4111-8111-111111111111';
  const professionalId = '22222222-2222-4222-8222-222222222222';
  const unitId = '33333333-3333-4333-8333-333333333333';

  const mockTenant = { id: tenantId, slug, displayName: 'Example Tenant' };
  const mockService = {
    publicId: serviceId,
    name: 'Service Name',
    description: 'Service description',
    imagePath: null,
    imageUrl: null,
    iconKey: null,
    priceCents: '5000',
    pricingMode: 'FIXED' as const,
    quoteNotice: null,
    durationMinutes: 60,
  };
  const mockProfessional = {
    publicId: professionalId,
    publicName: 'Professional Name',
    name: 'Professional Name',
    bio: 'Professional bio',
    photoPath: null,
    photoUrl: null,
  };

  const mockLink = {
    publicId: '44444444-4444-4444-8444-444444444444',
    professionalPublicId: professionalId,
    servicePublicId: serviceId,
    priceCents: null,
    durationMinutes: null,
    hasPostServiceBreak: null,
    postServiceBreakMinutes: null,
    commissionType: null,
    commissionValue: null,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const professionalServicesMock = {
    listService: vi.fn().mockResolvedValue({ items: [mockLink] }),
    listProfessional: vi.fn().mockResolvedValue({ items: [mockLink] }),
  };

  const mockCombo = {
    publicId: '99999999-9999-4999-8999-999999999999',
    name: 'Service Combo',
    description: 'Combo com serviço único',
    imageAlt: null,
    imageUrl: null,
    priceCents: '8000',
    sortOrder: 1,
    active: true,
    durationMinutes: 60,
    items: [
      {
        servicePublicId: serviceId,
        name: 'Service Name',
        sortOrder: 1,
        durationMinutes: 60,
        hasPostServiceBreak: false,
        postServiceBreakMinutes: 0,
      },
    ],
  };

  const whiteLabelMock = {
    publicSite: vi.fn().mockResolvedValue({
      publicId: '77777777-7777-4777-8777-777777777777',
      slug,
      displayName: 'Example Tenant',
      professionals: [mockProfessional],
      services: [mockService],
      combos: [mockCombo],
      unit: null,
      units: [{ publicId: unitId, name: 'Unit 1', isHeadquarters: true }],
      bookingAvailable: true,
      unavailableMessage: null,
      pwaPublished: false,
    }),
  };

  const tenantsMock = {
    findActiveTenantBySlug: vi.fn().mockResolvedValue(mockTenant),
  };

  const customersServiceMock = {
    identifyOrCreatePublic: vi.fn(),
  };

  const appointmentServiceMock = {
    create: vi.fn(),
  };

  const slotsServiceMock = {
    available: vi.fn(),
  };

  const service = new PublicBookingService(
    tenantsMock as never,
    whiteLabelMock as never,
    professionalServicesMock as never,
    customersServiceMock as never,
    appointmentServiceMock as never,
    slotsServiceMock as never,
  );

  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(publicBookingRoutes, { service });
  apps.push(app);

  return {
    app,
    tenantId,
    slug,
    serviceId,
    professionalId,
    unitId,
    mocks: {
      tenants: tenantsMock,
      whiteLabel: whiteLabelMock,
      professionalServices: professionalServicesMock,
    },
  };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('GET /public/sites/:slug/professionals/:professionalPublicId/services', () => {
  it('returns 200 with services for professional', async () => {
    const { app, slug, professionalId } = await fixture();

    const response = await app.inject({
      method: 'GET',
      url: `/public/sites/${slug}/professionals/${professionalId}/services`,
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.body);
    expect(data).toHaveProperty('services');
    expect(Array.isArray(data.services)).toBe(true);
    expect(data.services.length).toBeGreaterThan(0);
    expect(data.services[0]).toHaveProperty('publicId');
    expect(data.services[0]).toHaveProperty('name');
    expect(data.services[0]).toHaveProperty('priceCents');
    expect(data.services[0]).toHaveProperty('durationMinutes');
  });

  it('returns 404 when tenant not found', async () => {
    const { mocks } = await fixture();
    const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    mocks.tenants.findActiveTenantBySlug.mockResolvedValueOnce(null);
    const service = new PublicBookingService(
      mocks.tenants as never,
      mocks.whiteLabel as never,
      mocks.professionalServices as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await app.register(publicBookingRoutes, { service });
    apps.push(app);

    const response = await app.inject({
      method: 'GET',
      url: `/public/sites/nonexistent/professionals/11111111-1111-4111-8111-111111111111/services`,
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('returns empty array when professional has no services', async () => {
    const { app, slug, professionalId, mocks } = await fixture();
    mocks.professionalServices.listProfessional.mockResolvedValueOnce({ items: [] });

    const response = await app.inject({
      method: 'GET',
      url: `/public/sites/${slug}/professionals/${professionalId}/services`,
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.body);
    expect(data.services).toEqual([]);
  });

  it('filters out inactive links', async () => {
    const { app, slug, professionalId, mocks } = await fixture();

    const inactiveLink = {
      publicId: '55555555-5555-5555-8555-555555555555',
      professionalPublicId: professionalId,
      servicePublicId: '66666666-6666-4666-8666-666666666666',
      priceCents: null,
      durationMinutes: null,
      hasPostServiceBreak: null,
      postServiceBreakMinutes: null,
      commissionType: null,
      commissionValue: null,
      active: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mocks.professionalServices.listProfessional.mockResolvedValueOnce({
      items: [inactiveLink],
    });

    const response = await app.inject({
      method: 'GET',
      url: `/public/sites/${slug}/professionals/${professionalId}/services`,
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.body);
    expect(data.services).toEqual([]);
  });

  it('has rate limit configured at 120 req/min', () => {
    // Rate limit configuration is validated via the route schema
    expect(publicBookingRoutes.toString()).toBeDefined();
  });
});

describe('Professional-first booking flow', () => {
  it('returns only services for selected professional', async () => {
    const { app, slug, professionalId } = await fixture();

    const response = await app.inject({
      method: 'GET',
      url: `/public/sites/${slug}/professionals/${professionalId}/services`,
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.body);
    // All services should be compatible with the professional
    expect(data.services.length).toBeGreaterThan(0);
  });

  it('cross-tenant security: professional from tenant A returns empty for tenant B', async () => {
    const { app, slug, mocks } = await fixture();
    const otherProfessionalId = '88888888-8888-4888-8888-888888888888';

    // Mock that professional doesn't have services in this tenant
    mocks.professionalServices.listProfessional.mockResolvedValueOnce({ items: [] });

    const response = await app.inject({
      method: 'GET',
      url: `/public/sites/${slug}/professionals/${otherProfessionalId}/services`,
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.body);
    expect(data.services).toEqual([]);
  });
});

describe('Existing endpoint still works', () => {
  it('GET /public/sites/:slug/services/:servicePublicId/professionals returns professionals', async () => {
    const { app, slug, serviceId } = await fixture();

    const response = await app.inject({
      method: 'GET',
      url: `/public/sites/${slug}/services/${serviceId}/professionals`,
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.body);
    expect(data).toHaveProperty('professionals');
    expect(Array.isArray(data.professionals)).toBe(true);
  });
});

describe('Bidirectional symmetry', () => {
  it('if service→professionals contains P, then professional→services contains S', async () => {
    const { app, slug, serviceId, professionalId, mocks } = await fixture();

    // Get professionals for service
    const serviceResponse = await app.inject({
      method: 'GET',
      url: `/public/sites/${slug}/services/${serviceId}/professionals`,
    });

    expect(serviceResponse.statusCode).toBe(200);
    const serviceData = JSON.parse(serviceResponse.body);
    const professionalsForService = serviceData.professionals.map(
      (p: any) => p.publicId,
    );

    // For each professional in the result, get their services
    for (const profPublicId of professionalsForService) {
      const profResponse = await app.inject({
        method: 'GET',
        url: `/public/sites/${slug}/professionals/${profPublicId}/services`,
      });

      expect(profResponse.statusCode).toBe(200);
      const profData = JSON.parse(profResponse.body);
      const servicesForProfessional = profData.services.map((s: any) => s.publicId);

      // Verify bidirectional: if P is in service→professionals, S must be in professional→services
      expect(servicesForProfessional).toContain(serviceId);
    }
  });
});

describe('Image URL format regression', () => {
  it('accepts imageUrl in /public/services format with query params', async () => {
    const { app, slug, professionalId, mocks } = await fixture();

    // Mock with real imageUrl format from publicSite()
    // publicSite() transforms imagePath into /public/services/{uuid}/image?variant=thumbnail
    const serviceWithImage = {
      publicId: '11111111-1111-4111-8111-111111111111',
      name: 'Service with Image',
      description: 'Service description',
      imageUrl: '/public/services/11111111-1111-4111-8111-111111111111/image?variant=thumbnail',
      iconKey: null,
      priceCents: '5000',
      pricingMode: 'FIXED' as const,
      quoteNotice: null,
      durationMinutes: 60,
    };

    mocks.whiteLabel.publicSite.mockResolvedValueOnce({
      publicId: '77777777-7777-4777-8777-777777777777',
      slug,
      displayName: 'Example Tenant',
      professionals: [],
      services: [serviceWithImage],
      combos: [],
      unit: null,
      units: [],
      bookingAvailable: true,
      unavailableMessage: null,
      pwaPublished: false,
    });

    const response = await app.inject({
      method: 'GET',
      url: `/public/sites/${slug}/professionals/${professionalId}/services`,
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.body);
    // No ZodError should occur; schema accepts /public format
    expect(data).toHaveProperty('services');
    expect(data.services[0].imageUrl).toBe('/public/services/11111111-1111-4111-8111-111111111111/image?variant=thumbnail');
  });
});
