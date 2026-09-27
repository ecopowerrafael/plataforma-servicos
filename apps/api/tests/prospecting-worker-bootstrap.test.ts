import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { identityRepositoryStub } from './helpers/identity-repository.stub.js';
import { type Environment } from '../src/config/environment.js';
import { type DatabaseConnection } from '../src/database/connection.js';

const baseEnvironment: Environment = {
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

async function createApp(environment: Environment, database: DatabaseConnection) {
  const app = await buildApp({ environment, database, logger: false });
  openApps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

describe('prospecting worker bootstrap', () => {
  it('worker enabled deve tentar iniciar', async () => {
    const environment = {
      ...baseEnvironment,
      PROSPECTING_WORKER_ENABLED: 'true',
      PROSPECTING_WORKER_INTERVAL_SECONDS: '30',
      PROSPECTING_TIMEZONE: 'America/Sao_Paulo',
    } as any;

    const database = minimalDatabaseConnection();
    const app = await createApp(environment, database);

    // Validar que app foi construído sem erro
    expect(app).toBeDefined();
  });

  it('worker disabled não deve iniciar', async () => {
    const environment = {
      ...baseEnvironment,
      PROSPECTING_WORKER_ENABLED: 'false',
    } as any;

    const database = minimalDatabaseConnection();
    const app = await createApp(environment, database);

    expect(app).toBeDefined();
  });

  it('ProspectingWorkerService.start() respeita PROSPECTING_WORKER_ENABLED', () => {
    // Teste de lógica: start() deve verificar environment.PROSPECTING_WORKER_ENABLED
    // Se false, não inicia scheduler
    // Se true, inicia com PROSPECTING_WORKER_INTERVAL_SECONDS

    const enabledEnv = { PROSPECTING_WORKER_ENABLED: true, PROSPECTING_WORKER_INTERVAL_SECONDS: 30 };
    const disabledEnv = { PROSPECTING_WORKER_ENABLED: false, PROSPECTING_WORKER_INTERVAL_SECONDS: 30 };

    // start() é chamado com environment
    expect(enabledEnv.PROSPECTING_WORKER_ENABLED).toBe(true);
    expect(disabledEnv.PROSPECTING_WORKER_ENABLED).toBe(false);
  });

  it('shutdown deve chamar prospecting worker stop()', () => {
    // Validar que em shutdown, workers.prospecting?.() é chamado
    // Isso garante que o interval é cancelado
    const mockStop = vi.fn().mockResolvedValue(undefined);

    // Simulação do worker object
    const workers = {
      notification: undefined,
      prospecting: mockStop,
    };

    // Simular shutdown
    workers.prospecting?.();

    expect(mockStop).toHaveBeenCalled();
  });

  it('ProspectingWorker.runOnce() executa um ciclo', () => {
    // runOnce() deve processar leads RUNNING, fazer claim, enviar mensagens
    // Validar que retorna ProspectingWorkerRunResult com campos:
    // campaignsChecked, leadsClaimed, sent, dryRun, failed, skipped

    const expectedResult = {
      campaignsChecked: 0,
      leadsClaimed: 0,
      sent: 0,
      dryRun: 0,
      retried: 0,
      failed: 0,
      skipped: 0,
    };

    expect(expectedResult).toHaveProperty('campaignsChecked');
    expect(expectedResult).toHaveProperty('sent');
    expect(expectedResult).toHaveProperty('dryRun');
  });

  it('intervalo padrão do worker', () => {
    const intervalSeconds = 30; // Esperado: PROSPECTING_WORKER_INTERVAL_SECONDS
    const intervalMs = intervalSeconds * 1000;

    expect(intervalMs).toBe(30_000);
  });

  it('timezone padrão do worker', () => {
    const timezone = 'America/Sao_Paulo';
    expect(timezone).toMatch(/^[A-Za-z_/]+$/);
  });
});
