import { describe, expect, it, vi } from 'vitest';

import { MetaWhatsAppDelivery } from './meta-whatsapp-delivery.js';

const tenantConfig = {
  provider: 'META',
  active: true,
  phoneNumberId: 'PHONE123',
  apiVersion: 'v23.0',
  encryptedAccessToken: 'ciphertext',
};

const subject = (sendMessage = vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  payload: { messages: [{ id: 'wamid.sent' }] },
})) => {
  const client = {
    tenantWhatsAppSettings: {
      findUnique: vi.fn().mockResolvedValue({ selectedProvider: 'META' }),
    },
    tenantWhatsAppConfig: {
      findUnique: vi.fn().mockResolvedValue(tenantConfig),
    },
  };
  const cipher = {
    decrypt: vi.fn().mockReturnValue({ accessToken: 'meta-token' }),
  };
  return {
    client,
    cipher,
    sendMessage,
    delivery: new MetaWhatsAppDelivery(client as never, cipher as never, { sendMessage } as never),
  };
};

describe('MetaWhatsAppDelivery', () => {
  it('sends plain text through the Meta client using tenant credentials', async () => {
    const { delivery, sendMessage } = subject();

    await expect(delivery.sendPlainText(7n, '5511999999999', 'Olá')).resolves.toMatchObject({
      externalMessageId: 'wamid.sent',
      status: 'SENT',
      httpStatus: 200,
      errorCode: null,
    });

    expect(sendMessage).toHaveBeenCalledWith('v23.0', 'PHONE123', 'meta-token', {
      to: '5511999999999',
      type: 'text',
      text: { body: 'Olá' },
    });
  });

  it('translates shared interactive buttons to Meta interactive.button payloads', async () => {
    const { delivery, sendMessage } = subject();

    await delivery.sendInteractiveButtons(7n, '5511999999999', 'Escolha', [
      { buttonId: 'A', label: 'Primeira opção grande' },
      { buttonId: 'B', label: 'Segunda' },
      { buttonId: 'C', label: 'Terceira' },
      { buttonId: 'D', label: 'Quarta ignorada' },
    ]);

    expect(sendMessage).toHaveBeenCalledWith('v23.0', 'PHONE123', 'meta-token', {
      to: '5511999999999',
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: 'Escolha' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'A', title: 'Primeira opção grand' } },
            { type: 'reply', reply: { id: 'B', title: 'Segunda' } },
            { type: 'reply', reply: { id: 'C', title: 'Terceira' } },
          ],
        },
      },
    });
  });

  it('returns a normalized failed outcome when Meta refuses the message', async () => {
    const { delivery } = subject(
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        payload: { error: { code: 131000 } },
      }),
    );

    await expect(delivery.sendPlainText(7n, '5511999999999', 'Olá')).resolves.toMatchObject({
      externalMessageId: null,
      status: 'FAILED',
      httpStatus: 400,
      errorCode: '131000',
    });
  });

  it('does not send when the tenant is not configured for active Meta delivery', async () => {
    const { client, delivery, sendMessage } = subject();
    client.tenantWhatsAppConfig.findUnique.mockResolvedValueOnce({ ...tenantConfig, active: false });

    await expect(delivery.sendPlainText(7n, '5511999999999', 'Olá')).rejects.toThrow(
      'Meta WhatsApp nao configurado ou inativo',
    );
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
