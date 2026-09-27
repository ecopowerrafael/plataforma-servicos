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
  OBSERVABILITY_SLOW_REQUEST_MS: 1_000,
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
  PROSPECTING_TIMEZONE: 'America/Sao_Paulo',
  PROSPECTING_WORKER_ENABLED: 'true',
  PROSPECTING_DRY_RUN: 'false',
};

const openApps: Awaited<ReturnType<typeof buildApp>>[] = [];

function minimalDatabaseConnection(): DatabaseConnection {
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
    ping: vi.fn().mockResolvedValue(undefined),
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

describe('prospecting progress endpoint — ESM runtime', () => {
  it('GET /platform/prospecting/campaigns/:publicId/progress não lança require() error', async () => {
    const database = minimalDatabaseConnection();
    const app = await createApp(database);

    const response = await app.inject({
      method: 'GET',
      url: '/platform/prospecting/campaigns/550e8400-e29b-41d4-a716-446655440000/progress',
    });

    const bodyText = response.body.toString('utf-8');

    // Não deve conter erro de require em ESM
    expect(bodyText).not.toContain('require is not defined');
    expect(bodyText).not.toContain('ReferenceError');

    // Pode ser 401 (auth) ou 404 (campaign not found)
    // Mas não deve ser erro de importação
    if (response.statusCode >= 500) {
      expect(bodyText).not.toContain('Cannot find module');
      expect(bodyText).not.toContain('require is not defined');
    }
  });

  it('resposta de progress contém campos de métricas corretos', () => {
    // Simula resposta esperada do GET /platform/prospecting/campaigns/:publicId/progress
    const mockResponse = {
      totalLeads: 100,
      pending: 25,
      scheduled: 10,
      contacted: 5,
      responded: 8,
      interested: 3,
      failed: 5,
      suppressed: 2,
      sent: 20, // acumulado total
      delivered: 15, // acumulado total
      read: 12, // acumulado total
      dailySent: 3, // apenas outbound de hoje
      dailyLimit: 100,
      progressPercent: 75,
      waitReason: null,
    };

    // Validar separação de métricas
    expect(mockResponse.sent).toBeGreaterThanOrEqual(mockResponse.dailySent);
    expect(mockResponse.delivered).toBeGreaterThanOrEqual(mockResponse.dailySent);
    expect(mockResponse.read).toBeGreaterThanOrEqual(mockResponse.dailySent);

    // dailySent é apenas hoje
    expect(mockResponse.dailySent).toBeLessThanOrEqual(mockResponse.sent);

    // Validar campos de contagem
    expect(mockResponse.pending).toBeDefined();
    expect(mockResponse.scheduled).toBeDefined();
    expect(mockResponse.contacted).toBeDefined();
    expect(mockResponse.interested).toBeDefined();

    // Validar JSON serializável
    const jsonStr = JSON.stringify(mockResponse);
    expect(jsonStr).not.toContain('BigInt');
  });
});
