import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type PrismaClient } from '../../database-client/client.js';
import { CredentialsCipher } from '../payments/gateway/credentials-cipher.js';
import { WapiConfigService } from './wapi-config.service.js';
import { WapiMasterCredentialProvider } from '../integrations/wapi-master-credential-provider.js';
import { WApiIntegrationService } from '../integrations/wapi-integration.service.js';

describe('W-API Configuration Integration', () => {
  let client: PrismaClient;
  let cipher: CredentialsCipher;
  let service: WapiConfigService;

  beforeEach(() => {
    cipher = new CredentialsCipher('test-encryption-key-32bytes');
    client = {
      platformWapiConfig: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    } as unknown as PrismaClient;
  });

  it('1. sem DB e sem ENV: source=none, configured=false', async () => {
    vi.mocked(client.platformWapiConfig.findFirst).mockResolvedValue(null);
    service = new WapiConfigService(client, cipher, undefined);

    const config = await service.getConfig();

    expect(config.source).toBe('none');
    expect(config.configured).toBe(false);
  });

  it('2. ENV configurado: source=environment, configured=true', async () => {
    vi.mocked(client.platformWapiConfig.findFirst).mockResolvedValue(null);
    service = new WapiConfigService(client, cipher, 'env-key-12345678');

    const config = await service.getConfig();

    expect(config.source).toBe('environment');
    expect(config.configured).toBe(true);
  });

  it('3. PUT salva config no DB', async () => {
    vi.mocked(client.platformWapiConfig.findFirst).mockResolvedValue(null);
    vi.mocked(client.platformWapiConfig.create).mockResolvedValue({
      id: 1n,
      publicId: 'test-uuid',
      masterApiKeyCiphertext: 'enc:...',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    service = new WapiConfigService(client, cipher, undefined);

    const result = await service.setConfig('new-key-12345678');

    expect(result.configured).toBe(true);
    expect(result.source).toBe('database');
    expect(client.platformWapiConfig.create).toHaveBeenCalled();
  });

  it('4. valor persistido != plaintext', () => {
    const encrypted = cipher.encrypt({ masterApiKey: 'secret-key' });
    expect(encrypted).not.toContain('secret-key');
    expect(encrypted).toMatch(/^enc:/);
  });

  it('5. decrypt retorna plaintext correto', () => {
    const plaintext = 'my-secret-key-123456';
    const encrypted = cipher.encrypt({ masterApiKey: plaintext });
    const decrypted = cipher.decrypt(encrypted) as { masterApiKey: string };
    expect(decrypted.masterApiKey).toBe(plaintext);
  });

  it('6. GET nunca contém masterApiKey', async () => {
    vi.mocked(client.platformWapiConfig.findFirst).mockResolvedValue(null);
    service = new WapiConfigService(client, cipher, 'env-key');

    const response = await service.getConfig();

    expect(JSON.stringify(response)).not.toContain('masterApiKey');
    expect(Object.keys(response)).not.toContain('masterApiKey');
  });

  it('7. PUT response nunca contém masterApiKey', async () => {
    vi.mocked(client.platformWapiConfig.findFirst).mockResolvedValue(null);
    vi.mocked(client.platformWapiConfig.create).mockResolvedValue({
      id: 1n,
      publicId: 'uuid',
      masterApiKeyCiphertext: 'enc:...',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    service = new WapiConfigService(client, cipher, undefined);

    const response = await service.setConfig('key-12345678');

    expect(JSON.stringify(response)).not.toContain('masterApiKey');
  });

  it('8. POST /test nunca contém masterApiKey', async () => {
    vi.mocked(client.platformWapiConfig.findFirst).mockResolvedValue(null);
    vi.mocked(client.platformWapiConfig.findFirst).mockResolvedValue(null);
    service = new WapiConfigService(client, cipher, 'valid-key-1234567');

    const response = await service.testConfig();

    expect(JSON.stringify(response)).not.toContain('masterApiKey');
  });

  it('12. DB vence ENV', async () => {
    const dbKey = 'db-key-123456789';
    const encryptedDb = cipher.encrypt({ masterApiKey: dbKey });
    vi.mocked(client.platformWapiConfig.findFirst).mockResolvedValue({
      id: 1n,
      publicId: 'uuid',
      masterApiKeyCiphertext: encryptedDb,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    service = new WapiConfigService(client, cipher, 'env-key-1234567');

    const config = await service.getConfig();

    expect(config.source).toBe('database');
  });

  it('13. KEY_A no DB: WApiIntegrationService usa KEY_A', async () => {
    const keyA = 'key-a-12345678901';
    const encryptedA = cipher.encrypt({ masterApiKey: keyA });
    vi.mocked(client.platformWapiConfig.findFirst).mockResolvedValue({
      id: 1n,
      publicId: 'uuid',
      masterApiKeyCiphertext: encryptedA,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    service = new WapiConfigService(client, cipher, undefined);

    const provider = new WapiMasterCredentialProvider(client, undefined, cipher);
    const cred = await provider.resolve();

    expect(cred.masterApiKey).toBe(keyA);
    expect(cred.source).toBe('database');
  });

  it('14. substituir por KEY_B sem restart: resolução dinâmica', async () => {
    const keyA = 'key-a-12345678901';
    const encryptedA = cipher.encrypt({ masterApiKey: keyA });

    vi.mocked(client.platformWapiConfig.findFirst).mockResolvedValueOnce({
      id: 1n,
      publicId: 'uuid',
      masterApiKeyCiphertext: encryptedA,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const provider = new WapiMasterCredentialProvider(client, undefined, cipher);
    const cred1 = await provider.resolve();
    expect(cred1.masterApiKey).toBe(keyA);

    const keyB = 'key-b-12345678901';
    const encryptedB = cipher.encrypt({ masterApiKey: keyB });

    vi.mocked(client.platformWapiConfig.findFirst).mockResolvedValueOnce({
      id: 1n,
      publicId: 'uuid',
      masterApiKeyCiphertext: encryptedB,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const cred2 = await provider.resolve();
    expect(cred2.masterApiKey).toBe(keyB);
  });

  it('15. remover DB: fallback usa KEY_ENV', async () => {
    vi.mocked(client.platformWapiConfig.findFirst).mockResolvedValue(null);
    const envKey = 'env-key-1234567';
    service = new WapiConfigService(client, cipher, envKey);

    const config = await service.getConfig();

    expect(config.source).toBe('environment');
    expect(config.configured).toBe(true);
  });

  it('16. sem DB e sem ENV: provisioning falha com erro seguro', async () => {
    vi.mocked(client.platformWapiConfig.findFirst).mockResolvedValue(null);
    service = new WapiConfigService(client, cipher, undefined);

    await expect(service.testConfig()).rejects.toThrow('W-API not configured');
  });

  it('18. ciphertext nunca aparece nas responses', async () => {
    const encrypted = cipher.encrypt({ masterApiKey: 'secret' });
    vi.mocked(client.platformWapiConfig.findFirst).mockResolvedValue({
      id: 1n,
      publicId: 'uuid',
      masterApiKeyCiphertext: encrypted,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    service = new WapiConfigService(client, cipher, undefined);

    const response = await service.getConfig();

    expect(JSON.stringify(response)).not.toContain(encrypted.slice(0, 20));
  });
});
