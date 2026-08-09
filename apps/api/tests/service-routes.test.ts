import { randomUUID } from 'node:crypto';

import {
  ErrorResponseSchema,
  ServiceListResponseSchema,
  ServicePublicSchema,
  ServiceStatusResponseSchema,
} from '@plataforma/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InMemoryIdentityRepository } from './helpers/in-memory-identity.repository.js';
import { InMemoryTenantRepository } from './helpers/in-memory-tenant.repository.js';
import { buildApp } from '../src/app.js';
import { type Environment } from '../src/config/environment.js';
import { type DatabaseConnection } from '../src/database/connection.js';
import { hashOpaqueToken } from '../src/modules/auth/token.service.js';
import { type ServiceService } from '../src/modules/services/service.service.js';

const tenantPublicId = '11111111-1111-4111-8111-111111111111';
const otherTenantPublicId = '22222222-2222-4222-8222-222222222222';
const rawSessionToken = 'service-route-session-token-with-adequate-entropy';
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

const environment: Environment = {
  NODE_ENV: 'test',
  API_HOST: '127.0.0.1',
  API_PORT: 3000,
  DATABASE_URL: 'mysql://USER:PASSWORD@127.0.0.1:3306/plataforma_servicos',
  CORS_ORIGINS: ['http://localhost:5173'],
  LOG_LEVEL: 'silent',
  APP_WEB_URL: 'http://localhost:5173',
  AUTH_COOKIE_NAME: 'ps_session',
  AUTH_SESSION_TTL_HOURS: 168,
  AUTH_MAX_ACTIVE_SESSIONS: 5,
  AUTH_COOKIE_SECURE: false,
  PASSWORD_ARGON2_MEMORY_COST: 19_456,
  PASSWORD_ARGON2_TIME_COST: 2,
  PASSWORD_ARGON2_PARALLELISM: 1,
  LOGIN_RATE_LIMIT_MAX: 5,
  LOGIN_RATE_LIMIT_WINDOW_MINUTES: 15,
  PASSWORD_RESET_TTL_MINUTES: 30,
  INVITATION_TTL_HOURS: 48,
  SMTP_PORT: 587,
  SMTP_SECURE: false,
};

const item = ServicePublicSchema.parse({
  publicId: '33333333-3333-4333-8333-333333333333',
  categoryPublicId: null,
  name: 'Consulta inicial',
  description: null,
  imageAlt: null,
  imageUrl: null,
  durationMinutes: 45,
  hasPostServiceBreak: false,
  postServiceBreakMinutes: 0,
  priceCents: '15000',
  color: '#2563EB',
  sortOrder: 0,
  active: true,
  createdAt: '2026-08-04T12:00:00.000Z',
  updatedAt: '2026-08-04T12:00:00.000Z',
});

function serviceDouble(): ServiceService {
  const service: ServiceService = Object.create(
    Object.getPrototypeOf({}) as object,
  ) as ServiceService;
  service.list = vi.fn().mockResolvedValue(
    ServiceListResponseSchema.parse({
      items: [item],
      page: { page: 1, limit: 20, total: 1, totalPages: 1 },
    }),
  );
  service.get = vi.fn().mockResolvedValue(item);
  service.create = vi.fn().mockResolvedValue(item);
  service.update = vi.fn().mockResolvedValue(item);
  service.setActive = vi.fn().mockResolvedValue(undefined);
  service.replaceImage = vi.fn().mockResolvedValue(item);
  service.removeImage = vi.fn().mockResolvedValue(item);
  service.getImage = vi
    .fn()
    .mockResolvedValue({ buffer: Buffer.from('image'), mimeType: 'image/png' });
  return service;
}

async function fixture(
  permissions: string[] = [
    'service.read',
    'service.create',
    'service.update',
    'service.status.manage',
    'service.image.manage',
  ],
) {
  const identities = new InMemoryIdentityRepository();
  const user = {
    id: 1n,
    publicId: randomUUID(),
    email: 'owner@service.test',
    normalizedEmail: 'owner@service.test',
    passwordHash: 'controlled-hash',
    status: 'ACTIVE' as const,
  };
  identities.seedUser(user);
  for (const [id, publicId] of [
    [2n, tenantPublicId],
    [3n, otherTenantPublicId],
  ] as const) {
    identities.seedAccess(user.id, {
      id,
      publicId,
      slug: `tenant-${String(id)}`,
      displayName: `Tenant ${String(id)}`,
      status: 'ACTIVE',
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      currency: 'BRL',
      membership: {
        id: id + 10n,
        publicId: randomUUID(),
        status: 'ACTIVE',
        roleCode: 'OWNER',
        permissions,
        isOwner: true,
      },
    });
  }
  identities.seedSession({
    id: 20n,
    publicId: randomUUID(),
    userId: user.id,
    tokenHash: hashOpaqueToken(rawSessionToken),
    expiresAt: new Date(Date.now() + 3_600_000),
    lastSeenAt: new Date(),
    revokedAt: null,
    user,
    createdAt: new Date(),
    ipAddress: null,
    userAgent: 'test',
  });
  const services = serviceDouble();
  const database: DatabaseConnection = {
    client: undefined as never,
    identities,
    tenants: new InMemoryTenantRepository(),
    services,
    ping: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const app = await buildApp({ environment, database, logger: false });
  apps.push(app);
  return { app, services };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

const headers = { cookie: `ps_session=${rawSessionToken}`, 'x-tenant-id': tenantPublicId };

describe('rotas do cat\u00e1logo de servi\u00e7os', () => {
  it('exige sess\u00e3o, tenant e permiss\u00e3o de leitura', async () => {
    const { app } = await fixture([]);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/tenant/services',
          headers: { 'x-tenant-id': tenantPublicId },
        })
      ).statusCode,
    ).toBe(401);
    const denied = await app.inject({ method: 'GET', url: '/tenant/services', headers });
    expect(denied.statusCode).toBe(403);
    expect(ErrorResponseSchema.parse(denied.json()).error.code).toBe('PERMISSION_DENIED');
  });

  it('propaga filtros, pagina\u00e7\u00e3o e o tenant autenticado', async () => {
    const { app } = await fixture();
    const response = await app.inject({
      method: 'GET',
      url: '/tenant/services?page=1&limit=20&search=consulta&active=true',
      headers,
    });
    expect(response.statusCode).toBe(200);
    expect(ServiceListResponseSchema.parse(response.json()).items).toHaveLength(1);
  });

  it('valida cria\u00e7\u00e3o, edi\u00e7\u00e3o e mudan\u00e7as de status', async () => {
    const { app } = await fixture();
    const payload = {
      name: 'Consulta inicial',
      durationMinutes: 45,
      hasPostServiceBreak: false,
      postServiceBreakMinutes: 0,
      priceCents: 15000,
      color: '#2563EB',
      sortOrder: 0,
      active: true,
    };
    expect(
      (await app.inject({ method: 'POST', url: '/tenant/services', headers, payload })).statusCode,
    ).toBe(201);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/tenant/services/${item.publicId}`,
          headers,
          payload,
        })
      ).statusCode,
    ).toBe(200);
    const changed = await app.inject({
      method: 'POST',
      url: `/tenant/services/${item.publicId}/deactivate`,
      headers,
    });
    expect(ServiceStatusResponseSchema.parse(changed.json()).success).toBe(true);
  });

  it('nega opera\u00e7\u00f5es sem a permiss\u00e3o espec\u00edfica', async () => {
    const { app } = await fixture(['service.read']);
    const response = await app.inject({
      method: 'POST',
      url: '/tenant/services',
      headers,
      payload: {
        name: 'Consulta inicial',
        durationMinutes: 45,
        hasPostServiceBreak: false,
        postServiceBreakMinutes: 0,
        priceCents: 15000,
        color: '#2563EB',
        sortOrder: 0,
        active: true,
      },
    });
    expect(response.statusCode).toBe(403);
    expect(ErrorResponseSchema.parse(response.json()).error.code).toBe('PERMISSION_DENIED');
  });
});
