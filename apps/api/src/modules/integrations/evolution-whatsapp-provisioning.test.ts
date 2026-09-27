import { describe, expect, it, vi } from 'vitest';
import { EvolutionWhatsAppProvisioning } from './evolution-whatsapp-provisioning.js';

function subject() {
  const row = { phoneNumberId: 'evo-1', webhookPublicId: 'hook-evo-1', instanceName: 'tenant-7-demo', active: false, connectionStatus: 'CREATED', encryptedAccessToken: 'cipher:instance-token', connectedAt: null, connectedPhone: null, connectedName: null, lastStatusCheckAt: null };
  const config = { findUnique: vi.fn().mockResolvedValue(row), create: vi.fn().mockResolvedValue(row), update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...row, ...data })) };
  const evolution = { createInstance: vi.fn().mockResolvedValue({ id: 'evo-1', name: 'tenant-7-demo' }), connect: vi.fn().mockResolvedValue({}), getAdvancedSettings: vi.fn().mockResolvedValue({ alwaysOnline: false, rejectCall: false, readMessages: true, ignoreGroups: true, ignoreStatus: true }), updateAdvancedSettings: vi.fn().mockResolvedValue({}), qr: vi.fn().mockResolvedValue({ Qrcode: 'png' }), status: vi.fn().mockResolvedValue({ connected: true, loggedIn: true }), disconnect: vi.fn(), reconnect: vi.fn().mockResolvedValue({}) };
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

  it('does not treat an open transport without a logged-in session as connected', async () => {
    const { service, evolution, config } = subject();
    evolution.status.mockResolvedValueOnce({ status: 'open', connected: false, loggedIn: false });
    await expect(service.refreshStatus(7n)).resolves.toMatchObject({ state: 'DISCONNECTED' });
    expect(config.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ active: false, connectionStatus: 'DISCONNECTED' }) }));
  });

  it('persists optional phone and name fields without requiring them for connection', async () => {
    const { service, evolution, config } = subject();
    evolution.status.mockResolvedValueOnce({ status: 'open', number: '5511999999999', name: 'Barbearia Silva' });
    await service.refreshStatus(7n);
    expect(config.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ connectedPhone: '5511999999999', connectedName: 'Barbearia Silva' }) }));
  });

  it('extracts the connected number from Evolution Go jid', async () => {
    const { service, evolution } = subject();
    evolution.status.mockResolvedValueOnce({ status: 'open', jid: '5511999999999@s.whatsapp.net', name: 'Barbearia Silva' });
    const result = await service.refreshStatus(7n);
    expect(result.connectedPhone).toBe('5511999999999');
  });

  it('recognizes the Evolution Go response casing used in production', async () => {
    const { service, evolution, config } = subject();
    evolution.status.mockResolvedValueOnce({ Connected: true, LoggedIn: true, Name: 'Barbearia Silva' });
    await expect(service.refreshStatus(7n)).resolves.toMatchObject({ state: 'CONNECTED', connectedName: 'Barbearia Silva' });
    expect(config.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ active: true, connectionStatus: 'CONNECTED', connectedName: 'Barbearia Silva' }) }));
  });

  it('does not treat a live socket as a logged-in WhatsApp session', async () => {
    const { service, evolution } = subject();
    evolution.status.mockResolvedValueOnce({ connected: true, loggedIn: false, status: 'open' });
    await expect(service.refreshStatus(7n)).resolves.toMatchObject({ state: 'DISCONNECTED' });
  });

  it('persists DISCONNECTED from the real Evolution status even when the cached row was connected', async () => {
    const { service, evolution, config } = subject();
    config.findUnique.mockResolvedValueOnce({ ...(await config.findUnique()), connectedAt: new Date(), connectionStatus: 'CONNECTED', active: true });
    evolution.status.mockResolvedValueOnce({ status: 'close', connected: false, loggedIn: false });
    await expect(service.refreshStatus(7n)).resolves.toMatchObject({ state: 'DISCONNECTED' });
    expect(config.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ active: false, connectionStatus: 'DISCONNECTED', lastStatusCheckAt: expect.any(Date) }) }));
  });

  it('does not keep CONNECTED when the Evolution status request fails', async () => {
    const { service, evolution, config } = subject();
    config.findUnique.mockResolvedValueOnce({ ...(await config.findUnique()), connectedAt: new Date(), connectionStatus: 'CONNECTED', active: true });
    evolution.status.mockRejectedValueOnce(new Error('provider unavailable'));
    await expect(service.refreshStatus(7n)).resolves.toMatchObject({ state: 'ERROR' });
    expect(config.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ active: false, connectionStatus: 'ERROR', lastStatusCheckAt: expect.any(Date) }) }));
  });

  it('does not reconnect the Evolution instance while refreshing a waiting QR', async () => {
    const { service, evolution, config } = subject();
    config.findUnique.mockResolvedValueOnce({ ...await config.findUnique(), connectionStatus: 'WAITING_QR' });
    await expect(service.qrCode(7n)).resolves.toMatchObject({ qrCode: 'data:image/png;base64,png' });
    expect(evolution.connect).not.toHaveBeenCalled();
  });

  it('reconfigures the Evolution webhook with the instance token and public URL', async () => {
    const { service, evolution } = subject();
    const previous = process.env.APP_WEB_URL;
    process.env.APP_WEB_URL = 'https://agendei.site';
    await expect(service.reconfigureWebhooks(7n)).resolves.toEqual({ success: true });
    expect(evolution.connect).toHaveBeenCalledWith('instance-token', 'https://agendei.site/public/webhooks/whatsapp/evolution/hook-evo-1');
    expect(evolution.updateAdvancedSettings).toHaveBeenCalledWith('evo-1', 'instance-token');
    expect(evolution.getAdvancedSettings).toHaveBeenCalledWith('evo-1', 'instance-token');
    process.env.APP_WEB_URL = previous;
  });

  it('applies and verifies the required advanced settings when reconfiguring', async () => {
    const { service, evolution } = subject();
    await service.reconfigureWebhooks(7n);
    expect(evolution.updateAdvancedSettings).toHaveBeenCalledWith('evo-1', 'instance-token');
    expect(evolution.getAdvancedSettings).toHaveBeenCalledWith('evo-1', 'instance-token');
  });

  it('returns QR data as a browser-safe data URL and preserves reconnect flow', async () => {
    const { service, evolution } = subject();
    await expect(service.qrCode(7n)).resolves.toMatchObject({ qrCode: 'data:image/png;base64,png' });
    evolution.qr.mockResolvedValueOnce({ qrcode: 'next-qr' });
    await expect(service.reconnect(7n)).resolves.toMatchObject({ qrCode: 'data:image/png;base64,next-qr' });
    expect(evolution.reconnect).toHaveBeenCalledWith('instance-token');
    expect(evolution.connect).toHaveBeenCalledTimes(2);
    expect(evolution.createInstance).not.toHaveBeenCalled();
  });
});
