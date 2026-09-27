import { describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import cookie from '@fastify/cookie';
import { platformRoutes } from '../src/modules/platform/platform.routes.js';
import { PlatformService } from '../src/modules/platform/platform.service.js';

describe('platform combos route wiring', () => {
  let app: FastifyInstance;

  it('registers GET /platform/tenants/:tenantPublicId/combos when comboService is provided', async () => {
    app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(cookie);

    const mockPlatformService = new PlatformService({} as never);
    vi.spyOn(mockPlatformService, 'requirePermission').mockReturnValue(undefined);

    const mockComboService = {
      listForPlatform: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };

    await app.register(platformRoutes, {
      service: mockPlatformService,
      authService: { authenticate: vi.fn().mockResolvedValue({}) } as never,
      cookieName: 'test-cookie',
      comboService: mockComboService as any,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/platform/tenants/11111111-1111-4111-8111-111111111111/combos?page=1&limit=10',
    });

    expect(response.statusCode).not.toBe(404);
    await app.close();
  });

  it('does not register combos route when comboService is undefined', async () => {
    app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(cookie);

    const mockPlatformService = new PlatformService({} as never);
    vi.spyOn(mockPlatformService, 'requirePermission').mockReturnValue(undefined);

    await app.register(platformRoutes, {
      service: mockPlatformService,
      authService: { authenticate: vi.fn().mockResolvedValue({}) } as never,
      cookieName: 'test-cookie',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/platform/tenants/11111111-1111-4111-8111-111111111111/combos?page=1&limit=10',
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
