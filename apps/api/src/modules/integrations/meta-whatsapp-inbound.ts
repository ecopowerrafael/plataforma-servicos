import { createHash } from 'node:crypto';

import { type NormalizedWhatsAppEvent, sanitizePayload } from './whatsapp-inbound.js';
import { type WhatsAppInboundNormalizer } from './whatsapp-provider.js';
import { META_WHATSAPP_CAPABILITIES } from './meta-whatsapp-connection.js';

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const records = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.map(record).filter((item) => Object.keys(item).length > 0) : [];

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);

const fingerprint = (parts: Array<string | null>) =>
  createHash('sha256').update(parts.map((part) => part ?? '').join('|')).digest('hex');

export class MetaInboundNormalizer implements WhatsAppInboundNormalizer {
  public readonly provider = 'META' as const;
  public readonly capabilities = META_WHATSAPP_CAPABILITIES;

  public normalize(raw: unknown): NormalizedWhatsAppEvent {
    return this.normalizeMany(raw)[0] ?? this.empty(raw);
  }

  public normalizeMany(raw: unknown): NormalizedWhatsAppEvent[] {
    const root = record(raw);
    const events: NormalizedWhatsAppEvent[] = [];
    for (const entry of records(root.entry)) {
      for (const change of records(entry.changes)) {
        const value = record(change.value);
        const metadata = record(value.metadata);
        for (const message of records(value.messages)) events.push(this.messageEvent(raw, change, metadata, message));
        for (const status of records(value.statuses)) events.push(this.statusEvent(raw, change, metadata, status));
      }
    }
    return events.length === 0 ? [this.empty(raw)] : events;
  }

  private messageEvent(
    raw: unknown,
    change: Record<string, unknown>,
    metadata: Record<string, unknown>,
    message: Record<string, unknown>,
  ): NormalizedWhatsAppEvent {
    const interactive = record(message.interactive);
    const button = record(interactive.button_reply ?? interactive.button);
    const context = record(message.context);
    const textMessage = record(message.text);
    const selectedId = text(button.id);
    const selectedDisplayText = text(button.title);
    const externalMessageId = text(message.id);
    const instanceId = text(metadata.phone_number_id);
    const phone = text(message.from);
    const providerEvent = text(change.field) ?? 'messages';
    const timestampSeconds = Number(text(message.timestamp));
    return {
      provider: 'META',
      providerEvent,
      eventType: selectedId !== null ? 'MESSAGE_ACTION' : 'MESSAGE_RECEIVED',
      instanceId,
      externalMessageId,
      referencedMessageId: text(context.id),
      phone,
      fromMe: false,
      messageType: selectedId !== null ? 'BUTTON_REPLY' : message.type === 'text' ? 'TEXT' : text(message.type),
      text: text(textMessage.body),
      actionId: selectedId,
      selectedIndex: null,
      selectedDisplayText,
      timestamp: Number.isFinite(timestampSeconds) ? new Date(timestampSeconds * 1000) : null,
      fingerprint: fingerprint(['MESSAGE', instanceId, externalMessageId, phone, selectedId]),
      isGroup: false,
      payload: sanitizePayload(raw),
    };
  }

  private statusEvent(
    raw: unknown,
    change: Record<string, unknown>,
    metadata: Record<string, unknown>,
    status: Record<string, unknown>,
  ): NormalizedWhatsAppEvent {
    const phone = text(status.recipient_id);
    const externalMessageId = text(status.id);
    const instanceId = text(metadata.phone_number_id);
    const providerEvent = text(change.field) ?? 'messages';
    const statusValue = text(status.status);
    const eventType =
      statusValue === 'sent'
        ? 'MESSAGE_SENT'
        : statusValue === 'delivered'
          ? 'MESSAGE_DELIVERED'
          : statusValue === 'read'
            ? 'MESSAGE_READ'
            : statusValue === 'failed'
              ? 'MESSAGE_FAILED'
              : null;
    const timestampSeconds = Number(text(status.timestamp));

    return {
      provider: 'META',
      providerEvent,
      eventType,
      instanceId,
      externalMessageId,
      referencedMessageId: null,
      phone,
      fromMe: true,
      messageType: null,
      text: null,
      actionId: null,
      selectedIndex: null,
      selectedDisplayText: null,
      timestamp: Number.isFinite(timestampSeconds) ? new Date(timestampSeconds * 1000) : null,
      fingerprint: fingerprint(['STATUS', eventType, instanceId, externalMessageId, phone, statusValue]),
      isGroup: false,
      payload: sanitizePayload(raw),
    };
  }

  private empty(raw: unknown): NormalizedWhatsAppEvent {
    return {
      provider: 'META',
      providerEvent: null,
      eventType: null,
      instanceId: null,
      externalMessageId: null,
      referencedMessageId: null,
      phone: null,
      fromMe: false,
      messageType: null,
      text: null,
      actionId: null,
      selectedIndex: null,
      selectedDisplayText: null,
      timestamp: null,
      fingerprint: fingerprint(['EMPTY', JSON.stringify(sanitizePayload(raw))]),
      isGroup: false,
      payload: sanitizePayload(raw),
    };
  }
}
