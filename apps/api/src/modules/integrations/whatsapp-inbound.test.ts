import assert from 'node:assert/strict';
import test from 'node:test';

import {
  eventFingerprint,
  findKnownActionId,
  maskPhone,
  normalizeWhatsAppEvent,
  sanitizePayload,
} from './whatsapp-inbound.js';

const TEST_IDS = ['TEST_CONFIRM', 'TEST_CANCEL'] as const;

void test('sanitiza credenciais por nome de chave em qualquer profundidade', () => {
  const result = sanitizePayload({
    event: 'message.received',
    headers: { Authorization: 'Bearer abc123', 'x-token': 'segredo' },
    nested: { deep: { apiKey: 'k', password: 'p', senha: 's' } },
  }) as { event: string; headers: Record<string, unknown>; nested: Record<string, unknown> };
  assert.equal(result.headers.Authorization, '[protegido]');
  assert.equal(result.headers['x-token'], '[protegido]');
  const deep = result.nested.deep as Record<string, unknown>;
  assert.equal(deep.apiKey, '[protegido]');
  assert.equal(deep.password, '[protegido]');
  assert.equal(deep.senha, '[protegido]');
  assert.equal(result.event, 'message.received');
});

void test('sanitiza segredos pelo formato do valor, mesmo em chave inocente', () => {
  const result = sanitizePayload({
    note: 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature',
    other: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH',
    short: 'ok',
  }) as { note: string; other: string; short: string };
  assert.equal(result.note.includes('[protegido]'), true);
  assert.equal(result.note.includes('eyJhbGciOiJIUzI1NiJ9'), false);
  assert.equal(result.other, '[protegido]');
  assert.equal(result.short, 'ok');
});

void test('normaliza os campos documentados do webhook', () => {
  const normalized = normalizeWhatsAppEvent({
    event: 'message.received',
    instanceId: 'T34398-VYR3QD-MS29SL',
    data: {
      messageId: 'ABC123XYZ',
      phone: '5511999999999',
      type: 'text',
      message: { conversation: 'oi' },
    },
  });
  assert.equal(normalized.instanceId, 'T34398-VYR3QD-MS29SL');
  assert.equal(normalized.eventType, 'message.received');
  assert.equal(normalized.externalMessageId, 'ABC123XYZ');
  assert.equal(normalized.phone, '5511999999999');
  assert.equal(normalized.messageType, 'text');
  assert.equal(normalized.action, null);
});

void test('descobre o actionId pelo valor, sem depender do nome do campo', () => {
  const match = findKnownActionId(
    { data: { message: { qualquerCampoDesconhecido: { selectedId: 'TEST_CONFIRM' } } } },
    TEST_IDS,
  );
  assert.ok(match !== null);
  assert.equal(match.actionId, 'TEST_CONFIRM');
  assert.equal(match.path, 'data.message.qualquerCampoDesconhecido.selectedId');
});

void test('não confunde o texto visível do botão com o actionId', () => {
  const match = findKnownActionId(
    { data: { message: { conversation: 'Confirmar teste' } } },
    TEST_IDS,
  );
  assert.equal(match, null);
});

void test('deduplica pelo id real do provedor quando ele existe', () => {
  const first = eventFingerprint({
    eventType: 'message.received',
    externalMessageId: 'ABC123',
    payload: { a: 1 },
  });
  const second = eventFingerprint({
    eventType: 'message.received',
    externalMessageId: 'ABC123',
    payload: { a: 2 },
  });
  assert.equal(first, second);
  assert.equal(first, 'message.received:ABC123');
});

void test('sem id do provedor, deduplica pelo hash do payload sanitizado', () => {
  const base = { eventType: 'message.received', externalMessageId: null };
  const same = eventFingerprint({ ...base, payload: { a: 1 } });
  const repeated = eventFingerprint({ ...base, payload: { a: 1 } });
  const different = eventFingerprint({ ...base, payload: { a: 2 } });
  assert.equal(same, repeated);
  assert.notEqual(same, different);
  assert.equal(same.startsWith('sha256:'), true);
});

void test('mascara o telefone preservando início e fim', () => {
  assert.equal(maskPhone('5511999998888'), '5511••••8888');
  assert.equal(maskPhone(null), null);
  assert.equal(maskPhone('123'), '••••');
});
