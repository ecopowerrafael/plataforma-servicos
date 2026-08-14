import { createHash } from 'node:crypto';

/**
 * Normalização e sanitização do webhook de WhatsApp.
 *
 * Só extraímos campos que a coleção/documentação oficial descreve (`event`,
 * `instanceId`, `data.messageId`, `data.phone`, `data.type`). O campo que
 * carrega a resposta de um botão ainda não é conhecido, por isso ele não é
 * adivinhado: o payload sanitizado é guardado por inteiro e o `actionId` só é
 * preenchido quando algum valor do payload for exatamente um dos IDs que nós
 * mesmos enviamos — o caminho onde ele apareceu é registrado junto, e é assim
 * que vamos descobrir o nome real do campo.
 */

const SECRET_KEY = /token|authorization|secret|password|senha|apikey|api_key|credential|bearer/iu;
const SECRET_VALUE = /(?:Bearer\s+\S+)|(?:[A-Za-z0-9_-]{40,})/gu;
const REDACTED = '[protegido]';
const MAX_DEPTH = 8;
const MAX_ARRAY = 40;
const MAX_STRING = 2_000;
const MAX_SERIALIZED = 20_000;

function sanitizeString(value: string) {
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

export interface WhatsAppActionMatch {
  actionId: string;
  /** Caminho em que o ID apareceu, ex.: `data.message.buttonsResponseMessage.selectedButtonId`. */
  path: string;
}

/**
 * Procura, no payload, um valor idêntico a um dos IDs enviados por nós.
 * Não infere nome de campo: compara valores conhecidos.
 */
export function findKnownActionId(
  value: unknown,
  knownIds: readonly string[],
  path = '',
  depth = 0,
): WhatsAppActionMatch | null {
  if (depth > MAX_DEPTH) return null;
  if (typeof value === 'string')
    return knownIds.includes(value.trim()) ? { actionId: value.trim(), path } : null;
  if (Array.isArray(value)) {
    for (const [index, item] of value.slice(0, MAX_ARRAY).entries()) {
      const found = findKnownActionId(item, knownIds, `${path}[${String(index)}]`, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      const found = findKnownActionId(
        item,
        knownIds,
        path === '' ? key : `${path}.${key}`,
        depth + 1,
      );
      if (found !== null) return found;
    }
  }
  return null;
}

export interface NormalizedWhatsAppEvent {
  instanceId: string | null;
  eventType: string | null;
  externalMessageId: string | null;
  phone: string | null;
  messageType: string | null;
  action: WhatsAppActionMatch | null;
  fingerprint: string;
  payload: unknown;
}

/**
 * Identidade do evento para deduplicação. Usa o id real do provedor quando ele
 * existe; caso contrário, o hash do payload sanitizado.
 */
export function eventFingerprint(input: {
  eventType: string | null;
  externalMessageId: string | null;
  payload: unknown;
}) {
  if (input.externalMessageId !== null)
    return `${input.eventType ?? 'event'}:${input.externalMessageId}`.slice(0, 191);
  return `sha256:${createHash('sha256').update(JSON.stringify(input.payload ?? null)).digest('hex')}`;
}

export function normalizeWhatsAppEvent(
  raw: unknown,
  knownActionIds: readonly string[] = [],
): NormalizedWhatsAppEvent {
  const payload = boundedPayload(sanitizePayload(raw));
  const root = record(payload);
  const data = record(root.data);
  const instanceId = text(root.instanceId ?? data.instanceId, 80);
  const eventType = text(root.event ?? root.eventType, 80);
  const externalMessageId = text(data.messageId ?? root.messageId, 191);
  const phone = text(data.phone ?? root.phone, 32);
  const messageType = text(data.type ?? root.type, 80);
  return {
    instanceId,
    eventType,
    externalMessageId,
    phone,
    messageType,
    action: findKnownActionId(payload, knownActionIds),
    fingerprint: eventFingerprint({ eventType, externalMessageId, payload }),
    payload,
  };
}

/** Mascara o telefone para exibição: mantém DDI/DDD e os quatro últimos dígitos. */
export function maskPhone(phone: string | null) {
  if (phone === null) return null;
  const digits = phone.replace(/\D/gu, '');
  if (digits.length <= 4) return '••••';
  return `${digits.slice(0, Math.min(4, digits.length - 4))}••••${digits.slice(-4)}`;
}
