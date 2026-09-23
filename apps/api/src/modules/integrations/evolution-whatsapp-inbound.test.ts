import { describe, expect, it } from 'vitest';
import { normalizeEvolutionWebhook } from './evolution-whatsapp-inbound.js';

describe('normalizeEvolutionWebhook', () => {
  it('normalizes Evolution text messages and ignores fromMe as inbound', () => {
    expect(normalizeEvolutionWebhook({ event: 'messages.upsert', instanceId: 'evo-1', messageId: 'msg-1', from: '5511999999999', message: { text: 'Olá' } })).toMatchObject({ provider: 'EVOLUTION', instanceId: 'evo-1', externalMessageId: 'msg-1', phone: '5511999999999', text: 'Olá', eventType: 'MESSAGE_RECEIVED', fromMe: false });
  expect(normalizeEvolutionWebhook({ event: 'messages.upsert', instanceId: 'evo-1', messageId: 'msg-2', from: '5511999999999', fromMe: true, message: { text: 'eco' } })).toMatchObject({ eventType: 'MESSAGE_RECEIVED', phone: null, fromMe: true, identityResult: 'FROM_ME' });
});

  it('normalizes Evolution Go 0.7.2 uppercase data.Message and data.Info payload', () => {
  expect(normalizeEvolutionWebhook({
    event: 'Message',
    instanceId: 'evo-1',
    data: {
      Info: { ID: 'msg-3', Sender: '5511999999999@s.whatsapp.net', IsFromMe: false },
      Message: { Conversation: 'Olá' },
    },
  })).toMatchObject({ provider: 'EVOLUTION', instanceId: 'evo-1', externalMessageId: 'msg-3', phone: '5511999999999', text: 'Olá', eventType: 'MESSAGE_RECEIVED', fromMe: false });
  });

  it('preserves quick reply and list IDs without using display text', () => {
    expect(normalizeEvolutionWebhook({ event: 'messages.upsert', instanceId: 'evo-1', messageId: 'click-1', from: '5511999999999', ButtonClick: { ButtonId: 'confirmar', type: 'template_button_reply', displayText: 'Confirmar agora' } })).toMatchObject({ eventType: 'MESSAGE_ACTION', actionId: 'confirmar', selectedDisplayText: 'Confirmar agora', messageType: 'BUTTON_REPLY' });
    expect(normalizeEvolutionWebhook({ event: 'messages.upsert', instanceId: 'evo-1', messageId: 'list-1', from: '5511999999999', list_response: { selected_row_id: 'horario_1400', title: '14:00' } })).toMatchObject({ eventType: 'MESSAGE_ACTION', actionId: 'horario_1400', selectedDisplayText: '14:00', messageType: 'LIST_RESPONSE' });
  });

  it('extracts the referenced outbound message from interactive contextInfo', () => {
    expect(normalizeEvolutionWebhook({
      event: 'messages.upsert',
      instanceId: 'evo-1',
      messageId: 'click-2',
      from: '5511999999999',
      list_response: {
        selected_row_id: 'service_123',
        title: 'Corte',
        contextInfo: { stanzaID: 'outbound-1' },
      },
    })).toMatchObject({
      eventType: 'MESSAGE_ACTION',
      actionId: 'service_123',
      referencedMessageId: 'outbound-1',
    });
  });

  it('normalizes the real Evolution ButtonClick envelope under data', () => {
    expect(normalizeEvolutionWebhook({
      event: 'ButtonClick',
      instanceId: 'evo-1',
      data: {
        buttonId: 'MAIN_MENU_BOOK',
        buttonText: 'Agendar horário',
        messageId: 'outbound-2',
        phone: '5511999999999',
        fromMe: false,
        type: 'template_button_reply',
      },
    })).toMatchObject({
      eventType: 'MESSAGE_ACTION',
      actionId: 'MAIN_MENU_BOOK',
      selectedDisplayText: 'Agendar horário',
      referencedMessageId: 'outbound-2',
      messageType: 'BUTTON_REPLY',
    });
  });

  it('resolves the sender phone from the real interactive jid/chat fields', () => {
    expect(normalizeEvolutionWebhook({
      event: 'ButtonClick',
      instanceId: 'evo-1',
      data: {
        buttonId: 'MAIN_MENU_BOOK',
        buttonText: 'Agendar horário',
        messageId: 'outbound-4',
        jid: '5511999999999@s.whatsapp.net',
        fromMe: false,
        type: 'template_button_reply',
      },
    })).toMatchObject({
      eventType: 'MESSAGE_ACTION',
      actionId: 'MAIN_MENU_BOOK',
      phone: '5511999999999',
    });
  });

  it('resolves a string sender/chat JID from the Evolution envelope', () => {
    expect(normalizeEvolutionWebhook({
      event: 'ButtonClick',
      instanceId: 'evo-1',
      data: {
        buttonId: 'MAIN_MENU_BOOK',
        buttonText: 'Agendar horário',
        messageId: 'outbound-5',
        Sender: '5511999999999@s.whatsapp.net',
        Chat: '5511999999999@s.whatsapp.net',
        fromMe: false,
        type: 'template_button_reply',
      },
    })).toMatchObject({ phone: '5511999999999' });
  });

  it('skips a LID candidate and uses the next valid phone candidate', () => {
    expect(normalizeEvolutionWebhook({
      event: 'ButtonClick',
      instanceId: 'evo-1',
      data: {
        buttonId: 'MAIN_MENU_BOOK',
        buttonText: 'Agendar horário',
        messageId: 'outbound-6',
        phone: '123456789012345678@lid',
        jid: '5511999999999@s.whatsapp.net',
        fromMe: false,
        type: 'template_button_reply',
      },
    })).toMatchObject({ phone: '5511999999999' });
  });

  it('normalizes a WhatsApp device JID before validating the phone', () => {
    expect(normalizeEvolutionWebhook({
      event: 'ButtonClick',
      instanceId: 'evo-1',
      data: {
        buttonId: 'MAIN_MENU_BOOK',
        buttonText: 'Agendar horário',
        messageId: 'outbound-7',
        jid: '5515996741538:52@s.whatsapp.net',
        fromMe: false,
        type: 'template_button_reply',
      },
    })).toMatchObject({ phone: '5515996741538' });
  });

  it('normalizes a list response envelope under data', () => {
    expect(normalizeEvolutionWebhook({
      event: 'ListResponse',
      instanceId: 'evo-1',
      data: {
        selectedRowId: 'service_123',
        rowTitle: 'Corte',
        messageId: 'outbound-3',
        phone: '5511999999999',
        fromMe: false,
        type: 'list_response',
      },
    })).toMatchObject({
      eventType: 'MESSAGE_ACTION',
      actionId: 'service_123',
      selectedDisplayText: 'Corte',
      referencedMessageId: 'outbound-3',
      messageType: 'LIST_RESPONSE',
    });
  });

  it('marks unknown valid events as ignorable', () => {
    expect(normalizeEvolutionWebhook({ event: 'connection.update', instanceId: 'evo-1', status: 'open' })).toMatchObject({ provider: 'EVOLUTION', eventType: null, instanceId: 'evo-1' });
  });
});
