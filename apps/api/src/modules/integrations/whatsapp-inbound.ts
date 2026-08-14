import { createHash } from 'node:crypto';

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

const text = (value: unknown, max: number) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, max) : null;

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
  /** Tipo interno. `null` quando o evento não é de nosso interesse. */
  eventType: WhatsAppEventType | null;
  /** Nome cru do evento, guardado só para diagnóstico. */
  providerEvent: string | null;
  instanceId: string | null;
  externalMessageId: string | null;
  phone: string | null;
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
  const sender = record(root.sender);
  const reply = record(content.templateButtonReplyMessage);
  const replyContext = record(reply.contextInfo);
  const providerEvent = text(root.event, 80);
  const statusValue = text(root.status, 40);
  const isAction = Object.keys(reply).length > 0;

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
    eventType,
    providerEvent,
    instanceId: text(root.instanceId, 80),
    externalMessageId,
    phone: text(sender.id ?? root.phone, 32),
    messageType: isAction ? 'BUTTON_REPLY' : text(root.type, 80),
    text: text(content.conversation, 2_000),
    actionId: null,
    referencedMessageId: text(replyContext.stanzaID ?? replyContext.stanzaId, 191),
    selectedIndex: typeof index === 'number' && Number.isInteger(index) ? index : null,
    selectedDisplayText: text(reply.selectedDisplayText, 191),
    timestamp: typeof moment === 'number' && moment > 0 ? new Date(moment * 1_000) : null,
    fromMe: root.fromMe === true,
    isGroup: root.isGroup === true,
    fingerprint: eventFingerprint({
      eventType,
      externalMessageId,
      payload,
    }),
    payload,
  };
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
