import { describe, expect, it } from 'vitest';

import { MetaInboundNormalizer } from './meta-whatsapp-inbound.js';

const normalizer = new MetaInboundNormalizer();

const metaPayload = (value: Record<string, unknown>) => ({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'WABA1',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '15551234567',
              phone_number_id: 'PHONE123',
            },
            ...value,
          },
        },
      ],
    },
  ],
});

describe('MetaInboundNormalizer', () => {
  it('normalizes a Meta text message into a tenant-safe WhatsApp event', () => {
    const event = normalizer.normalize(
      metaPayload({
        messages: [
          {
            from: '5511999999999',
            id: 'wamid.text',
            timestamp: '1788800000',
            type: 'text',
            text: { body: 'Oi' },
          },
        ],
      }),
    );

    expect(event).toMatchObject({
      provider: 'META',
      providerEvent: 'messages',
      eventType: 'MESSAGE_RECEIVED',
      instanceId: 'PHONE123',
      externalMessageId: 'wamid.text',
      phone: '5511999999999',
      fromMe: false,
      messageType: 'TEXT',
      text: 'Oi',
      actionId: null,
      isGroup: false,
    });
    expect(event.timestamp?.toISOString()).toBe('2026-09-07T16:53:20.000Z');
  });

  it('normalizes a Meta button reply without relying on visible text as the action id', () => {
    const event = normalizer.normalize(
      metaPayload({
        messages: [
          {
            from: '5511999999999',
            id: 'wamid.button',
            timestamp: '1788800000',
            type: 'interactive',
            interactive: {
              type: 'button_reply',
              button: {
                id: 'BOOKING_CONFIRM',
                title: 'Confirmar presença',
              },
            },
          },
        ],
      }),
    );

    expect(event).toMatchObject({
      eventType: 'MESSAGE_ACTION',
      messageType: 'BUTTON_REPLY',
      actionId: 'BOOKING_CONFIRM',
      selectedDisplayText: 'Confirmar presença',
      selectedIndex: null,
    });
  });

  it('normalizes Meta message status events to the shared lifecycle names', () => {
    const delivered = normalizer.normalize(
      metaPayload({
        statuses: [
          {
            id: 'wamid.status',
            recipient_id: '5511999999999',
            status: 'delivered',
            timestamp: '1788800000',
          },
        ],
      }),
    );

    expect(delivered).toMatchObject({
      eventType: 'MESSAGE_DELIVERED',
      externalMessageId: 'wamid.status',
      phone: '5511999999999',
      fromMe: true,
      messageType: null,
    });
  });

  it('normalizes all messages and statuses in a batched Meta webhook', () => {
    const events = normalizer.normalizeMany(
      metaPayload({
        messages: [
          { from: '5511999999999', id: 'wamid.a', timestamp: '1788800000', type: 'text', text: { body: 'A' } },
          { from: '5511888888888', id: 'wamid.b', timestamp: '1788800001', type: 'text', text: { body: 'B' } },
        ],
        statuses: [
          { id: 'wamid.c', recipient_id: '5511777777777', status: 'delivered', timestamp: '1788800002' },
          { id: 'wamid.c', recipient_id: '5511777777777', status: 'read', timestamp: '1788800003' },
        ],
      }),
    );

    expect(events.map((event) => event.eventType)).toEqual([
      'MESSAGE_RECEIVED',
      'MESSAGE_RECEIVED',
      'MESSAGE_DELIVERED',
      'MESSAGE_READ',
    ]);
    expect(new Set(events.map((event) => event.fingerprint)).size).toBe(4);
  });

  it('extracts Meta button context id as referencedMessageId', () => {
    const event = normalizer.normalize(
      metaPayload({
        messages: [
          {
            from: '5511999999999',
            id: 'wamid.reply',
            timestamp: '1788800000',
            type: 'interactive',
            context: { id: 'wamid.original' },
            interactive: {
              type: 'button_reply',
              button_reply: { id: 'BOOKING_CONFIRM', title: 'Confirmar' },
            },
          },
        ],
      }),
    );

    expect(event).toMatchObject({
      actionId: 'BOOKING_CONFIRM',
      referencedMessageId: 'wamid.original',
      selectedDisplayText: 'Confirmar',
    });
  });
});
