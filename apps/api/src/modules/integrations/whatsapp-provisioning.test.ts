import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { WApiIntegrationService } from './wapi-integration.service.js';
import { WhatsAppProvisioningService } from './whatsapp-provisioning.service.js';

import type { PrismaClient } from '../../database-client/client.js';
import type { CredentialsCipher } from '../payments/gateway/credentials-cipher.js';

const MASTER_KEY = 'master-key-super-secreta';
const INSTANCE = 'T34398-VYR3QD-MS29SL';
const TOKEN = 'token-da-instancia';

const cipher = {
  encrypt: (value: Record<string, unknown>) => `enc:${JSON.stringify(value)}`,
  decrypt: (payload: string) => JSON.parse(payload.replace(/^enc:/u, '')) as Record<string, unknown>,
} as unknown as CredentialsCipher;

const config = (overrides: Record<string, unknown> = {}) => ({
  id: 1n,
  publicId: '00000000-0000-4000-8000-0000000000a1',
  tenantId: 1n,
  active: false,
  provider: 'WAPI',
  phoneNumberId: INSTANCE,
  instanceName: 'agendei-studio',
  connectionStatus: 'CREATED',
  connectedPhone: null,
  connectedName: null,
  connectedAt: null,
  lastStatusCheckAt: null,
  businessAccountId: 'internal',
  encryptedAccessToken: `enc:${JSON.stringify({ token: TOKEN })}`,
  apiVersion: 'v1',
  lastValidationStatus: null,
  lastValidatedAt: null,
  createdAt: new Date('2026-08-17T12:00:00.000Z'),
  updatedAt: new Date('2026-08-17T12:00:00.000Z'),
  ...overrides,
});

function client(overrides: Record<string, unknown> = {}) {
  const whatsapp = {
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(config(data)),
    ),
    update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(config(data)),
    ),
  };
  const base = {
    tenantWhatsAppConfig: whatsapp,
    tenant: { findUnique: vi.fn().mockResolvedValue({ slug: 'studio', displayName: 'Studio' }) },
    // Plano com whatsapp.enabled ligado; os testes de bloqueio sobrescrevem.
    tenantSubscription: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ plan: { limits: [{ key: 'whatsapp.enabled', booleanValue: true }] } }),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ acquired: 1 }]),
    ...overrides,
  };
  return { database: base as unknown as PrismaClient, whatsapp };
}

/** Provedor com respostas oficiais da W-API. */
function provider(responses: Record<string, unknown>, status = 200) {
  const fetcher = vi.fn<typeof fetch>().mockImplementation((input) => {
    const url = urlOf(input);
    const key = Object.keys(responses).find((path) => url.includes(path));
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(key === undefined ? {} : responses[key]),
    } as Response);
  });
  return { fetcher, service: new WApiIntegrationService(MASTER_KEY, 'https://api.w-api.app', fetcher) };
}

/** O serviço sempre chama com string e corpo string; os helpers só estreitam. */
const urlOf = (input: Parameters<typeof fetch>[0]) => (typeof input === 'string' ? input : '');
const bodyOf = (init: RequestInit | undefined) =>
  typeof init?.body === 'string' ? init.body : '{}';

const CREATE_RESPONSE = {
  error: false,
  instanceId: INSTANCE,
  token: TOKEN,
  instanceName: 'agendei-studio',
  status: 'PENDING',
};

describe('provisionamento — criação da instância', () => {
  it('cria a instância pela API Integration e guarda o token cifrado', async () => {
    const { database, whatsapp } = client();
    const { fetcher, service } = provider({ '/v1/client/create-instance': CREATE_RESPONSE });
    const view = await new WhatsAppProvisioningService(
      database,
      service,
      cipher,
      'https://app.agendei.test',
    ).connect(1n);

    expect(view.state).toBe('CREATED');
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(urlOf(url ?? '')).toBe('https://api.w-api.app/v1/client/create-instance');
    const body = JSON.parse(bodyOf(init)) as Record<string, string>;
    expect(body.apiKey).toBe(MASTER_KEY);
    expect(body.webhookReceivedUrl).toBe(
      'https://app.agendei.test/public/integrations/whatsapp/webhook',
    );
    // Sem `lite`: a instância nasce PRO, exigida pelas mensagens interativas.
    expect(body.lite).toBeUndefined();
    const created = whatsapp.create.mock.calls[0]?.[0] as { data: Record<string, string> };
    expect(created.data.phoneNumberId).toBe(INSTANCE);
    expect(created.data.encryptedAccessToken).toContain('enc:');
    expect(created.data.encryptedAccessToken).not.toBe(TOKEN);
  });

  it('não devolve token, instanceId nem chave mestra ao frontend', async () => {
    const { database } = client();
    const { service } = provider({ '/v1/client/create-instance': CREATE_RESPONSE });
    const view = await new WhatsAppProvisioningService(database, service, cipher).connect(1n);
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(MASTER_KEY);
    expect(serialized).not.toContain(INSTANCE);
  });

  it('duplo clique não cria duas instâncias', async () => {
    const { database, whatsapp } = client();
    whatsapp.findUnique.mockResolvedValueOnce(null).mockResolvedValue(config());
    const { fetcher, service } = provider({ '/v1/client/create-instance': CREATE_RESPONSE });
    const provisioning = new WhatsAppProvisioningService(database, service, cipher);
    await provisioning.connect(1n);
    await provisioning.connect(1n);
    expect(fetcher.mock.calls.filter(([url]) => urlOf(url).includes('create-instance'))).toHaveLength(
      0,
    );
    expect(whatsapp.create).not.toHaveBeenCalled();
  });

  it('bloqueia quando a chave mestra não está configurada', async () => {
    const { database } = client();
    const service = new WApiIntegrationService(undefined, 'https://api.w-api.app', vi.fn());
    await expect(
      new WhatsAppProvisioningService(database, service, cipher).connect(1n),
    ).rejects.toMatchObject({ code: 'WHATSAPP_PROVIDER_UNAVAILABLE' });
  });
});

describe('provisionamento — QR e reconexão', () => {
  it('gera QR reutilizando a instância existente, sem criar outra', async () => {
    const { database, whatsapp } = client();
    whatsapp.findUnique.mockResolvedValue(config());
    const { fetcher, service } = provider({
      '/v1/instance/qr-code': { error: false, qrcode: 'data:image/png;base64,AAA' },
    });
    const result = await new WhatsAppProvisioningService(database, service, cipher).qrCode(1n);
    expect(result.qrCode).toBe('data:image/png;base64,AAA');
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(urlOf(url ?? '')).toContain('/v1/instance/qr-code?instanceId=');
    expect(init?.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
    expect(whatsapp.create).not.toHaveBeenCalled();
    expect(result.view.state).toBe('WAITING_QR');
  });

  it('normaliza QR base64 sem prefixo para uma imagem renderizável', async () => {
    const { database, whatsapp } = client();
    whatsapp.findUnique.mockResolvedValue(config());
    const { service } = provider({
      '/v1/instance/qr-code': { error: false, qrcode: 'AAA' },
    });
    const result = await new WhatsAppProvisioningService(database, service, cipher).qrCode(1n);
    expect(result.qrCode).toBe('data:image/png;base64,AAA');
  });

  it('reconectar usa a mesma instância e apenas devolve um novo QR', async () => {
    const { database, whatsapp } = client();
    whatsapp.findUnique.mockResolvedValue(config({ connectionStatus: 'DISCONNECTED' }));
    const { service } = provider({
      '/v1/instance/qr-code': { error: false, qrcode: 'data:image/png;base64,BBB' },
    });
    const result = await new WhatsAppProvisioningService(database, service, cipher).reconnect(1n);
    expect(result.qrCode).toBe('data:image/png;base64,BBB');
    expect(whatsapp.create).not.toHaveBeenCalled();
  });

  it('sem instância, o QR não provisiona nada', async () => {
    const { database, whatsapp } = client();
    const { service } = provider({});
    await expect(
      new WhatsAppProvisioningService(database, service, cipher).qrCode(1n),
    ).rejects.toMatchObject({ code: 'WHATSAPP_NOT_PROVISIONED' });
    expect(whatsapp.create).not.toHaveBeenCalled();
  });
});

describe('provisionamento — status e desconexão', () => {
  it('consulta o provedor e persiste número e nome conectados', async () => {
    const { database, whatsapp } = client();
    whatsapp.findUnique.mockResolvedValue(config());
    const { service } = provider({
      '/v1/instance/status-instance': { instanceId: INSTANCE, connected: true },
      '/v1/instance/device': { connectedPhone: '5511999999999', name: 'Barbearia Silva' },
    });
    const view = await new WhatsAppProvisioningService(database, service, cipher).refreshStatus(1n);
    expect(view.state).toBe('CONNECTED');
    expect(view.connectedPhone).toBe('5511999999999');
    expect(view.connectedName).toBe('Barbearia Silva');
    const data = whatsapp.update.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(data.data.active).toBe(true);
    expect(data.data.connectionStatus).toBe('CONNECTED');
  });

  it('desconecta pelo endpoint oficial e preserva credenciais e histórico', async () => {
    const { database, whatsapp } = client();
    whatsapp.findUnique.mockResolvedValue(config({ connectionStatus: 'CONNECTED', active: true }));
    const { fetcher, service } = provider({
      '/v1/instance/disconnect': { error: false, message: 'Deslogado com sucesso!' },
    });
    const view = await new WhatsAppProvisioningService(database, service, cipher).disconnect(1n);
    expect(urlOf(fetcher.mock.calls[0]?.[0] ?? '')).toContain('/v1/instance/disconnect?instanceId=');
    expect(view.state).toBe('DISCONNECTED');
    const data = whatsapp.update.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    // A instância continua associada: nada de token apagado ou registro removido.
    expect(data.data).not.toHaveProperty('encryptedAccessToken');
    expect(data.data).not.toHaveProperty('phoneNumberId');
    expect(data.data.active).toBe(false);
  });

  it('desconectar duas vezes é seguro', async () => {
    const { database, whatsapp } = client();
    whatsapp.findUnique.mockResolvedValue(config({ connectionStatus: 'DISCONNECTED' }));
    const { service } = provider({ '/v1/instance/disconnect': { error: true, message: 'Já deslogado' } });
    const view = await new WhatsAppProvisioningService(database, service, cipher).disconnect(1n);
    expect(view.state).toBe('DISCONNECTED');
  });

  it('configuração legada continua funcionando e é marcada como existente', async () => {
    const { database, whatsapp } = client();
    whatsapp.findUnique.mockResolvedValue(config({ instanceName: null, connectionStatus: 'CREATED' }));
    const { service } = provider({
      '/v1/instance/status-instance': { instanceId: INSTANCE, connected: true },
      '/v1/instance/device': { connectedPhone: '5511888888888', name: 'Legado' },
    });
    const provisioning = new WhatsAppProvisioningService(database, service, cipher);
    expect((await provisioning.current(1n)).legacy).toBe(true);
    const view = await provisioning.refreshStatus(1n);
    expect(view.state).toBe('CONNECTED');
    expect(whatsapp.create).not.toHaveBeenCalled();
  });
});

describe('feature gate do plano', () => {
  it('tenant sem whatsapp.enabled não cria instância', async () => {
    const { database, whatsapp } = client({
      tenantSubscription: { findFirst: vi.fn().mockResolvedValue(null) },
    });
    const { fetcher, service } = provider({ '/v1/client/create-instance': CREATE_RESPONSE });
    await expect(
      new WhatsAppProvisioningService(database, service, cipher).connect(1n),
    ).rejects.toMatchObject({ code: 'PLAN_FEATURE_UNAVAILABLE' });
    expect(whatsapp.create).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('tenant sem o recurso também não gera QR nem desconecta', async () => {
    const { database, whatsapp } = client({
      tenantSubscription: { findFirst: vi.fn().mockResolvedValue(null) },
    });
    whatsapp.findUnique.mockResolvedValue(config());
    const { service } = provider({});
    const provisioning = new WhatsAppProvisioningService(database, service, cipher);
    await expect(provisioning.qrCode(1n)).rejects.toMatchObject({
      code: 'PLAN_FEATURE_UNAVAILABLE',
    });
    await expect(provisioning.disconnect(1n)).rejects.toMatchObject({
      code: 'PLAN_FEATURE_UNAVAILABLE',
    });
  });
});

describe('superfícies e segurança', () => {
  const routes = readFileSync(new URL('./integration.routes.ts', import.meta.url), 'utf8');

  it('as rotas resolvem o tenant pela sessão, nunca por instanceId do corpo', () => {
    expect(routes).toContain("'/tenant/integrations/whatsapp/instance'");
    expect(routes).toContain("'/tenant/integrations/whatsapp/qr'");
    expect(routes).toContain("'/tenant/integrations/whatsapp/status'");
    expect(routes).toContain("'/tenant/integrations/whatsapp/disconnect'");
    expect(routes).toContain("'/tenant/integrations/whatsapp/reconnect'");
    expect(routes).toContain('provisioning().connect(request.tenant.id)');
    expect(routes).toContain('provisioning().disconnect(request.tenant.id)');
  });

  it('o log técnico não carrega credencial nem QR', () => {
    expect(routes).toContain('{ operation, tenantPublicId: request.tenant.publicId }');
    expect(routes).not.toContain('qrCode }, ');
  });

  it('o serviço mantém o gate de plano em todas as operações', () => {
    const service = readFileSync(
      new URL('./whatsapp-provisioning.service.ts', import.meta.url),
      'utf8',
    );
    expect(service.match(/assertFeature\(tenantId\)/gu)?.length).toBeGreaterThanOrEqual(4);
    expect(service).toContain("'whatsapp.enabled'");
  });

  it('o webhook do Assistant continua no mesmo caminho público', () => {
    const webhook = readFileSync(new URL('./whatsapp-webhook.routes.ts', import.meta.url), 'utf8');
    expect(webhook).toContain("'/public/integrations/whatsapp/webhook'");
  });
});
