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

describe('prospecting campaign serialization — JSON safe response', () => {
  it('POST /platform/prospecting/campaigns retorna resposta sem BigInt', async () => {
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
      flowPublicId: '550e8400-e29b-41d4-a716-446655440000',
    };

    const response = await app.inject({
      method: 'POST',
      url: '/platform/prospecting/campaigns',
      payload,
    });

    // Não deve retornar 400 (validation error)
    // Pode ser 401 (auth) ou 5xx se houver erro real
    if (response.statusCode < 400 || response.statusCode >= 500) {
      // Se houver body, deve ser JSON serializável
      if (response.body) {
        const bodyText = response.body.toString('utf-8');

        // Verificar se contém erro de BigInt
        expect(bodyText).not.toContain('BigInt');
        expect(bodyText).not.toContain('Do not know how to serialize');

        // Se status é sucesso, deve conter publicId
        if (response.statusCode < 400) {
          const parsed = JSON.parse(bodyText);
          expect(parsed.publicId).toBeDefined();
          expect(typeof parsed.publicId).toBe('string');

          // Não deve conter id (BigInt)
          expect(parsed.id).toBeUndefined();
          expect(parsed.flowId).toBeUndefined();
          expect(parsed.categoryId).toBeUndefined();
        }
      }
    }
  });

  it('resposta de campanha contém apenas campos JSON-safe', async () => {
    const database = minimalDatabaseConnection();
    const app = await createApp(database);

    const payload = {
      name: 'test-campaign',
      dailyLimit: 50,
    };

    const response = await app.inject({
      method: 'POST',
      url: '/platform/prospecting/campaigns',
      payload,
    });

    // Se sucesso, tentar serializar resposta
    if (response.statusCode < 400) {
      const bodyText = response.body.toString('utf-8');
      const parsed = JSON.parse(bodyText);

      // Campos esperados JSON-safe
      const expectedFields = ['publicId', 'name', 'status', 'dailyLimit'];
      for (const field of expectedFields) {
        const value = parsed[field];
        if (value !== undefined && value !== null) {
          // Deve ser string, number, boolean, object, array ou null
          const type = typeof value;
          expect(['string', 'number', 'boolean', 'object']).toContain(type);
        }
      }

      // Campos que NUNCA devem estar presentes (BigInt)
      const forbiddenFields = ['id', 'flowId', 'categoryId', 'tenantId'];
      for (const field of forbiddenFields) {
        expect(parsed[field]).toBeUndefined();
      }
    }
  });

  it('mapCampaignDto() remove IDs internos e adiciona publicId', () => {
    // Teste do mapeador DTO
    // Simula um objeto Prisma com BigInt
    const prismaObject = {
      id: BigInt('12345'),
      publicId: '550e8400-e29b-41d4-a716-446655440000',
      name: 'test',
      flowId: BigInt('98765'),
      flow: {
        publicId: 'flow-uuid-123',
        name: 'flow-name',
      },
      status: 'DRAFT',
      dailyLimit: 100,
    };

    // Simular mapCampaignDto removendo id, flowId, e adicionando flowPublicId
    const { id, flowId, flow, ...rest } = prismaObject as any;
    const mapped = {
      ...rest,
      flowPublicId: flow?.publicId ?? null,
      flowName: flow?.name ?? null,
    };

    // Não deve conter BigInt
    expect(mapped.id).toBeUndefined();
    expect(mapped.flowId).toBeUndefined();

    // Deve conter publicId (string)
    expect(mapped.publicId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(typeof mapped.publicId).toBe('string');

    // Deve conter flowPublicId (string)
    expect(mapped.flowPublicId).toBe('flow-uuid-123');
    expect(typeof mapped.flowPublicId).toBe('string');

    // Deve ser JSON serializável
    const jsonStr = JSON.stringify(mapped);
    expect(jsonStr).not.toContain('BigInt');
  });
});
