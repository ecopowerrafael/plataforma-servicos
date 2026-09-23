import { createHash } from 'node:crypto';

import { type NormalizedWhatsAppEvent, sanitizePayload } from './whatsapp-inbound.js';
import { type WhatsAppInboundNormalizer, EVOLUTION_WHATSAPP_CAPABILITIES } from './whatsapp-provider.js';

const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string | null => typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
const firstText = (...values: unknown[]) => values.map(text).find((value): value is string => value !== null) ?? null;
const whatsappPhone = (value: string | null): string | null => {
  if (value === null || value.endsWith('@lid')) return null;
  const withoutDevice = value.replace(/:\d+(?=@(?:s\.whatsapp\.net|c\.us)$)/u, '');
  const digits = withoutDevice.replace(/@(s\.whatsapp\.net|c\.us)$/u, '').replace(/\D/gu, '');
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
};
const firstPhone = (...values: unknown[]) => values.map(text).map(whatsappPhone).find((value): value is string => value !== null) ?? null;

const fingerprint = (eventType: string | null, externalMessageId: string | null, payload: unknown) => externalMessageId === null
  ? `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`
  : `${eventType ?? 'EVENT'}:${externalMessageId}`.slice(0, 191);

export function normalizeEvolutionWebhook(raw: unknown): NormalizedWhatsAppEvent {
  const payload = sanitizePayload(raw);
  const root = record(payload);
  const data = record(root.data);
  const dataChat = record(data.chat ?? data.Chat);
  const dataExtra = record(data.extraData ?? data.extra_data);
  const message = record(root.message ?? root.Message ?? data.message ?? data.Message);
  const content = record(message.extendedTextMessage ?? message.ExtendedTextMessage ?? message.imageMessage ?? message.ImageMessage ?? message.videoMessage ?? message.VideoMessage);
  const info = record(root.info ?? root.Info ?? data.info ?? data.Info);
  const key = record(root.key ?? root.Key ?? message.key ?? message.Key ?? data.key ?? data.Key ?? info);
  const button = record(root.ButtonClick ?? data.ButtonClick ?? message.ButtonClick ?? (
    data.buttonId !== undefined || data.buttonText !== undefined ? {
      buttonId: data.buttonId,
      displayText: data.buttonText,
      type: data.type,
      contextInfo: data.contextInfo ?? data.context_info,
    } : undefined
  ));
  const list = record(root.list_response ?? data.list_response ?? message.list_response ?? (
    data.selected_row_id !== undefined || data.selectedRowId !== undefined || data.rowId !== undefined ? {
      selected_row_id: data.selected_row_id ?? data.selectedRowId ?? data.rowId,
      title: data.title ?? data.rowTitle,
      contextInfo: data.contextInfo ?? data.context_info,
    } : undefined
  ));
  const buttonContext = record(button.contextInfo ?? button.context_info);
  const listContext = record(list.contextInfo ?? list.context_info);
  const messageContext = record(message.contextInfo ?? message.context_info);
  const instance = record(root.instance ?? data.instance);
  const sender = record(root.sender ?? data.sender ?? message.sender);
  const eventName = firstText(root.event, root.eventType, root.type, data.event, data.eventType);
  const fromMe = root.fromMe === true || root.IsFromMe === true || data.fromMe === true || data.IsFromMe === true || info.fromMe === true || info.IsFromMe === true || key.fromMe === true || key.FromMe === true;
  const externalMessageId = firstText(root.messageId, root.id, data.messageId, data.id, info.id, info.ID, info.Id, key.id, key.ID, message.id, message.ID);
  const instanceId = firstText(root.instanceId, root.instanceId as unknown, data.instanceId, instance.instanceId, instance.id, root.instanceName, data.instanceName);
  const phone = firstPhone(
    root.from,
    root.phone,
    root.remoteJid,
    data.from,
    data.phone,
    data.jid,
    data.remoteJid,
    data.chat,
    data.Chat,
    data.sender,
    data.Sender,
    dataChat.id,
    dataChat.jid,
    dataChat.phone,
    dataExtra.phone,
    dataExtra.jid,
    info.sender,
    info.Sender,
    info.chat,
    info.Chat,
    info.jid,
    info.JID,
    sender.phone,
    sender.id,
    message.from,
    message.From,
  );
  const selectedId = firstText(button.buttonId, button.ButtonId, button.id, list.selected_row_id, list.selectedRowId, root.selected_row_id);
  const selectedDisplayText = firstText(button.displayText, button.title, button.text, list.title, list.selected_row_title, list.selectedRowTitle);
  const body = firstText(root.text, root.body, root.conversation, data.text, data.body, message.text, message.Text, message.body, message.Body, message.conversation, message.Conversation, content.text, content.Text, content.caption, content.Caption);
  const isAction = selectedId !== null || Object.keys(button).length > 0 || Object.keys(list).length > 0;
  const eventType = firstText(eventName, button.type, list.type)?.toLowerCase().includes('status') ? null : isAction ? 'MESSAGE_ACTION' : body !== null ? 'MESSAGE_RECEIVED' : null;
  const timestampValue = Number(firstText(root.timestamp, root.moment, data.timestamp, message.timestamp));
  const timestamp = Number.isFinite(timestampValue) ? new Date(timestampValue > 10_000_000_000 ? timestampValue : timestampValue * 1000) : null;
  const normalizedPhone = phone;
  return {
    provider: 'EVOLUTION',
    providerEvent: eventName,
    eventType,
    instanceId,
    externalMessageId,
    phone: fromMe ? null : normalizedPhone,
    remoteLid: null,
    senderIdKind: normalizedPhone === null ? 'UNKNOWN' : 'PHONE',
    chatIdKind: 'UNKNOWN',
    hasSenderLid: false,
    resolutionMethod: normalizedPhone === null ? 'NONE' : 'SENDER_ID',
    identityResult: fromMe ? 'FROM_ME' : normalizedPhone === null ? 'RESOLVED' : 'RESOLVED',
    senderName: firstText(root.senderName, sender.pushName, sender.name),
    messageType: isAction ? (list.selected_row_id !== undefined ? 'LIST_RESPONSE' : 'BUTTON_REPLY') : body !== null ? 'TEXT' : null,
    text: body,
    actionId: selectedId,
    referencedMessageId: firstText(
      root.referencedMessageId,
      root.stanzaId,
      root.stanzaID,
      data.referencedMessageId,
      data.stanzaId,
      data.stanzaID,
      data.messageId,
      button.referencedMessageId,
      button.stanzaId,
      button.stanzaID,
      buttonContext.stanzaId,
      buttonContext.stanzaID,
      list.referencedMessageId,
      list.stanzaId,
      list.stanzaID,
      listContext.stanzaId,
      listContext.stanzaID,
      messageContext.stanzaId,
      messageContext.stanzaID,
      key.id,
    ),
    selectedIndex: null,
    selectedDisplayText,
    timestamp,
    fromMe,
    isGroup: false,
    fingerprint: fingerprint(eventType, externalMessageId, payload),
    payload,
  };
}

export class EvolutionInboundNormalizer implements WhatsAppInboundNormalizer {
  public readonly provider = 'EVOLUTION' as const;
  public readonly capabilities = EVOLUTION_WHATSAPP_CAPABILITIES;
  public normalize(raw: unknown) { return normalizeEvolutionWebhook(raw); }
  public normalizeMany(raw: unknown) { return [this.normalize(raw)]; }
}
