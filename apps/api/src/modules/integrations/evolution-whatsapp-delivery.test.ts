import { describe, expect, it, vi } from 'vitest';
import { EvolutionWhatsAppDelivery } from './evolution-whatsapp-delivery.js';

function subject() {
  const config = { findUnique: vi.fn().mockResolvedValue({ active: true, connectionStatus: 'CONNECTED', encryptedAccessToken: 'cipher:token' }) };
  const client = { tenantWhatsAppSettings: config, tenantWhatsAppConfig: config };
  const evolution = { sendText: vi.fn().mockResolvedValue({ messageId: 'message-1' }), sendButton: vi.fn().mockResolvedValue({ messageId: 'button-1' }), sendList: vi.fn().mockResolvedValue({ messageId: 'list-1' }) };
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

  it('selects quick replies for 1 to 3 options and lists for 4 to 10', async () => {
    const { delivery, evolution } = subject();
    const buttons = Array.from({ length: 3 }, (_, index) => ({ buttonId: `quick-${index}`, label: `Opção ${index}` }));
    await expect(delivery.sendInteractiveButtons(7n, '(11) 99999-9999', 'Escolha', buttons)).resolves.toMatchObject({ status: 'SENT', externalMessageId: 'button-1' });
    expect(evolution.sendButton).toHaveBeenCalledWith('instance-token', '5511999999999', 'Escolha', buttons.map((button) => ({ id: button.buttonId, label: button.label })));
    const list = Array.from({ length: 10 }, (_, index) => ({ buttonId: `row-${index}`, label: `Linha ${index}` }));
    await expect(delivery.sendInteractiveButtons(7n, '5511999999999', 'Escolha', [...list.slice(0, 4)])).resolves.toMatchObject({ status: 'SENT', externalMessageId: 'list-1' });
    expect(evolution.sendList).toHaveBeenCalledWith('instance-token', '5511999999999', 'Escolha', list.slice(0, 4).map((button) => ({ rowId: button.buttonId, title: button.label })));
  });

  it('rejects more than 10 options without truncating', async () => {
    const { delivery, evolution } = subject();
    const buttons = Array.from({ length: 11 }, (_, index) => ({ buttonId: `row-${index}`, label: `Linha ${index}` }));
    await expect(delivery.sendInteractiveButtons(7n, '5511999999999', 'Escolha', buttons)).resolves.toMatchObject({ status: 'FAILED', errorCode: 'EVOLUTION_INTERACTIVE_LIMIT' });
    expect(evolution.sendButton).not.toHaveBeenCalled();
    expect(evolution.sendList).not.toHaveBeenCalled();
  });
});
