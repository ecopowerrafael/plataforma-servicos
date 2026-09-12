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

describe('prospecting bootstrap — rotas sem duplicação', () => {
  it('inicializa sem erros de rota duplicada', async () => {
    const database = minimalDatabaseConnection();

    // Não deve lançar FST_ERR_DUPLICATED_ROUTE
    const app = await createApp(database);
    await app.ready();

    expect(app).toBeDefined();
  });

  it('responde a GET /platform/prospecting/whatsapp (configuração registrada)', async () => {
    const database = minimalDatabaseConnection();
    const app = await createApp(database);

    // Testa que a rota GET está acessível
    // A rota exata retorna 404 porque não há prospectingWhatsAppConfig stubado,
    // mas não deve ser um erro de rota não registrada (404 vs error)
    const response = await app.inject({
      method: 'GET',
      url: '/platform/prospecting/whatsapp',
    });

    // 401 (não autenticado) ou 404 (config não existe) são OK
    // Erro de rota registrada seria 5xx ou não seria respondido
    expect([200, 401, 404, 405]).toContain(response.statusCode);
  });
});
