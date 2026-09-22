import { describe, expect, it, vi } from 'vitest';
import { WhatsAppProviderConfigService } from './whatsapp-provider-config.service.js';

function subject(rows: Array<Record<string, unknown>> = [], existing: Record<string, unknown> | null = null) {
  const setting = { findMany: vi.fn().mockResolvedValue(rows), findUnique: vi.fn().mockResolvedValue(existing), upsert: vi.fn().mockImplementation(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => ({ id: 1n, ...(existing ?? create), ...(existing ? update : {}), baseUrl: (existing ? update.baseUrl : create.baseUrl) ?? null, encryptedApiKey: (existing ? existing.encryptedApiKey : create.encryptedApiKey) ?? null })), update: vi.fn() };
  const cipher = { encrypt: vi.fn((value: unknown) => `cipher:${JSON.stringify(value)}`), decrypt: vi.fn(() => ({ apiKey: 'global-key' })) };
  return { service: new WhatsAppProviderConfigService({ platformWhatsAppProviderSetting: setting } as never, cipher as never), setting, cipher };
}

describe('WhatsAppProviderConfigService', () => {
  it('bootstraps Evolution and Meta enabled while WAPI is disabled', async () => {
    const { service } = subject();
    await expect(service.list()).resolves.toEqual({ items: expect.arrayContaining([
      expect.objectContaining({ provider: 'EVOLUTION', enabled: true }),
      expect.objectContaining({ provider: 'META', enabled: true }),
      expect.objectContaining({ provider: 'WAPI', enabled: false }),
    ]) });
  });

  it('encrypts the Evolution key and does not return plaintext', async () => {
    const { service, cipher } = subject();
    const result = await service.update('EVOLUTION', { enabled: true, baseUrl: 'https://evolution.internal', apiKey: 'global-secret-key' });
    expect(cipher.encrypt).toHaveBeenCalledWith({ apiKey: 'global-secret-key' });
    expect(result).not.toHaveProperty('apiKey');
    expect(result).not.toHaveProperty('encryptedApiKey');
  });

  it('normalizes URLs and preserves an existing key when apiKey is empty', async () => {
    const { service, setting, cipher } = subject([], { provider: 'EVOLUTION', enabled: false, baseUrl: 'https://old.example', encryptedApiKey: 'cipher:old' });
    await service.update('EVOLUTION', { enabled: true, baseUrl: 'https://new.example///', apiKey: '   ' });
    expect(setting.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { enabled: true, baseUrl: 'https://new.example' } }));
    expect(cipher.encrypt).not.toHaveBeenCalled();
  });

  it('rejects invalid URLs', async () => {
    const { service } = subject();
    await expect(service.update('EVOLUTION', { enabled: true, baseUrl: 'ftp://invalid.example' })).rejects.toThrow('http ou https');
  });

  it('health checks the administrative list endpoint and maps auth/network failures safely', async () => {
    const rows = [{ provider: 'EVOLUTION', enabled: true, baseUrl: 'https://evolution.example', encryptedApiKey: 'cipher:key' }];
    const { service } = subject(rows, rows[0]);
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    await expect(service.test('EVOLUTION')).resolves.toEqual({ provider: 'EVOLUTION', status: 'ONLINE' });
    expect(fetcher).toHaveBeenCalledWith('https://evolution.example/instance/all', expect.objectContaining({ headers: expect.objectContaining({ apikey: 'global-key' }) }));
    fetcher.mockResolvedValueOnce(new Response('{}', { status: 401 }));
    await expect(service.test('EVOLUTION')).resolves.toMatchObject({ status: 'UNAUTHORIZED' });
    fetcher.mockRejectedValueOnce(new Error('network')); 
    await expect(service.test('EVOLUTION')).resolves.toMatchObject({ status: 'UNAVAILABLE' });
    fetcher.mockRestore();
  });
});
