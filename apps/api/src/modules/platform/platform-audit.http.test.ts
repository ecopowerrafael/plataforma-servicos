import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { platformRoutes } from './platform.routes.js';
import { PlatformService } from './platform.service.js';

const auditId = '11111111-1111-4111-8111-111111111111';
const apps: FastifyInstance[] = [];

async function fixture(items: unknown[], total: number) {
  const client = {
    auditLog: {
      count: vi.fn().mockResolvedValue(total),
      findMany: vi.fn().mockResolvedValue(items),
    },
  };
  const service = new PlatformService(client as never);
  vi.spyOn(service, 'resolveAuth').mockResolvedValue({
    administrator: { id: 1n, publicId: auditId, status: 'ACTIVE' },
    user: { id: 2n, publicId: auditId, email: 'admin@agendei.com', status: 'ACTIVE' },
    permissions: ['platform.audit.read'],
  });
  const authService = { authenticate: vi.fn().mockResolvedValue({}) };
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(cookie);
  await app.register(platformRoutes, {
    service,
    authService: authService as never,
    cookieName: 'ps_session',
  });
  apps.push(app);
  return { app, client };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('GET /platform/audit', () => {
  it('returns 200 without filters and maps nullable relations', async () => {
    const { app, client } = await fixture(
      [
        {
          publicId: auditId,
          action: 'platform.plan.updated',
          targetType: 'commercial_plan',
          targetPublicId: null,
          metadata: null,
          createdAt: new Date('2026-08-18T12:00:00.000Z'),
          tenant: null,
          user: null,
        },
      ],
      1,
    );

    const response = await app.inject({
      method: 'GET',
      url: '/platform/audit?page=1&limit=20&direction=desc',
      headers: { cookie: 'ps_session=test' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      items: [{ publicId: auditId, tenantPublicId: null, user: null }],
      page: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    expect(client.auditLog.count).toHaveBeenCalledWith({ where: { action: { startsWith: 'platform.' } } });
    expect(client.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20, orderBy: { createdAt: 'desc' } }),
    );
  }, 15_000);

  it('returns a valid empty page with ascending order and pagination', async () => {
    const { app, client } = await fixture([], 0);

    const response = await app.inject({
      method: 'GET',
      url: '/platform/audit?page=2&limit=20&direction=asc',
      headers: { cookie: 'ps_session=test' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [],
      page: { page: 2, limit: 20, total: 0, totalPages: 0 },
    });
    expect(client.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 20, orderBy: { createdAt: 'asc' } }),
    );
  });
});
