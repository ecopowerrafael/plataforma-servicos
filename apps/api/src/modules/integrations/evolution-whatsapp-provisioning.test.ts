import { describe, expect, it, vi } from 'vitest';
import { EvolutionWhatsAppProvisioning } from './evolution-whatsapp-provisioning.js';

function subject() {
  const row = { phoneNumberId: 'evo-1', webhookPublicId: 'hook-evo-1', instanceName: 'tenant-7-demo', active: false, connectionStatus: 'CREATED', encryptedAccessToken: 'cipher:instance-token', connectedAt: null, connectedPhone: null, connectedName: null, lastStatusCheckAt: null };
  const config = { findUnique: vi.fn().mockResolvedValue(row), create: vi.fn().mockResolvedValue(row), update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...row, ...data })) };
  const evolution = { createInstance: vi.fn().mockResolvedValue({ id: 'evo-1', name: 'tenant-7-demo' }), connect: vi.fn().mockResolvedValue({}), qr: vi.fn().mockResolvedValue({ Qrcode: 'png' }), status: vi.fn().mockResolvedValue({ connected: true, loggedIn: true }), disconnect: vi.fn(), reconnect: vi.fn().mockResolvedValue({}) };
  const client = { tenantWhatsAppConfig: config, tenant: { findUnique: vi.fn().mockResolvedValue({ slug: 'demo' }) } };
  const cipher = { encrypt: vi.fn((value: unknown) => `cipher:${JSON.stringify(value)}`), decrypt: vi.fn(() => ({ token: 'instance-token' })) };
  return { service: new EvolutionWhatsAppProvisioning(client as never, evolution as never, cipher as never), config, evolution, cipher };
}

describe('EvolutionWhatsAppProvisioning', () => {
  it('creates an instance with a tenant-stable name and never stores the global key', async () => {
    const { service, evolution, config } = subject();
    config.findUnique.mockResolvedValueOnce(null);
    await service.connect(7n);
    expect(evolution.createInstance).toHaveBeenCalledWith('tenant-7-demo', expect.any(String));
    expect(config.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ provider: 'EVOLUTION', encryptedAccessToken: expect.stringMatching(/^cipher:\{"token":"[0-9a-f-]+"\}$/u) }) }));
  });

  it('marks the tenant config active only after the provider reports connected', async () => {
    const { service, config } = subject();
    await expect(service.refreshStatus(7n)).resolves.toMatchObject({ state: 'CONNECTED' });
    expect(config.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ active: true, connectionStatus: 'CONNECTED' }) }));
  });

  it('returns QR data as a browser-safe data URL and preserves reconnect flow', async () => {
    const { service, evolution } = subject();
    await expect(service.qrCode(7n)).resolves.toMatchObject({ qrCode: 'data:image/png;base64,png' });
    evolution.qr.mockResolvedValueOnce({ qrcode: 'next-qr' });
    await expect(service.reconnect(7n)).resolves.toMatchObject({ qrCode: 'data:image/png;base64,next-qr' });
    expect(evolution.reconnect).toHaveBeenCalledWith('instance-token');
    expect(evolution.connect).toHaveBeenCalledTimes(1);
    expect(evolution.createInstance).not.toHaveBeenCalled();
  });
});
