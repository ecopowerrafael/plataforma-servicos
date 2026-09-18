import { createHash } from 'node:crypto';

import { type WhatsAppInboundNormalizer, WAPI_WHATSAPP_CAPABILITIES } from './whatsapp-provider.js';

/**
 * Normalização e sanitização dos webhooks de WhatsApp.
 *
 * O restante do Agendei nunca vê o JSON do provedor: tudo o que sai daqui já
 * está no vocabulário interno. Os caminhos usados são os comprovados em
 * produção na Etapa 1 — não há busca recursiva por valor.
 */

const SECRET_KEY =
  /token|authorization|secret|password|senha|apikey|api_key|accesstoken|credential|bearer/iu;
const SECRET_VALUE = /(?:Bearer\s+\S+)|(?:\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/gu;
/** Um valor que é *inteiro* uma sequência longa e opaca é tratado como credencial. */
const OPAQUE_VALUE = /^[A-Za-z0-9_-]{40,}$/u;
const REDACTED = '[protegido]';
const MAX_DEPTH = 8;
const MAX_ARRAY = 40;
const MAX_STRING = 2_000;
const MAX_SERIALIZED = 20_000;

function sanitizeString(value: string) {
  if (OPAQUE_VALUE.test(value.trim())) return REDACTED;
  return value.replace(SECRET_VALUE, REDACTED).slice(0, MAX_STRING);
}

/** Remove credenciais por nome de chave e por formato do valor, em qualquer profundidade. */
export function sanitizePayload(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return REDACTED;
  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value))
    return value.slice(0, MAX_ARRAY).map((item) => sanitizePayload(item, depth + 1));
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = SECRET_KEY.test(key) ? REDACTED : sanitizePayload(item, depth + 1);
    }
    return result;
  }
  return null;
}

/** Corta o payload sanitizado caso ele seja grande demais para guardar inteiro. */
export function boundedPayload(value: unknown): unknown {
  const serialized = JSON.stringify(value ?? null);
  if (serialized.length <= MAX_SERIALIZED) return value;
  return { truncated: true, preview: serialized.slice(0, MAX_SERIALIZED) };
}

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

function structuralKeys(value: unknown): Record<string, unknown> {
  const root = record(value);
  const content = record(root.msgContent);
  return {
    rootKeys: Object.keys(root).sort(),
    chatKeys: Object.keys(record(root.chat)).sort(),
    senderKeys: Object.keys(record(root.sender)).sort(),
    msgContentKeys: Object.keys(content).sort(),
    nestedObjectKeys: Object.fromEntries(
      Object.entries(content)
        .filter(([, item]) => item !== null && typeof item === 'object' && !Array.isArray(item))
        .map(([key, item]) => [key, Object.keys(record(item)).sort()]),
    ),
    messageType: text(root.type, 80),
    providerEvent: text(root.event, 80),
  };
}

const text = (value: unknown, max: number) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, max) : null;

function whatsappPhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.endsWith('@lid')) return null;
  const withoutJid = trimmed.replace(/@(s\.whatsapp\.net|c\.us)$/u, '');
  const digits = withoutJid.replace(/\D/gu, '');
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

type RemoteIdKind = 'PHONE' | 'LID' | 'GROUP' | 'UNKNOWN';

function remoteIdKind(value: unknown): RemoteIdKind {
  if (typeof value !== 'string' || value.trim() === '') return 'UNKNOWN';
  const normalized = value.trim().toLowerCase();
  if (normalized.endsWith('@g.us')) return 'GROUP';
  if (normalized.endsWith('@lid')) return 'LID';
  return whatsappPhone(value) === null ? 'UNKNOWN' : 'PHONE';
}

function remoteLid(value: unknown): string | null {
  return remoteIdKind(value) === 'LID' && typeof value === 'string' ? value.trim() : null;
}

function senderPhone(
  sender: Record<string, unknown>,
  chat: Record<string, unknown>,
): { phone: string | null; senderIdKind: RemoteIdKind; chatIdKind: RemoteIdKind; senderLid: string | null } {
  const senderId = sender.id;
  const chatId = chat.id;
  const senderIdKind = remoteIdKind(senderId);
  const chatIdKind = remoteIdKind(chatId);
  const senderLid = remoteLid(senderId) ?? remoteLid(sender.senderLid);
  // A contact phone comes only from the remote sender/chat identity. Device
  // fields (connectedPhone/connectedLid) identify our own account, never the
  // person who sent the message.
  const phone = whatsappPhone(senderId)
    ?? whatsappPhone(chatId)
    // Legacy sender fields are allowed only after the canonical JIDs. In
    // particular, connectedPhone/connectedLid are intentionally absent.
    ?? whatsappPhone(sender.phoneNumber)
    ?? whatsappPhone(sender.phone)
    ?? whatsappPhone(sender.number);
  return { phone, senderIdKind, chatIdKind, senderLid };
}

function isGroupConversation(root: Record<string, unknown>): boolean {
  const chat = record(root.chat);
  const key = record(root.key);
  const explicit = [root.isGroup, chat.isGroup];
  if (explicit.some((value) => value === true || value === 1 || value === 'true')) return true;
  const sender = record(root.sender);
  const jids = [chat.id, sender.id, sender.senderLid, root.remoteJid, key.remoteJid, root.chatId, root.from];
  return jids.some((value) => typeof value === 'string' && value.trim().toLowerCase().endsWith('@g.us'));
}

/** Vocabulário interno de eventos. Os nomes do provedor não passam daqui. */
export type WhatsAppEventType =
  | 'MESSAGE_RECEIVED'
  | 'MESSAGE_ACTION'
  | 'MESSAGE_SENT'
  | 'MESSAGE_DELIVERED'
  | 'MESSAGE_READ'
  | 'MESSAGE_FAILED';

/**
 * Vocabulário de status descrito na documentação: a entrega notifica o envio
 * (ou a falha), `RECEIVED` confirma o recebimento e `READ` a leitura.
 */
export function mapStatusValue(value: string | null): WhatsAppEventType | null {
  switch (value?.toUpperCase()) {
    case 'SENT':
      return 'MESSAGE_SENT';
    case 'RECEIVED':
    case 'DELIVERED':
      return 'MESSAGE_DELIVERED';
    case 'READ':
      return 'MESSAGE_READ';
    case 'FAILED':
    case 'ERROR':
      return 'MESSAGE_FAILED';
    default:
      return null;
  }
}

export interface NormalizedWhatsAppEvent {
  provider: 'WAPI' | 'META';
  /** Tipo interno. `null` quando o evento não é de nosso interesse. */
  eventType: WhatsAppEventType | null;
  /** Nome cru do evento, guardado só para diagnóstico. */
  providerEvent: string | null;
  instanceId: string | null;
  externalMessageId: string | null;
  phone: string | null;
  remoteLid: string | null;
  senderIdKind: RemoteIdKind;
  chatIdKind: RemoteIdKind;
  hasSenderLid: boolean;
  /** Resolução posterior ao normalizador: cache/API oficial ou NONE. */
  resolutionMethod: 'SENDER_ID' | 'CHAT_ID' | 'LID_CACHE' | 'WAPI_LOOKUP' | 'NONE';
  identityResult: 'RESOLVED' | 'LID_UNRESOLVED' | 'GROUP_IGNORED' | 'FROM_ME';
  senderName: string | null;
  messageType: string | null;
  /** Texto da mensagem, quando é uma mensagem de texto. */
  text: string | null;
  /** Nosso identificador de ação, resolvido fora daqui pelo índice do botão. */
  actionId: string | null;
  /** Mensagem à qual este evento responde (`contextInfo.stanzaID`). */
  referencedMessageId: string | null;
  /** Posição do botão clicado no array que enviamos. */
  selectedIndex: number | null;
  /** Texto visível do botão. Exibição apenas — nunca decide a ação. */
  selectedDisplayText: string | null;
  timestamp: Date | null;
  fromMe: boolean;
  isGroup: boolean;
  fingerprint: string;
  payload: unknown;
}

export interface WApiRemoteIdentityStore {
  findPhone(instanceId: string, remoteLid: string): Promise<string | null>;
  savePhone(instanceId: string, remoteLid: string, phone: string): Promise<void>;
}

export interface WApiRemoteIdentityLookup {
  lookupPhone(instanceId: string, remoteLid: string): Promise<string | null>;
}

/** Resolve a LID without ever falling back to the connected device number. */
export async function resolveWApiRemoteIdentity(
  event: NormalizedWhatsAppEvent,
  store?: WApiRemoteIdentityStore,
  lookup?: WApiRemoteIdentityLookup,
): Promise<NormalizedWhatsAppEvent> {
  if (event.isGroup || event.fromMe || event.phone !== null || event.remoteLid === null || event.instanceId === null)
    return event;

  const cached = await store?.findPhone(event.instanceId, event.remoteLid);
  const lookedUp = cached ?? await lookup?.lookupPhone(event.instanceId, event.remoteLid) ?? null;
  if (lookedUp === null) {
    return { ...event, resolutionMethod: 'NONE', identityResult: 'LID_UNRESOLVED' };
  }
  const phone = whatsappPhone(lookedUp);
  if (phone === null) return { ...event, resolutionMethod: 'NONE', identityResult: 'LID_UNRESOLVED' };
  if (cached === null || cached === undefined) await store?.savePhone(event.instanceId, event.remoteLid, phone);
  return {
    ...event,
    phone,
    resolutionMethod: cached !== null && cached !== undefined ? 'LID_CACHE' : 'WAPI_LOOKUP',
    identityResult: 'RESOLVED',
  };
}

/**
 * Normalizador explícito do webhook do provedor.
 *
 * Caminhos comprovados em produção:
 * - envelope: `event`, `instanceId`, `messageId`, `sender.id`, `moment`, `fromMe`
 * - texto: `msgContent.conversation`
 * - clique: `msgContent.templateButtonReplyMessage.selectedIndex` e
 *   `.contextInfo.stanzaID`
 *
 * O status de entrega/leitura chega pelo webhook de status, cujo corpo o
 * provedor não documenta; lemos o campo `status` do topo do envelope, sem
 * varrer o JSON.
 */
export function normalizeWApiWebhook(raw: unknown): NormalizedWhatsAppEvent {
  const payload = boundedPayload(sanitizePayload(raw));
  const root = record(payload);
  const content = record(root.msgContent);
  const extendedText = record(content.extendedTextMessage);
  const imageMessage = record(content.imageMessage);
  const videoMessage = record(content.videoMessage);
  const sender = record(root.sender);
  const chat = record(root.chat);
  const reply = record(content.templateButtonReplyMessage);
  const replyContext = record(reply.contextInfo);
  const providerEvent = text(root.event, 80);
  const statusValue = text(root.status, 40);
  const isAction = Object.keys(reply).length > 0;
  const isGroup = isGroupConversation(root);
  const identity = senderPhone(sender, chat);
  const fromMe = root.fromMe === true;
  const resolutionMethod = identity.phone === null ? 'NONE' : identity.senderIdKind === 'PHONE' ? 'SENDER_ID' : 'CHAT_ID';
  const identityResult = isGroup
    ? 'GROUP_IGNORED'
    : fromMe
      ? 'FROM_ME'
      : identity.phone !== null
        ? 'RESOLVED'
        : identity.senderLid !== null
          ? 'LID_UNRESOLVED'
          : 'RESOLVED';

  console.log('[WApiRemoteIdentity]', {
    isGroup,
    senderIdKind: identity.senderIdKind,
    chatIdKind: identity.chatIdKind,
    hasSenderLid: identity.senderLid !== null,
    resolutionMethod,
    hasValidPhone: !isGroup && !fromMe && identity.phone !== null,
    result: identityResult,
  });

  if (providerEvent === 'webhookReceived') {
    console.log('[WApiWebhookStructure]', structuralKeys(payload));
  }

  const eventType: WhatsAppEventType | null =
    mapStatusValue(statusValue) ??
    (providerEvent === 'webhookReceived'
      ? isAction
        ? 'MESSAGE_ACTION'
        : 'MESSAGE_RECEIVED'
      : providerEvent === 'webhookDelivery'
        ? 'MESSAGE_SENT'
        : null);

  const moment = root.moment;
  const externalMessageId = text(root.messageId, 191);
  const index = reply.selectedIndex;

  return {
    provider: 'WAPI',
    eventType,
    providerEvent,
    instanceId: text(root.instanceId, 80),
    externalMessageId,
    phone: isGroup || fromMe ? null : identity.phone,
    remoteLid: identity.senderLid,
    senderIdKind: identity.senderIdKind,
    chatIdKind: identity.chatIdKind,
    hasSenderLid: identity.senderLid !== null,
    resolutionMethod,
    identityResult,
    senderName: text(sender.pushName, 180),
    messageType: isAction ? 'BUTTON_REPLY' : text(root.type, 80),
    text: text(
      content.conversation ?? extendedText.text ?? imageMessage.caption ?? videoMessage.caption
        ?? text(content.text, 2_000) ?? text(content.message, 2_000)
        ?? text(root.text, 2_000) ?? text(root.message, 2_000),
      2_000,
    ),
    actionId: null,
    referencedMessageId: text(replyContext.stanzaID ?? replyContext.stanzaId, 191),
    selectedIndex: typeof index === 'number' && Number.isInteger(index) ? index : null,
    selectedDisplayText: text(reply.selectedDisplayText, 191),
    timestamp: typeof moment === 'number' && moment > 0 ? new Date(moment * 1_000) : null,
    fromMe,
    isGroup,
    fingerprint: eventFingerprint({
      eventType,
      externalMessageId,
      payload,
    }),
    payload,
  };
}

export class WApiInboundNormalizer implements WhatsAppInboundNormalizer {
  public readonly provider = 'WAPI' as const;
  public readonly capabilities = WAPI_WHATSAPP_CAPABILITIES;

  public normalize(raw: unknown): NormalizedWhatsAppEvent {
    return normalizeWApiWebhook(raw);
  }

  public normalizeMany(raw: unknown): NormalizedWhatsAppEvent[] {
    return [this.normalize(raw)];
  }
}

/**
 * Identidade do evento para deduplicação. Usa o id real do provedor combinado
 * com o tipo interno, já que a mesma mensagem gera eventos diferentes ao longo
 * do ciclo; sem id, cai no hash do payload sanitizado.
 */
export function eventFingerprint(input: {
  eventType: WhatsAppEventType | null;
  externalMessageId: string | null;
  payload: unknown;
}) {
  if (input.externalMessageId !== null)
    return `${input.eventType ?? 'EVENT'}:${input.externalMessageId}`.slice(0, 191);
  return `sha256:${createHash('sha256').update(JSON.stringify(input.payload ?? null)).digest('hex')}`;
}

/** Mascara o telefone para exibição: mantém DDI/DDD e os quatro últimos dígitos. */
export function maskPhone(phone: string | null) {
  if (phone === null) return null;
  const digits = phone.replace(/\D/gu, '');
  if (digits.length <= 4) return '••••';
  return `${digits.slice(0, Math.min(4, digits.length - 4))}••••${digits.slice(-4)}`;
}
