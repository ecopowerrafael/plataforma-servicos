import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import cookie from '@fastify/cookie';
import { platformUnitsRoutes } from '../src/modules/platform/platform.units-routes.js';
import { PlatformService } from '../src/modules/platform/platform.service.js';
import { type PlatformAuthContext } from '../src/modules/platform/platform.service.js';

const tenantPublicId = '11111111-1111-4111-8111-111111111111';
const unitPublicId = '22222222-2222-4222-8222-222222222222';
const apps: FastifyInstance[] = [];

async function fixture() {
  const tenantService = {
    createBusinessUnit: vi.fn().mockResolvedValue({
      publicId: unitPublicId,
      name: 'New Unit',
      slug: 'new-unit',
      status: 'ACTIVE',
      isHeadquarters: false,
      timezone: 'America/Sao_Paulo',
    }),
    updateBusinessUnit: vi.fn().mockResolvedValue({
      publicId: unitPublicId,
      name: 'Updated Unit',
      slug: 'updated-unit',
      status: 'ACTIVE',
      isHeadquarters: false,
      timezone: 'America/Sao_Paulo',
    }),
    setBusinessUnitActive: vi.fn().mockResolvedValue({
      publicId: unitPublicId,
      name: 'Unit',
      slug: 'unit',
      status: 'INACTIVE',
      isHeadquarters: false,
      timezone: 'America/Sao_Paulo',
    }),
    setHeadquarters: vi.fn().mockResolvedValue({
      publicId: unitPublicId,
      name: 'Unit',
      slug: 'unit',
      status: 'ACTIVE',
      isHeadquarters: true,
      timezone: 'America/Sao_Paulo',
    }),
    repository: {
      units: vi.fn().mockResolvedValue([
        {
          publicId: unitPublicId,
          name: 'Unit 1',
          slug: 'unit-1',
          status: 'ACTIVE',
          isHeadquarters: true,
          timezone: 'America/Sao_Paulo',
        },
      ]),
      byId: vi.fn().mockResolvedValue({
        id: 1n,
        timezone: 'America/Sao_Paulo',
      }),
    },
  };

  const platformService = new PlatformService({} as never);
  vi.spyOn(platformService, 'resolveTenantId').mockResolvedValue(1n);
  vi.spyOn(platformService, 'requirePermission').mockReturnValue(undefined);

  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(cookie);

  app.addHook('preHandler', async (request: FastifyRequest) => {
    (request as any).platformAuth = {
      administrator: { id: 1n, publicId: 'admin-123', status: 'ACTIVE' },
      user: { id: 100n, publicId: 'user-456', email: 'admin@example.com', status: 'ACTIVE' },
      session: { id: 200n, publicId: 'session-789', expiresAt: new Date(Date.now() + 3600000) },
      permissions: ['platform.tenant.read', 'platform.tenant.update'],
    } as PlatformAuthContext;
  });

  await app.register(platformUnitsRoutes, {
    service: platformService,
    tenantService: tenantService as any,
  });

  apps.push(app);
  return {
    app,
    tenantService,
    platformService,
  };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('platform units routes', () => {
  it('GET lists units for tenant', async () => {
    const { app, tenantService, platformService } = await fixture();

    await app.inject({
      method: 'GET',
      url: `/platform/tenants/${tenantPublicId}/units`,
    });

    expect(platformService.resolveTenantId).toHaveBeenCalledWith(tenantPublicId);
    expect(tenantService.repository.units).toHaveBeenCalledWith(1n);
  });

  it('POST creates unit with correct tenantId and actor', async () => {
    const { app, tenantService } = await fixture();

    const response = await app.inject({
      method: 'POST',
      url: `/platform/tenants/${tenantPublicId}/units`,
      payload: { name: 'New Unit', slug: 'new-unit' },
    });

    expect(response.statusCode).not.toBe(404);

    const call = tenantService.createBusinessUnit.mock.calls[0];
    expect(call[0]).toBe(1n); // tenantId
    expect(call[3]).toEqual({
      userId: 100n,
      sessionId: null,
    });
  });

  it('PATCH updates unit with correct tenantId and actor', async () => {
    const { app, tenantService } = await fixture();

    const response = await app.inject({
      method: 'PATCH',
      url: `/platform/tenants/${tenantPublicId}/units/${unitPublicId}`,
      payload: { name: 'Updated Unit', slug: 'updated-unit' },
    });

    expect(response.statusCode).not.toBe(404);
    if (tenantService.updateBusinessUnit.mock.calls.length === 0) {
      expect.fail(`PATCH not called, status: ${response.statusCode}, body: ${response.body}`);
    }

    const call = tenantService.updateBusinessUnit.mock.calls[0];
    expect(call[0]).toBe(1n);
    expect(call[1]).toBe(unitPublicId);
    expect(call[4]).toEqual({
      userId: 100n,
      sessionId: null,
    });
  });

  it('POST activate changes unit status to ACTIVE', async () => {
    const { app, tenantService } = await fixture();

    await app.inject({
      method: 'POST',
      url: `/platform/tenants/${tenantPublicId}/units/${unitPublicId}/activate`,
    });

    const call = tenantService.setBusinessUnitActive.mock.calls[0];
    expect(call[0]).toBe(1n);
    expect(call[1]).toBe(unitPublicId);
    expect(call[2]).toBe(true); // active = true
  });

  it('POST deactivate changes unit status to INACTIVE', async () => {
    const { app, tenantService } = await fixture();

    await app.inject({
      method: 'POST',
      url: `/platform/tenants/${tenantPublicId}/units/${unitPublicId}/deactivate`,
    });

    const call = tenantService.setBusinessUnitActive.mock.calls[0];
    expect(call[0]).toBe(1n);
    expect(call[1]).toBe(unitPublicId);
    expect(call[2]).toBe(false); // active = false
  });

  it('POST set-headquarters marks unit as headquarters', async () => {
    const { app, tenantService } = await fixture();

    await app.inject({
      method: 'POST',
      url: `/platform/tenants/${tenantPublicId}/units/${unitPublicId}/set-headquarters`,
    });

    const call = tenantService.setHeadquarters.mock.calls[0];
    expect(call[0]).toBe(1n);
    expect(call[1]).toBe(unitPublicId);
  });
});
