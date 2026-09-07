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
});
