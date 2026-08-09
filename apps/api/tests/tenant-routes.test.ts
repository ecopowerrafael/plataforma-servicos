import {
  ErrorResponseSchema,
  TenantContextResponseSchema,
  TenantSettingsResponseSchema,
  TenantUnitsResponseSchema,
  type BusinessUnit,
  type TenantSettings,
  type TenantStatus,
} from '@plataforma/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InMemoryIdentityRepository } from './helpers/in-memory-identity.repository.js';
import { InMemoryTenantRepository } from './helpers/in-memory-tenant.repository.js';
import { buildApp } from '../src/app.js';
import { type Environment } from '../src/config/environment.js';
import { type DatabaseConnection } from '../src/database/connection.js';
import { hashOpaqueToken } from '../src/modules/auth/token.service.js';

const ids = {
  activeA: '11111111-1111-4111-8111-111111111111',
  activeB: '22222222-2222-4222-8222-222222222222',
  suspended: '33333333-3333-4333-8333-333333333333',
  inactive: '44444444-4444-4444-8444-444444444444',
  pending: '55555555-5555-4555-8555-555555555555',
} as const;

const rawSessionToken = 'tenant-route-session-token-with-adequate-entropy';

const settings: TenantSettings = {
  allowMultipleUnits: false,
  defaultAppointmentIntervalMinutes: 15,
  minimumAdvanceMinutes: 0,
  maximumAdvanceDays: 180,
  weekStartsOn: 'MONDAY',
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '24H',
};

function unit(publicId: string, name: string, slug: string): BusinessUnit {
  return {
    publicId,
    name,
    slug,
    status: 'ACTIVE',
    isHeadquarters: true,
    timezone: 'America/Sao_Paulo',
    postalCode: null,
    street: null,
    number: null,
    complement: null,
    district: null,
    city: null,
    state: null,
    countryCode: null,
  };
}

function seedTenant(
  repository: InMemoryTenantRepository,
  id: bigint,
  publicId: string,
  slug: string,
  status: TenantStatus,
): void {
  repository.seed(
    {
      id,
      publicId,
      slug,
      displayName: `Tenant ${slug}`,
      status,
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      currency: 'BRL',
    },
    settings,
    [unit(publicId.replace(/^./u, 'a'), `Unidade ${slug}`, 'matriz')],
  );
}

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

const openApps: Awaited<ReturnType<typeof buildApp>>[] = [];

async function createApp(nodeEnvironment: Environment['NODE_ENV'] = 'test') {
  const repository = new InMemoryTenantRepository();
  seedTenant(repository, 1n, ids.activeA, 'empresa-a', 'ACTIVE');
  seedTenant(repository, 2n, ids.activeB, 'empresa-b', 'ACTIVE');
  seedTenant(repository, 3n, ids.suspended, 'suspensa', 'SUSPENDED');
  seedTenant(repository, 4n, ids.inactive, 'inativa', 'INACTIVE');
  seedTenant(repository, 5n, ids.pending, 'pendente', 'PENDING');
  const identities = new InMemoryIdentityRepository();
  const user = {
    id: 10n,
    publicId: '77777777-7777-4777-8777-777777777777',
    email: 'usuario@empresa.test',
    normalizedEmail: 'usuario@empresa.test',
    passwordHash: 'controlled-hash',
    status: 'ACTIVE' as const,
  };
  identities.seedUser(user);
  const accessByStatus = [
    [1n, ids.activeA, 'empresa-a', 'ACTIVE'],
    [2n, ids.activeB, 'empresa-b', 'ACTIVE'],
    [3n, ids.suspended, 'suspensa', 'SUSPENDED'],
    [4n, ids.inactive, 'inativa', 'INACTIVE'],
    [5n, ids.pending, 'pendente', 'PENDING'],
  ] as const;
  accessByStatus.forEach(([id, publicId, slug, status], index) => {
    identities.seedAccess(user.id, {
      id,
      publicId,
      slug,
      displayName: `Tenant ${slug}`,
      status,
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      currency: 'BRL',
      membership: {
        id: BigInt(index + 20),
        publicId: publicId.replace(/^./u, 'b'),
        status: 'ACTIVE',
        roleCode: 'OWNER',
        permissions: ['tenant.read', 'unit.read'],
        isOwner: true,
      },
    });
  });
  identities.seedSession({
    id: 30n,
    publicId: '66666666-6666-4666-8666-666666666666',
    userId: user.id,
    tokenHash: hashOpaqueToken(rawSessionToken),
    expiresAt: new Date(Date.now() + 3_600_000),
    lastSeenAt: new Date(),
    revokedAt: null,
    user,
    createdAt: new Date(),
    ipAddress: '127.0.0.1',
    userAgent: 'test',
  });
  const database: DatabaseConnection = {
    client: undefined as never,
    identities,
    tenants: repository,
    ping: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const app = await buildApp({
    environment: { ...environment, NODE_ENV: nodeEnvironment },
    database,
    logger: false,
  });
  openApps.push(app);
  return { app, repository, identities };
}

afterEach(async () => {
  await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

async function errorCode(app: Awaited<ReturnType<typeof buildApp>>, publicId?: string) {
  const response = await app.inject({
    method: 'GET',
    url: '/tenant/context',
    headers: {
      cookie: `ps_session=${rawSessionToken}`,
      ...(publicId === undefined ? {} : { 'x-tenant-id': publicId }),
    },
  });
  return { response, error: ErrorResponseSchema.parse(response.json()) };
}

describe('contexto e isolamento multiempresa', () => {
  it('mantém as rotas técnicas independentes do contexto', async () => {
    const { app } = await createApp();
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
  });

  it.each([
    { publicId: undefined, status: 400, code: 'TENANT_HEADER_REQUIRED' },
    { publicId: '1', status: 400, code: 'TENANT_HEADER_INVALID' },
    { publicId: '99999999-9999-4999-8999-999999999999', status: 403, code: 'TENANT_ACCESS_DENIED' },
    { publicId: ids.suspended, status: 403, code: 'TENANT_SUSPENDED' },
    { publicId: ids.inactive, status: 403, code: 'TENANT_INACTIVE' },
    { publicId: ids.pending, status: 403, code: 'TENANT_PENDING' },
  ])('responde $code para contexto inválido', async ({ publicId, status, code }) => {
    const { app } = await createApp();
    const result = await errorCode(app, publicId);
    expect(result.response.statusCode).toBe(status);
    expect(result.error.error.code).toBe(code);
  });

  it('retorna somente dados públicos do tenant ativo', async () => {
    const { app } = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/tenant/context',
      headers: { 'x-tenant-id': ids.activeA, cookie: `ps_session=${rawSessionToken}` },
    });
    const payload = TenantContextResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(payload.tenant.slug).toBe('empresa-a');
    expect(response.body).not.toContain('"id"');
  });

  it('exige sessão e bloqueia vínculo suspenso', async () => {
    const { app, identities } = await createApp();
    const withoutSession = await app.inject({
      method: 'GET',
      url: '/tenant/context',
      headers: { 'x-tenant-id': ids.activeA },
    });
    expect(ErrorResponseSchema.parse(withoutSession.json()).error.code).toBe('AUTH_REQUIRED');

    const access = identities.accesses.find(({ tenant }) => tenant.publicId === ids.activeA);
    if (access === undefined) throw new Error('controlled access missing');
    access.tenant.membership.status = 'SUSPENDED';
    const suspended = await app.inject({
      method: 'GET',
      url: '/tenant/context',
      headers: { 'x-tenant-id': ids.activeA, cookie: `ps_session=${rawSessionToken}` },
    });
    expect(ErrorResponseSchema.parse(suspended.json()).error.code).toBe('MEMBERSHIP_INACTIVE');
  });

  it('isola unidades e configurações pelo id interno resolvido', async () => {
    const { app } = await createApp();
    const headersA = { 'x-tenant-id': ids.activeA, cookie: `ps_session=${rawSessionToken}` };
    const headersB = { 'x-tenant-id': ids.activeB, cookie: `ps_session=${rawSessionToken}` };
    const unitsA = TenantUnitsResponseSchema.parse(
      (await app.inject({ method: 'GET', url: '/tenant/units', headers: headersA })).json(),
    );
    const unitsB = TenantUnitsResponseSchema.parse(
      (await app.inject({ method: 'GET', url: '/tenant/units', headers: headersB })).json(),
    );
    const tenantSettings = TenantSettingsResponseSchema.parse(
      (await app.inject({ method: 'GET', url: '/tenant/settings', headers: headersA })).json(),
    );

    expect(unitsA.units.map(({ name }) => name)).toEqual(['Unidade empresa-a']);
    expect(unitsB.units.map(({ name }) => name)).toEqual(['Unidade empresa-b']);
    expect(tenantSettings.settings).toEqual(settings);
  });

  it('permite atualizar configurações do tenant com tenant.update', async () => {
    const { app, identities } = await createApp();
    const access = identities.accesses.find(({ tenant }) => tenant.publicId === ids.activeA);
    if (access === undefined) throw new Error('controlled access missing');
    access.tenant.membership.permissions.push('tenant.update');

    const headersA = { 'x-tenant-id': ids.activeA, cookie: `ps_session=${rawSessionToken}` };
    const updatedSettings: TenantSettings = {
      allowMultipleUnits: true,
      defaultAppointmentIntervalMinutes: 30,
      minimumAdvanceMinutes: 60,
      maximumAdvanceDays: 90,
      weekStartsOn: 'SUNDAY',
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '12H',
    };

    const patchResponse = await app.inject({
      method: 'PATCH',
      url: '/tenant/settings',
      headers: headersA,
      payload: updatedSettings,
    });

    expect(patchResponse.statusCode).toBe(200);
    expect(TenantSettingsResponseSchema.parse(patchResponse.json()).settings).toEqual(
      updatedSettings,
    );

    const tenantSettings = TenantSettingsResponseSchema.parse(
      (await app.inject({ method: 'GET', url: '/tenant/settings', headers: headersA })).json(),
    );
    expect(tenantSettings.settings).toEqual(updatedSettings);
  });

  it('bloqueia atualização de configurações sem tenant.update', async () => {
    const { app } = await createApp();
    const headersA = { 'x-tenant-id': ids.activeA, cookie: `ps_session=${rawSessionToken}` };

    const patchResponse = await app.inject({
      method: 'PATCH',
      url: '/tenant/settings',
      headers: headersA,
      payload: {
        ...settings,
        defaultAppointmentIntervalMinutes: 10,
      },
    });

    expect(patchResponse.statusCode).toBe(403);
    expect(ErrorResponseSchema.parse(patchResponse.json()).error.code).toBe('PERMISSION_DENIED');
  });

  it('não aceita seleção cruzada por query string', async () => {
    const { app } = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: `/tenant/units?tenantId=${ids.activeB}`,
      headers: { 'x-tenant-id': ids.activeA, cookie: `ps_session=${rawSessionToken}` },
    });
    expect(response.statusCode).toBe(400);
  });

  it('carrega permissões do vínculo correto em cada tenant', async () => {
    const { app, identities } = await createApp();
    const accessB = identities.accesses.find(({ tenant }) => tenant.publicId === ids.activeB);
    if (accessB === undefined) throw new Error('controlled access missing');
    accessB.tenant.membership.roleCode = 'PROFESSIONAL';
    accessB.tenant.membership.permissions = ['tenant.read'];
    const allowedA = await app.inject({
      method: 'GET',
      url: '/tenant/units',
      headers: { 'x-tenant-id': ids.activeA, cookie: `ps_session=${rawSessionToken}` },
    });
    const deniedB = await app.inject({
      method: 'GET',
      url: '/tenant/units',
      headers: { 'x-tenant-id': ids.activeB, cookie: `ps_session=${rawSessionToken}` },
    });
    expect(allowedA.statusCode).toBe(200);
    expect(ErrorResponseSchema.parse(deniedB.json()).error.code).toBe('PERMISSION_DENIED');
  });

  it('expõe a criação interna fora de produção e a remove em produção', async () => {
    const { app: testApp } = await createApp();
    const created = await testApp.inject({
      method: 'POST',
      url: '/internal/tenants',
      payload: {
        legalName: 'Nova Empresa Ltda.',
        displayName: 'Nova Empresa',
        slug: 'nova-empresa',
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        currency: 'BRL',
        initialUnit: { name: 'Matriz', slug: 'matriz' },
        owner: { email: 'proprietario@nova.test', password: 'Senha segura 123' },
      },
    });
    expect(created.statusCode).toBe(201);

    const { app: productionApp } = await createApp('production');
    const unavailable = await productionApp.inject({ method: 'POST', url: '/internal/tenants' });
    expect(unavailable.statusCode).toBe(404);
  });
});
