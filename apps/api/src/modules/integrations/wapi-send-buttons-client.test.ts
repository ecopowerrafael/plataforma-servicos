import { describe, expect, it } from 'vitest';
import { WapiSendButtonsClient } from './wapi-send-buttons-client.js';

describe('WapiSendButtonsClient externalMessageId', () => {
  it.each([
    ['messageId', { messageId: 'top-message' }, 'top-message'],
    ['id', { id: 'top-id' }, 'top-id'],
    ['data.messageId', { data: { messageId: 'nested-message' } }, 'nested-message'],
    ['data.id', { data: { id: 'nested-id' } }, 'nested-id'],
  ])('lê %s', async (_source, payload, expected) => {
    const fetcher = async () => new Response(JSON.stringify(payload), { status: 200 });
    const result = await new WapiSendButtonsClient(fetcher as typeof fetch).send({
      instanceId: 'instance', token: 'token', phone: '5511999999999', message: 'Escolha', buttons: [{ label: 'Sim' }],
    });
    expect(result.externalMessageId).toBe(expected);
  });

  it('retorna null quando a resposta não possui ID', async () => {
    const fetcher = async () => new Response(JSON.stringify({ ok: true }), { status: 200 });
    const result = await new WapiSendButtonsClient(fetcher as typeof fetch).send({
      instanceId: 'instance', token: 'token', phone: '5511999999999', message: 'Escolha', buttons: [{ label: 'Sim' }],
    });
    expect(result.externalMessageId).toBeNull();
  });
});
