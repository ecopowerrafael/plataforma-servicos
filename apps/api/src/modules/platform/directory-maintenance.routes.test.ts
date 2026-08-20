import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { directoryRoutes, publicDirectoryRoutes } from './directory.routes.js';
import { type DirectoryLocationService } from './directory-location.service.js';
import { type DirectoryService } from './directory.service.js';
import { type PlatformService } from './platform.service.js';
import { AppError } from '../../errors/AppError.js';
import { registerErrorHandlers } from '../../errors/error-handler.js';
import { type AuthService } from '../auth/auth.service.js';

const MAINTENANCE_ENDPOINTS = [
  { method: 'POST', url: '/platform/directory/maintenance/seo/process-batch' },
  { method: 'POST', url: '/platform/directory/maintenance/aggregates/process-batch' },
  { method: 'GET', url: '/platform/directory/maintenance/status' },
  { method: 'POST', url: '/platform/directory/maintenance/category/1/mark-seo-recalc' },
] as const;

function fakeClient() {
  return {
    directoryBusiness: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    directoryCityAggregateJob: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: vi.fn(),
      upsert: vi.fn(),
    },
  };
}

const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

/** authService/platformService fakes que espelham o contrato real de AppError. */
function buildAuthenticatedApp(permissions: string[]) {
  const app = Fastify().withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandlers(app);
  apps.push(app);

  const authService = {
    authenticate: vi.fn(async (rawToken: string | undefined) => {
      if (rawToken === undefined) {
        throw new AppError({ code: 'AUTH_REQUIRED', message: 'Autenticação obrigatória.', statusCode: 401 });
      }
      return { user: { id: 1n, status: 'ACTIVE' } };
    }),
  } as unknown as AuthService;

  const platformService = {
    resolveAuth: vi.fn(async () => ({
      administrator: { id: 1n, publicId: 'admin-uuid', status: 'ACTIVE' },
      user: { id: 1n, status: 'ACTIVE' },
      permissions,
    })),
    requirePermission: vi.fn((context: { permissions: string[] }, permission: string) => {
      if (!context.permissions.includes(permission))
        throw new AppError({
          code: 'PLATFORM_PERMISSION_DENIED',
          message: 'A permissão global necessária não foi concedida.',
          statusCode: 403,
        });
    }),
  } as unknown as PlatformService;

  return { app, authService, platformService };
}

describe('rotas de manutenção do diretório — protegidas', () => {
  it('sem cookie de sessão → 401 em todos os endpoints', async () => {
    const { app, authService, platformService } = buildAuthenticatedApp([]);
    await app.register(cookie);
    await app.register(directoryRoutes, {
      service: { client: fakeClient() } as unknown as DirectoryService,
      platformService,
      authService,
      cookieName: 'platform_session',
    });

    for (const endpoint of MAINTENANCE_ENDPOINTS) {
      const response = await app.inject({ method: endpoint.method, url: endpoint.url });
      expect(response.statusCode).toBe(401);
    }
  });

  it('sessão válida mas sem a permissão exigida → 403', async () => {
    const { app, authService, platformService } = buildAuthenticatedApp([]);
    await app.register(cookie);
    await app.register(directoryRoutes, {
      service: { client: fakeClient() } as unknown as DirectoryService,
      platformService,
      authService,
      cookieName: 'platform_session',
    });

    for (const endpoint of MAINTENANCE_ENDPOINTS) {
      const response = await app.inject({
        method: endpoint.method,
        url: endpoint.url,
        cookies: { platform_session: 'a'.repeat(40) },
      });
      expect(response.statusCode).toBe(403);
    }
  });

  it('platform admin com permissão correta → 200', async () => {
    const { app, authService, platformService } = buildAuthenticatedApp([
      'platform.tenant.read',
      'platform.tenant.update',
    ]);
    await app.register(cookie);
    await app.register(directoryRoutes, {
      service: { client: fakeClient() } as unknown as DirectoryService,
      platformService,
      authService,
      cookieName: 'platform_session',
    });

    for (const endpoint of MAINTENANCE_ENDPOINTS) {
      const response = await app.inject({
        method: endpoint.method,
        url: endpoint.url,
        cookies: { platform_session: 'a'.repeat(40) },
      });
      expect(response.statusCode).toBe(200);
    }

    const statusResponse = await app.inject({
      method: 'GET',
      url: '/platform/directory/maintenance/status',
      cookies: { platform_session: 'a'.repeat(40) },
    });
    const body = statusResponse.json() as { seoPendingCount: number; aggregatesQueueSize: number };
    expect(body).toHaveProperty('seoPendingCount');
    expect(body).toHaveProperty('aggregatesQueueSize');
  });

  it('GET status exige platform.tenant.read; POST process-batch exige platform.tenant.update', async () => {
    const { app, authService, platformService } = buildAuthenticatedApp(['platform.tenant.read']);
    await app.register(cookie);
    await app.register(directoryRoutes, {
      service: { client: fakeClient() } as unknown as DirectoryService,
      platformService,
      authService,
      cookieName: 'platform_session',
    });

    const statusResponse = await app.inject({
      method: 'GET',
      url: '/platform/directory/maintenance/status',
      cookies: { platform_session: 'a'.repeat(40) },
    });
    expect(statusResponse.statusCode).toBe(200);

    const processResponse = await app.inject({
      method: 'POST',
      url: '/platform/directory/maintenance/seo/process-batch',
      cookies: { platform_session: 'a'.repeat(40) },
    });
    expect(processResponse.statusCode).toBe(403);
  });
});

describe('publicDirectoryRoutes não expõe endpoints de manutenção', () => {
  it('404 nas rotas de manutenção quando registradas apenas em publicDirectoryRoutes', async () => {
    const app = Fastify().withTypeProvider<ZodTypeProvider>();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    apps.push(app);
    await app.register(publicDirectoryRoutes, {
      service: { client: fakeClient() } as unknown as DirectoryService,
      locationService: {} as DirectoryLocationService,
    });

    for (const endpoint of MAINTENANCE_ENDPOINTS) {
      const response = await app.inject({ method: endpoint.method, url: endpoint.url });
      expect(response.statusCode).toBe(404);
    }
  });
});
