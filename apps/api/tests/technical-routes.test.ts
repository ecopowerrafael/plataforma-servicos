import { ErrorResponseSchema, HealthResponseSchema, ReadyResponseSchema } from '@plataforma/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import { identityRepositoryStub } from './helpers/identity-repository.stub.js';
import { type Environment } from '../src/config/environment.js';
import { type DatabaseConnection } from '../src/database/connection.js';

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

function databaseConnection(pingError?: Error): DatabaseConnection {
  return {
    client: undefined as never,
    identities: identityRepositoryStub(),
    tenants: {
      createTenant: vi.fn(),
      findTenantByPublicId: vi.fn(),
      listBusinessUnits: vi.fn(),
      findBusinessUnit: vi.fn(),
      createBusinessUnit: vi.fn(),
      updateBusinessUnit: vi.fn(),
      setBusinessUnitStatus: vi.fn(),
      setHeadquarters: vi.fn(),
      countActiveBusinessUnits: vi.fn(),
      findSettings: vi.fn(),
      updateSettings: vi.fn(),
      auditBusinessUnit: vi.fn(),
    },
    ping:
      pingError === undefined
        ? vi.fn().mockResolvedValue(undefined)
        : vi.fn().mockRejectedValue(pingError),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

async function createApp(database: DatabaseConnection) {
  const app = await buildApp({ environment, database, logger: false });
  openApps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

describe('rotas técnicas', () => {
  it('responde ao health check', async () => {
    const app = await createApp(databaseConnection());
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(HealthResponseSchema.safeParse(response.json()).success).toBe(true);
  });

  it('confirma prontidão com banco acessível', async () => {
    const database = databaseConnection();
    const app = await createApp(database);
    const response = await app.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(200);
    expect(ReadyResponseSchema.safeParse(response.json()).success).toBe(true);
    expect(database.ping).toHaveBeenCalledOnce();
  });

  it('retorna erro seguro quando o banco está indisponível', async () => {
    const app = await createApp(databaseConnection(new Error('connection failed')));
    const response = await app.inject({ method: 'GET', url: '/ready' });
    const payload = ErrorResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(503);
    expect(payload.error.code).toBe('SERVICE_NOT_READY');
    expect(payload.error.requestId).not.toHaveLength(0);
    expect(response.body).not.toContain('connection failed');
  });

  it('padroniza o erro de rota inexistente', async () => {
    const app = await createApp(databaseConnection());
    const response = await app.inject({ method: 'GET', url: '/inexistente' });
    const payload = ErrorResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(404);
    expect(payload.error.code).toBe('ROUTE_NOT_FOUND');
    expect(payload.error.requestId).not.toHaveLength(0);
  });
});
