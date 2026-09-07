import { createHash } from 'node:crypto';

import { type NormalizedWhatsAppEvent, sanitizePayload } from './whatsapp-inbound.js';
import { type WhatsAppInboundNormalizer } from './whatsapp-provider.js';
import { META_WHATSAPP_CAPABILITIES } from './meta-whatsapp-connection.js';

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);

const firstRecord = (value: unknown): Record<string, unknown> => {
  if (!Array.isArray(value)) return {};
  return record(value[0]);
};

const fingerprint = (parts: Array<string | null>) =>
  createHash('sha256').update(parts.map((part) => part ?? '').join('|')).digest('hex');

export class MetaInboundNormalizer implements WhatsAppInboundNormalizer {
  public readonly provider = 'META' as const;
  public readonly capabilities = META_WHATSAPP_CAPABILITIES;

  public normalize(raw: unknown): NormalizedWhatsAppEvent {
    const root = record(raw);
    const entry = firstRecord(root.entry);
    const change = firstRecord(entry.changes);
    const value = record(change.value);
    const metadata = record(value.metadata);
    const status = firstRecord(value.statuses);
    const message = firstRecord(value.messages);
    const interactive = record(message.interactive);
    const button = record(interactive.button);
    const textMessage = record(message.text);
    const phone = text(message.from ?? status.recipient_id);
    const externalMessageId = text(message.id ?? status.id);
    const instanceId = text(metadata.phone_number_id);
    const providerEvent = text(change.field) ?? 'messages';
    const selectedId = text(button.id);
    const selectedDisplayText = text(button.title);
    const statusValue = text(status.status);
    const eventType =
      selectedId !== null
        ? 'MESSAGE_ACTION'
        : message.id !== undefined
          ? 'MESSAGE_RECEIVED'
          : statusValue === 'sent'
            ? 'MESSAGE_SENT'
            : statusValue === 'delivered'
              ? 'MESSAGE_DELIVERED'
              : statusValue === 'read'
                ? 'MESSAGE_READ'
                : statusValue === 'failed'
                  ? 'MESSAGE_FAILED'
                  : null;
    const timestampSeconds = Number(text(message.timestamp ?? status.timestamp));
    const timestamp = Number.isFinite(timestampSeconds) ? new Date(timestampSeconds * 1000) : null;

    return {
      provider: 'META',
      providerEvent,
      eventType,
      instanceId,
      externalMessageId,
      referencedMessageId: null,
      phone,
      fromMe: message.id === undefined,
      messageType: selectedId !== null ? 'BUTTON_REPLY' : message.type === 'text' ? 'TEXT' : text(message.type),
      text: text(textMessage.body),
      actionId: selectedId,
      selectedIndex: null,
      selectedDisplayText,
      timestamp,
      fingerprint: fingerprint([eventType, instanceId, externalMessageId, phone, selectedId, statusValue]),
      isGroup: false,
      payload: sanitizePayload(raw),
    };
  }
}
