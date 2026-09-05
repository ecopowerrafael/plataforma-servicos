import assert from 'node:assert/strict';
import test from 'node:test';

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
  assert.equal(event.eventType, 'MESSAGE_ACTION');
  assert.equal(event.instanceId, '48DPS6-JI4DEP-U33SQK');
  assert.equal(event.externalMessageId, '3EB05FAE0ECCF031863A31');
  assert.equal(event.referencedMessageId, '3EB0088280C1EE8140EC3EB8628FBD2B');
  assert.equal(event.selectedIndex, 0);
  assert.equal(event.phone, '5515997118125');
  assert.equal(event.messageType, 'BUTTON_REPLY');
  assert.equal(event.timestamp?.toISOString(), new Date(1786741467 * 1000).toISOString());
  // O actionId é resolvido pelo índice contra a mensagem enviada, não aqui.
  assert.equal(event.actionId, null);
});

void test('mensagem de texto vira MESSAGE_RECEIVED com o texto extraído', () => {
  const event = normalizeWApiWebhook({
    event: 'webhookReceived',
    instanceId: 'ABC',
    messageId: 'M1',
    sender: { id: '5511999999999' },
    msgContent: { conversation: 'quero agendar' },
  });
  assert.equal(event.eventType, 'MESSAGE_RECEIVED');
  assert.equal(event.text, 'quero agendar');
  assert.equal(event.selectedIndex, null);
});

void test('entrega do provedor vira MESSAGE_SENT', () => {
  const event = normalizeWApiWebhook({
    event: 'webhookDelivery',
    instanceId: 'ABC',
    messageId: 'M1',
    fromMe: true,
  });
  assert.equal(event.eventType, 'MESSAGE_SENT');
  assert.equal(event.fromMe, true);
});

void test('status RECEIVED e READ viram entrega e leitura', () => {
  assert.equal(
    normalizeWApiWebhook({ instanceId: 'A', messageId: 'M', status: 'RECEIVED' }).eventType,
    'MESSAGE_DELIVERED',
  );
  assert.equal(
    normalizeWApiWebhook({ instanceId: 'A', messageId: 'M', status: 'READ' }).eventType,
    'MESSAGE_READ',
  );
});

void test('evento desconhecido não vira tipo interno', () => {
  assert.equal(normalizeWApiWebhook({ event: 'webhookChatPresence' }).eventType, null);
});

void test('deduplicação combina tipo interno e id real do provedor', () => {
  const base = { externalMessageId: 'ABC123', payload: {} };
  assert.equal(
    eventFingerprint({ ...base, eventType: 'MESSAGE_DELIVERED' }),
    'MESSAGE_DELIVERED:ABC123',
  );
  // Etapas diferentes da mesma mensagem não colidem entre si.
  assert.notEqual(
    eventFingerprint({ ...base, eventType: 'MESSAGE_DELIVERED' }),
    eventFingerprint({ ...base, eventType: 'MESSAGE_READ' }),
  );
  // O mesmo evento repetido colide, e a unique key barra o segundo registro.
  assert.equal(
    eventFingerprint({ ...base, eventType: 'MESSAGE_READ' }),
    eventFingerprint({ ...base, eventType: 'MESSAGE_READ' }),
  );
});

void test('status avança mas nunca regride', () => {
  assert.equal(advanceStatus('SENT', 'DELIVERED'), 'DELIVERED');
  assert.equal(advanceStatus('DELIVERED', 'READ'), 'READ');
  assert.equal(advanceStatus('READ', 'SENT'), 'READ');
  assert.equal(advanceStatus('READ', 'DELIVERED'), 'READ');
  assert.equal(advanceStatus('READ', 'READ'), 'READ');
});

void test('falha só é registrada enquanto a mensagem não avançou', () => {
  assert.equal(advanceStatus('QUEUED', 'FAILED'), 'FAILED');
  assert.equal(advanceStatus('DELIVERED', 'FAILED'), 'DELIVERED');
  assert.equal(advanceStatus('FAILED', 'SENT'), 'SENT');
});

void test('cada evento interno mapeia para o status correspondente', () => {
  assert.equal(statusFromEvent('MESSAGE_SENT'), 'SENT');
  assert.equal(statusFromEvent('MESSAGE_DELIVERED'), 'DELIVERED');
  assert.equal(statusFromEvent('MESSAGE_READ'), 'READ');
  assert.equal(statusFromEvent('MESSAGE_FAILED'), 'FAILED');
  assert.equal(statusFromEvent('MESSAGE_ACTION'), null);
  assert.equal(statusFromEvent('MESSAGE_RECEIVED'), null);
});

void test('segredos são removidos por chave e por formato', () => {
  const normalized = normalizeWApiWebhook(buttonClick);
  const content = (normalized.payload as { msgContent: { messageContextInfo: Record<string, unknown> } })
    .msgContent.messageContextInfo;
  assert.equal(content.messageSecret, '[protegido]');
  const result = sanitizePayload({
    accessToken: 'x',
    apiKey: 'y',
    note: 'Bearer abc.def.ghi',
    opaque: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH',
    buttonParamsJSON: '{"display_text":"Confirmar teste","id":"80727"}',
  }) as Record<string, string>;
  assert.equal(result.accessToken, '[protegido]');
  assert.equal(result.apiKey, '[protegido]');
  assert.equal(result.note?.includes('[protegido]'), true);
  assert.equal(result.opaque, '[protegido]');
  assert.equal(result.buttonParamsJSON?.includes('Confirmar teste'), true);
});

void test('mascara o telefone preservando início e fim', () => {
  assert.equal(maskPhone('5515997118125'), '5515••••8125');
  assert.equal(maskPhone(null), null);
});
