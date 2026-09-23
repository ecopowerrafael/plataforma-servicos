import { describe, expect, it } from 'vitest';
import { normalizeEvolutionWebhook } from './evolution-whatsapp-inbound.js';

describe('normalizeEvolutionWebhook', () => {
  it('normalizes Evolution text messages and ignores fromMe as inbound', () => {
    expect(normalizeEvolutionWebhook({ event: 'messages.upsert', instanceId: 'evo-1', messageId: 'msg-1', from: '5511999999999', message: { text: 'Olá' } })).toMatchObject({ provider: 'EVOLUTION', instanceId: 'evo-1', externalMessageId: 'msg-1', phone: '5511999999999', text: 'Olá', eventType: 'MESSAGE_RECEIVED', fromMe: false });
    expect(normalizeEvolutionWebhook({ event: 'messages.upsert', instanceId: 'evo-1', messageId: 'msg-2', from: '5511999999999', fromMe: true, message: { text: 'eco' } })).toMatchObject({ eventType: 'MESSAGE_RECEIVED', phone: null, fromMe: true, identityResult: 'FROM_ME' });
  });

  it('preserves quick reply and list IDs without using display text', () => {
    expect(normalizeEvolutionWebhook({ event: 'messages.upsert', instanceId: 'evo-1', messageId: 'click-1', from: '5511999999999', ButtonClick: { ButtonId: 'confirmar', type: 'template_button_reply', displayText: 'Confirmar agora' } })).toMatchObject({ eventType: 'MESSAGE_ACTION', actionId: 'confirmar', selectedDisplayText: 'Confirmar agora', messageType: 'BUTTON_REPLY' });
    expect(normalizeEvolutionWebhook({ event: 'messages.upsert', instanceId: 'evo-1', messageId: 'list-1', from: '5511999999999', list_response: { selected_row_id: 'horario_1400', title: '14:00' } })).toMatchObject({ eventType: 'MESSAGE_ACTION', actionId: 'horario_1400', selectedDisplayText: '14:00', messageType: 'LIST_RESPONSE' });
  });

  it('marks unknown valid events as ignorable', () => {
    expect(normalizeEvolutionWebhook({ event: 'connection.update', instanceId: 'evo-1', status: 'open' })).toMatchObject({ provider: 'EVOLUTION', eventType: null, instanceId: 'evo-1' });
  });
});
