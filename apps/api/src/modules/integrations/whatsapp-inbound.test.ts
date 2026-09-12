import { expect, test } from 'vitest';

import { eventFingerprint, maskPhone, normalizeWApiWebhook, sanitizePayload } from './whatsapp-inbound.js';
import { advanceStatus, statusFromEvent } from './whatsapp-message-status.js';

/** Clique real capturado em produção na Etapa 1. */
const buttonClick = {
  event: 'webhookReceived',
  instanceId: '48DPS6-JI4DEP-U33SQK',
  messageId: '3EB05FAE0ECCF031863A31',
  fromMe: false,
  sender: { id: '5515997118125', senderLid: '258892474900582@lid' },
  moment: 1786741467,
  msgContent: {
    messageContextInfo: { messageSecret: 'k4l2j3h4k2j3h4k2j3h4' },
    templateButtonReplyMessage: {
      contextInfo: { stanzaID: '3EB0088280C1EE8140EC3EB8628FBD2B' },
      selectedDisplayText: 'Confirmar teste',
      selectedID: '80727',
      selectedIndex: 0,
    },
  },
};

void test('payload real do clique é normalizado pelo caminho explícito', () => {
  const event = normalizeWApiWebhook(buttonClick);
  expect(event.eventType).toBe('MESSAGE_ACTION');
  expect(event.instanceId).toBe('48DPS6-JI4DEP-U33SQK');
  expect(event.externalMessageId).toBe('3EB05FAE0ECCF031863A31');
  expect(event.referencedMessageId).toBe('3EB0088280C1EE8140EC3EB8628FBD2B');
  expect(event.selectedIndex).toBe(0);
  expect(event.phone).toBe('5515997118125');
  expect(event.messageType).toBe('BUTTON_REPLY');
  expect(event.timestamp?.toISOString()).toBe(new Date(1786741467 * 1000).toISOString());
  // O actionId é resolvido pelo índice contra a mensagem enviada, não aqui.
  expect(event.actionId).toBeNull();
});

void test('mensagem de texto vira MESSAGE_RECEIVED com o texto extraído', () => {
  const event = normalizeWApiWebhook({
    event: 'webhookReceived',
    instanceId: 'ABC',
    messageId: 'M1',
    sender: { id: '5511999999999' },
    msgContent: { conversation: 'quero agendar' },
  });
  expect(event.eventType).toBe('MESSAGE_RECEIVED');
  expect(event.text).toBe('quero agendar');
  expect(event.selectedIndex).toBeNull();
});

void test('extrai texto estendido e usa telefone real em vez do sender LID', () => {
  const event = normalizeWApiWebhook({
    event: 'webhookReceived',
    instanceId: 'ABC',
    messageId: 'M2',
    sender: {
      id: '258892474900582@lid',
      senderLid: '258892474900582@lid',
      phoneNumber: '5515997118125@s.whatsapp.net',
    },
    msgContent: { extendedTextMessage: { text: 'quero agendar' } },
  });
  expect(event.phone).toBe('5515997118125');
  expect(event.text).toBe('quero agendar');
});

void test('não trata um LID sem telefone real como destinatário', () => {
  const event = normalizeWApiWebhook({
    event: 'webhookReceived',
    instanceId: 'ABC',
    sender: { id: '258892474900582@lid', senderLid: '258892474900582@lid' },
    msgContent: { conversation: 'oi' },
  });
  expect(event.phone).toBeNull();
});

void test('entrega do provedor vira MESSAGE_SENT', () => {
  const event = normalizeWApiWebhook({
    event: 'webhookDelivery',
    instanceId: 'ABC',
    messageId: 'M1',
    fromMe: true,
  });
  expect(event.eventType).toBe('MESSAGE_SENT');
  expect(event.fromMe).toBe(true);
});

void test('status RECEIVED e READ viram entrega e leitura', () => {
  expect(
    normalizeWApiWebhook({ instanceId: 'A', messageId: 'M', status: 'RECEIVED' }).eventType,
  ).toBe('MESSAGE_DELIVERED');
  expect(
    normalizeWApiWebhook({ instanceId: 'A', messageId: 'M', status: 'READ' }).eventType,
  ).toBe('MESSAGE_READ');
});

void test('evento desconhecido não vira tipo interno', () => {
  expect(normalizeWApiWebhook({ event: 'webhookChatPresence' }).eventType).toBeNull();
});

void test('deduplicação combina tipo interno e id real do provedor', () => {
  const base = { externalMessageId: 'ABC123', payload: {} };
  expect(
    eventFingerprint({ ...base, eventType: 'MESSAGE_DELIVERED' }),
  ).toBe('MESSAGE_DELIVERED:ABC123');
  // Etapas diferentes da mesma mensagem não colidem entre si.
  expect(
    eventFingerprint({ ...base, eventType: 'MESSAGE_DELIVERED' }),
  ).not.toBe(
    eventFingerprint({ ...base, eventType: 'MESSAGE_READ' }),
  );
  // O mesmo evento repetido colide, e a unique key barra o segundo registro.
  expect(
    eventFingerprint({ ...base, eventType: 'MESSAGE_READ' }),
  ).toBe(
    eventFingerprint({ ...base, eventType: 'MESSAGE_READ' }),
  );
});

void test('status avança mas nunca regride', () => {
  expect(advanceStatus('SENT', 'DELIVERED')).toBe('DELIVERED');
  expect(advanceStatus('DELIVERED', 'READ')).toBe('READ');
  expect(advanceStatus('READ', 'SENT')).toBe('READ');
  expect(advanceStatus('READ', 'DELIVERED')).toBe('READ');
  expect(advanceStatus('READ', 'READ')).toBe('READ');
});

void test('falha só é registrada enquanto a mensagem não avançou', () => {
  expect(advanceStatus('QUEUED', 'FAILED')).toBe('FAILED');
  expect(advanceStatus('DELIVERED', 'FAILED')).toBe('DELIVERED');
  expect(advanceStatus('FAILED', 'SENT')).toBe('SENT');
});

void test('cada evento interno mapeia para o status correspondente', () => {
  expect(statusFromEvent('MESSAGE_SENT')).toBe('SENT');
  expect(statusFromEvent('MESSAGE_DELIVERED')).toBe('DELIVERED');
  expect(statusFromEvent('MESSAGE_READ')).toBe('READ');
  expect(statusFromEvent('MESSAGE_FAILED')).toBe('FAILED');
  expect(statusFromEvent('MESSAGE_ACTION')).toBeNull();
  expect(statusFromEvent('MESSAGE_RECEIVED')).toBeNull();
});

void test('segredos são removidos por chave e por formato', () => {
  const normalized = normalizeWApiWebhook(buttonClick);
  const content = (normalized.payload as { msgContent: { messageContextInfo: Record<string, unknown> } })
    .msgContent.messageContextInfo;
  expect(content.messageSecret).toBe('[protegido]');
  const result = sanitizePayload({
    accessToken: 'x',
    apiKey: 'y',
    note: 'Bearer abc.def.ghi',
    opaque: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH',
    buttonParamsJSON: '{"display_text":"Confirmar teste","id":"80727"}',
  }) as Record<string, string>;
  expect(result.accessToken).toBe('[protegido]');
  expect(result.apiKey).toBe('[protegido]');
  expect(result.note?.includes('[protegido]')).toBe(true);
  expect(result.opaque).toBe('[protegido]');
  expect(result.buttonParamsJSON?.includes('Confirmar teste')).toBe(true);
});

void test('mascara o telefone preservando início e fim', () => {
  expect(maskPhone('5515997118125')).toBe('5515••••8125');
  expect(maskPhone(null)).toBeNull();
});
