import { describe, expect, it, vi } from 'vitest';
import { EvolutionWhatsAppDelivery } from './evolution-whatsapp-delivery.js';

function subject() {
  const config = { findUnique: vi.fn().mockResolvedValue({ active: true, connectionStatus: 'CONNECTED', encryptedAccessToken: 'cipher:token' }) };
  const client = { tenantWhatsAppSettings: config, tenantWhatsAppConfig: config };
  const evolution = { sendText: vi.fn().mockResolvedValue({ messageId: 'message-1' }) };
  const cipher = { decrypt: vi.fn().mockReturnValue({ token: 'instance-token' }) };
  return { delivery: new EvolutionWhatsAppDelivery(client as never, evolution as never, cipher as never), evolution, cipher };
}

describe('EvolutionWhatsAppDelivery', () => {
  it('resolves the selected tenant config, normalizes the phone and sends with the instance token', async () => {
    const { delivery, evolution } = subject();
    await expect(delivery.sendPlainText(7n, '(11) 99999-9999', 'Olá')).resolves.toMatchObject({ status: 'SENT', externalMessageId: 'message-1' });
    expect(evolution.sendText).toHaveBeenCalledWith('instance-token', '5511999999999', 'Olá');
  });

  it('does not expose provider details when the instance token is rejected', async () => {
    const { delivery, evolution } = subject();
    evolution.sendText.mockRejectedValueOnce({ code: 'EVOLUTION_UNAUTHORIZED', statusCode: 401 });
    await expect(delivery.sendPlainText(7n, '5511999999999', 'Olá')).resolves.toMatchObject({ status: 'FAILED', errorCode: 'EVOLUTION_INVALID_TOKEN', message: 'O token da instância Evolution não foi aceito.' });
  });
});
