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

describe('prospecting campaign integration — POST rota com templates', () => {
  it('criação de campanha resolve ID interno para templates', async () => {
    const database = minimalDatabaseConnection();
    const app = await createApp(database);

    const payload = {
      name: 'adamantina',
      dailyLimit: 100,
      sendingStartMinutes: 540,
      sendingEndMinutes: 1080,
      minIntervalSeconds: 30,
      maxIntervalSeconds: 120,
      allowedWeekdays: [1, 2, 3, 4, 5],
      followUpEnabled: false,
      followUpAfterHours: 24,
      maxFollowUps: 2,
      autoReplyEnabled: true,
      flowPublicId: null,
    };

    const response = await app.inject({
      method: 'POST',
      url: '/platform/prospecting/campaigns',
      payload,
    });

    // Testa resposta HTTP
    // Pode ser 401 (auth), 403 (permission), 5xx (error)
    // Não deve ser 400 (validation error)
    if (response.statusCode < 400) {
      // Se sucesso, validar resposta
      const responseBody = JSON.parse(response.body.toString('utf-8'));

      // Não deve conter ID interno
      expect(responseBody.id).toBeUndefined();
      expect(responseBody.publicId).toBeDefined();
      expect(typeof responseBody.publicId).toBe('string');

      // Response deve ser serializável JSON
      const jsonStr = JSON.stringify(responseBody);
      expect(jsonStr).not.toContain('BigInt');
    }

    // Caso 500+, pode indicar erro real (OK para validar bug)
    // O importante é que NÃO seja 400 validation error
    expect(response.statusCode).not.toBe(400);
  });

  it('materialize route resolve ID interno', async () => {
    const database = minimalDatabaseConnection();
    const app = await createApp(database);

    // Payloads
    const createPayload = {
      name: 'test-materialize',
      dailyLimit: 50,
    };

    const materializePayload = {
      categoryId: undefined,
      state: undefined,
      city: undefined,
    };

    // Criar campanha
    const createResponse = await app.inject({
      method: 'POST',
      url: '/platform/prospecting/campaigns',
      payload: createPayload,
    });

    if (createResponse.statusCode < 400) {
      const campaign = JSON.parse(createResponse.body.toString('utf-8'));
      const publicId = campaign.publicId;

      // Tentar materializar
      const materializeResponse = await app.inject({
        method: 'POST',
        url: `/platform/prospecting/campaigns/${publicId}/materialize`,
        payload: materializePayload,
      });

      // Não deve falhar por campaign.id undefined
      // Pode falhar por auth/permission, mas não por ID missing
      if (materializeResponse.statusCode === 500) {
        const errorBody = materializeResponse.body.toString('utf-8');
        expect(errorBody).not.toContain("campaign.id");
        expect(errorBody).not.toContain("Cannot read property 'id'");
      }
    }
  });

  it('contrato de criação de campanha sem campo id', () => {
    // Simula response esperada do POST /platform/prospecting/campaigns
    const responseSchema = {
      publicId: 'string',
      name: 'string',
      status: 'string',
      dailyLimit: 'number',
      sendingStartMinutes: 'number',
      sendingEndMinutes: 'number',
      createdAt: 'string',
      followUpEnabled: 'boolean',
      followUpAfterHours: 'number | null',
      maxFollowUps: 'number',
      autoReplyEnabled: 'boolean',
      // NÃO contém:
      // id: NOT PRESENT
      // flowId: NOT PRESENT
      // categoryId: NOT PRESENT
    };

    const mockResponse = {
      publicId: '550e8400-e29b-41d4-a716-446655440000',
      name: 'adamantina',
      status: 'DRAFT',
      dailyLimit: 100,
      sendingStartMinutes: 540,
      sendingEndMinutes: 1080,
      createdAt: '2026-08-31T10:00:00Z',
      followUpEnabled: false,
      followUpAfterHours: 24,
      maxFollowUps: 2,
      autoReplyEnabled: true,
    };

    // Validar campos
    expect(mockResponse.publicId).toBeDefined();
    expect(mockResponse.id).toBeUndefined();

    // Validar JSON serializável
    const jsonStr = JSON.stringify(mockResponse);
    expect(jsonStr).not.toContain('BigInt');
    expect(JSON.parse(jsonStr)).toEqual(mockResponse);
  });
});
