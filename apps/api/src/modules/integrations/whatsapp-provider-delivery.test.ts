import { describe, expect, it, vi } from 'vitest';

import { ProviderResolvedWhatsAppDelivery } from './whatsapp-provider-delivery.js';

const outcome = {
  externalMessageId: 'MSG',
  status: 'SENT' as const,
  httpStatus: 200,
  errorCode: null,
  message: 'ok',
};

const delivery = (provider: string) => ({
  provider,
  capabilities: {
    qrCode: provider === 'WAPI',
    autoProvision: provider === 'WAPI',
    interactiveMessages: true,
    templates: provider === 'META',
    official: provider === 'META',
  },
  send: vi.fn().mockResolvedValue(undefined),
  sendPlainText: vi.fn().mockResolvedValue(outcome),
  sendInteractiveButtons: vi.fn().mockResolvedValue(outcome),
  testConnection: vi.fn().mockResolvedValue({
    connected: true,
    code: 'WHATSAPP_CONNECTED',
    message: 'ok',
    httpStatus: 200,
    externalCode: null,
  }),
  configureReceivedWebhook: vi.fn().mockResolvedValue({ ok: true }),
  configureStatusWebhook: vi.fn().mockResolvedValue({ ok: true }),
  inspectInstance: vi.fn().mockResolvedValue({ instance: { ok: true }, queue: { ok: true } }),
  runControlTest: vi.fn().mockResolvedValue({
    phoneCheck: { ok: true },
    text: { ok: true },
  }),
});

describe('ProviderResolvedWhatsAppDelivery', () => {
  it('delegates plain text sends to the tenant provider delivery adapter', async () => {
    const wapi = delivery('WAPI');
    const meta = delivery('META');
    const resolver = {
      deliveryForTenant: vi.fn(async (tenantId: bigint) => (tenantId === 1n ? wapi : meta)),
    };
    const facade = new ProviderResolvedWhatsAppDelivery(resolver as never);

    await expect(facade.sendPlainText(1n, '5511999999999', 'Oi WAPI')).resolves.toBe(outcome);
    await expect(facade.sendPlainText(2n, '5511888888888', 'Oi Meta')).resolves.toBe(outcome);

    expect(resolver.deliveryForTenant).toHaveBeenNthCalledWith(1, 1n);
    expect(resolver.deliveryForTenant).toHaveBeenNthCalledWith(2, 2n);
    expect(wapi.sendPlainText).toHaveBeenCalledWith(1n, '5511999999999', 'Oi WAPI');
    expect(meta.sendPlainText).toHaveBeenCalledWith(2n, '5511888888888', 'Oi Meta');
  });

  it('delegates interactive messages without leaking provider-specific details to callers', async () => {
    const meta = delivery('META');
    const resolver = { deliveryForTenant: vi.fn().mockResolvedValue(meta) };
    const facade = new ProviderResolvedWhatsAppDelivery(resolver as never);
    const buttons = [{ buttonId: 'BOOKING_CONFIRM', label: 'Confirmar' }];

    await expect(facade.sendInteractiveButtons(7n, '5511999999999', 'Escolha', buttons)).resolves.toBe(outcome);

    expect(meta.sendInteractiveButtons).toHaveBeenCalledWith(
      7n,
      '5511999999999',
      'Escolha',
      buttons,
      undefined,
    );
  });

  it('uses the tenant provider for diagnostics and webhook configuration too', async () => {
    const meta = delivery('META');
    const resolver = { deliveryForTenant: vi.fn().mockResolvedValue(meta) };
    const facade = new ProviderResolvedWhatsAppDelivery(resolver as never);

    await facade.testConnection(7n);
    await facade.configureReceivedWebhook(7n, 'https://app.test/webhooks/whatsapp/meta');
    await facade.configureStatusWebhook(7n, 'https://app.test/webhooks/whatsapp/meta');
    await facade.inspectInstance(7n);
    await facade.runControlTest(7n, '5511999999999', 'Controle');

    expect(resolver.deliveryForTenant).toHaveBeenCalledTimes(5);
    expect(meta.testConnection).toHaveBeenCalledWith(7n, undefined);
    expect(meta.configureReceivedWebhook).toHaveBeenCalledWith(7n, 'https://app.test/webhooks/whatsapp/meta');
    expect(meta.configureStatusWebhook).toHaveBeenCalledWith(7n, 'https://app.test/webhooks/whatsapp/meta');
    expect(meta.inspectInstance).toHaveBeenCalledWith(7n);
    expect(meta.runControlTest).toHaveBeenCalledWith(7n, '5511999999999', 'Controle');
  });
});
