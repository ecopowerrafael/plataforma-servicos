import { createHash } from 'node:crypto';

import { type NormalizedWhatsAppEvent, sanitizePayload } from './whatsapp-inbound.js';
import { type WhatsAppInboundNormalizer, EVOLUTION_WHATSAPP_CAPABILITIES } from './whatsapp-provider.js';

const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string | null => typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
const jsonRecord = (value: unknown): Record<string, unknown> => {
  const raw = text(value);
  if (raw === null) return {};
  try {
    return record(JSON.parse(raw));
  } catch {
    return {};
  }
};
const firstText = (...values: unknown[]) => values.map(text).find((value): value is string => value !== null) ?? null;
const whatsappPhone = (value: string | null): string | null => {
  if (value === null || value.endsWith('@lid')) return null;
  const withoutDevice = value.replace(/:\d+(?=@(?:s\.whatsapp\.net|c\.us)$)/u, '');
  const digits = withoutDevice.replace(/@(s\.whatsapp\.net|c\.us)$/u, '').replace(/\D/gu, '');
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
};
const evolutionIdentityKeys = [
  'User', 'user', 'ID', 'Id', 'id', 'JID', 'jid', 'number', 'Number', 'phone', 'Phone',
  'Raw', 'raw', 'String', 'string', 'Value', 'value', 'Address', 'address', 'RemoteJid', 'remoteJid',
];
const evolutionPhoneCandidates = (value: unknown, depth = 0): string[] => {
  if (depth > 8 || value === null || value === undefined) return [];
  if (typeof value === 'string') return [value];
  if (typeof value === 'number' && Number.isSafeInteger(value)) return [String(value)];
  if (Array.isArray(value)) return value.flatMap((item) => evolutionPhoneCandidates(item, depth + 1));
  if (typeof value !== 'object') return [];
  const objectValue = value as Record<string, unknown>;
  const namedCandidates = evolutionIdentityKeys.flatMap((key) => evolutionPhoneCandidates(objectValue[key], depth + 1));
  // Evolution Go may serialize a JID as a struct whose field names vary by
  // JSON encoder. These values originate only from phone/jid/chat identity
  // fields, so inspect their bounded nested values without logging them.
  return [...namedCandidates, ...Object.values(objectValue).flatMap((item) => evolutionPhoneCandidates(item, depth + 1))];
};
const firstPhone = (...values: unknown[]) => values
  .flatMap((value) => evolutionPhoneCandidates(value))
  .map(text)
  .map(whatsappPhone)
  .find((value): value is string => value !== null) ?? null;

const fingerprint = (eventType: string | null, externalMessageId: string | null, payload: unknown) => externalMessageId === null
  ? `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`
  : `${eventType ?? 'EVENT'}:${externalMessageId}`.slice(0, 191);

const mediaFieldNames = ['PTT', 'URL', 'accessibilityLabel', 'backgroundArgb', 'contextInfo', 'directPath', 'fileEncSHA256', 'fileLength', 'fileSHA256', 'mediaKey', 'mediaKeyTimestamp', 'mimetype', 'seconds', 'streamingSidecar', 'viewOnce', 'waveform'] as const;
const rawMediaDescriptor = (raw: unknown): Record<string, unknown> | undefined => {
  const root = record(raw);
  const data = record(root.data);
  const message = record(root.message ?? root.Message ?? data.message ?? data.Message);
  const audio = record(message.audioMessage ?? message.AudioMessage ?? data.audioMessage ?? data.AudioMessage);
  if (Object.keys(audio).length === 0) return undefined;
  const descriptor = Object.fromEntries(mediaFieldNames.filter((key) => audio[key] !== undefined).map((key) => [key, audio[key]]));
  return Object.keys(descriptor).length === 0 ? undefined : { audioMessage: descriptor };
};

export function normalizeEvolutionWebhook(raw: unknown): NormalizedWhatsAppEvent {
  const payload = sanitizePayload(raw);
  const root = record(payload);
  const data = record(root.data);
  const dataPhone = record(data.phone ?? data.Phone);
  const dataJid = record(data.jid ?? data.JID);
  const dataChat = record(data.chat ?? data.Chat);
  const dataExtra = record(data.extraData ?? data.extra_data);
  const message = record(root.message ?? root.Message ?? data.message ?? data.Message);
  const audio = record(message.audioMessage ?? message.AudioMessage ?? data.audioMessage ?? data.AudioMessage);
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
  const nativeFlowParams = jsonRecord(dataExtra.paramsJSON ?? dataExtra.paramsJson);
  const isListResponse = list.selected_row_id !== undefined
    || list.selectedRowId !== undefined
    || text(button.type)?.toLowerCase() === 'list_response'
    || nativeFlowParams.selected_row_id !== undefined
    || nativeFlowParams.selectedRowId !== undefined;
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
    data.Phone,
    dataPhone.id,
    dataPhone.jid,
    dataPhone.JID,
    dataPhone.number,
    dataPhone.phone,
    data.jid,
    data.JID,
    dataJid.id,
    dataJid.jid,
    dataJid.JID,
    dataJid.number,
    dataJid.phone,
    data.remoteJid,
    data.RemoteJid,
    data.chat,
    data.Chat,
    data.sender,
    data.Sender,
    dataChat.id,
    dataChat.jid,
    dataChat.JID,
    dataChat.phone,
    dataChat.Phone,
    dataChat.number,
    dataChat.Number,
    dataExtra.phone,
    dataExtra.jid,
    info.sender,
    info.Sender,
    info.chat,
    info.Chat,
    info.SenderAlt,
    info.senderAlt,
    info.Recipient,
    info.recipient,
    info.MessageSource,
    info.messageSource,
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
  const isAudio = Object.keys(audio).length > 0 || firstText(root.messageType, data.messageType, root.type, data.type)?.toLowerCase().includes('audio') === true;
  const isAction = selectedId !== null || Object.keys(button).length > 0 || Object.keys(list).length > 0;
  const eventType = firstText(eventName, button.type, list.type)?.toLowerCase().includes('status') ? null : isAction ? 'MESSAGE_ACTION' : (body !== null || isAudio) ? 'MESSAGE_RECEIVED' : null;
  const timestampValue = Number(firstText(root.timestamp, root.moment, data.timestamp, message.timestamp));
  const timestamp = Number.isFinite(timestampValue) ? new Date(timestampValue > 10_000_000_000 ? timestampValue : timestampValue * 1000) : null;
  const normalizedPhone = phone;
  const mediaDownloadDescriptor = rawMediaDescriptor(raw);
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
    identityResult: fromMe ? 'FROM_ME' : normalizedPhone === null ? 'LID_UNRESOLVED' : 'RESOLVED',
    senderName: firstText(root.senderName, sender.pushName, sender.name),
    messageType: isAction ? (isListResponse ? 'LIST_RESPONSE' : 'BUTTON_REPLY') : isAudio ? 'AUDIO' : body !== null ? 'TEXT' : null,
    text: body,
    media: isAudio ? {
      kind: 'AUDIO',
      mimeType: firstText(audio.mimetype, audio.mimeType, audio.Mimetype),
      durationSeconds: Number.isFinite(Number(audio.seconds)) ? Number(audio.seconds) : null,
      fileSizeBytes: Number.isFinite(Number(audio.fileLength)) ? Number(audio.fileLength) : null,
      providerMediaId: externalMessageId,
      providerReference: firstText(audio.id, audio.messageId, message.id, data.messageId),
    } : null,
    actionId: selectedId,
    referencedMessageId: firstText(
      root.referencedMessageId,
      root.stanzaId,
      root.stanzaID,
      data.referencedMessageId,
      data.stanzaId,
      data.stanzaID,
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
    ...(mediaDownloadDescriptor === undefined ? {} : { mediaDownloadDescriptor }),
  };
}

export class EvolutionInboundNormalizer implements WhatsAppInboundNormalizer {
  public readonly provider = 'EVOLUTION' as const;
  public readonly capabilities = EVOLUTION_WHATSAPP_CAPABILITIES;
  public normalize(raw: unknown) { return normalizeEvolutionWebhook(raw); }
  public normalizeMany(raw: unknown) { return [this.normalize(raw)]; }
}
