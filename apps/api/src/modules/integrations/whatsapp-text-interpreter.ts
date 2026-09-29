import { resolveDate, resolveTime } from './intelligence-date-time.js';

export const TEXT_INTENTS = ['BOOKING', 'AVAILABILITY', 'PRICE_QUERY', 'PAYMENT_METHODS', 'PAYMENT', 'CANCEL', 'RESCHEDULE', 'BOOKING_QUERY', 'UNKNOWN'] as const;
export type TextIntent = (typeof TEXT_INTENTS)[number];
export type DayPeriod = 'MORNING' | 'AFTERNOON' | 'EVENING';
export type PaymentMethod = 'PIX' | 'CARD' | 'CASH';
export interface InterpreterEntityHints { serviceId?: string; serviceName?: string; comboId?: string; comboName?: string; professionalId?: string; professionalName?: string; date?: string; time?: string; dayPeriod?: DayPeriod; paymentMethod?: PaymentMethod; }
export interface InterpreterMessage { text: string; }
export interface TextInterpreterCatalog { services?: { id?: string; publicId?: string; name: string }[]; combos?: { id?: string; publicId?: string; name: string }[]; professionals?: { id?: string; publicId?: string; name: string; displayName?: string | null; active?: boolean }[]; }
export interface TextInterpreterAlias { entityType: 'SERVICE' | 'COMBO' | 'PROFESSIONAL'; entityPublicId: string; alias: string; enabled?: boolean; }
export interface TextInterpreterInput { text?: string; messages?: InterpreterMessage[]; conversationContext?: unknown; catalog?: TextInterpreterCatalog; aliases?: TextInterpreterAlias[]; }
export interface TextInterpretation { intent: TextIntent; confidence: number; entityConfidence: Partial<Record<keyof InterpreterEntityHints, number>>; entities: InterpreterEntityHints; normalizedText: string; }
export const CONFIDENCE = { LOW: 0.35, MEDIUM: 0.65, HIGH: 0.9 } as const;
export function normalizePortugueseText(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLowerCase().replace(/\bqto\b/gu, 'quanto').replace(/\s+/gu, ' ').replace(/[!?.,;:]+/gu, ' ').trim(); }
const hasAny = (text: string, terms: string[]) => terms.some((term) => text.includes(term));
const idOf = (item: { id?: string; publicId?: string }) => item.publicId ?? item.id;
const dateFrom = (text: string) => resolveDate(text)?.isoDate;
const timeFrom = (text: string) => resolveTime(text)?.time;
const periodFrom = (text: string): DayPeriod | undefined => hasAny(text, ['manha', 'de manha', 'pela manha']) ? 'MORNING' : hasAny(text, ['tarde', 'de tarde']) ? 'AFTERNOON' : hasAny(text, ['noite', 'a noite']) ? 'EVENING' : undefined;
const paymentFrom = (text: string): PaymentMethod | undefined => text.includes('pix') ? 'PIX' : hasAny(text, ['cartao', 'credito', 'debito']) ? 'CARD' : text.includes('dinheiro') ? 'CASH' : undefined;
const catalogTerm = (text: string, items: { name: string; publicId?: string; id?: string; active?: boolean }[] | undefined, aliases: TextInterpreterAlias[], entityType: TextInterpreterAlias['entityType']) => {
  const candidates = (items ?? []).filter((item) => item.active !== false).flatMap((item) => [
    { value: normalizePortugueseText(item.name), name: item.name, id: idOf(item), entityPublicId: idOf(item), entityType },
    ...aliases.filter((alias) => alias.enabled !== false && alias.entityType === entityType && alias.entityPublicId === idOf(item)).map((alias) => ({ value: normalizePortugueseText(alias.alias), name: item.name, id: idOf(item), entityPublicId: idOf(item), entityType })),
  ]).filter((item): item is { value: string; name: string; id: string | undefined; entityPublicId: string | undefined; entityType: TextInterpreterAlias['entityType'] } => Boolean(item.id));
  const found = candidates.filter((item) => item.value.length > 1 && text.includes(item.value)).sort((a, b) => b.value.length - a.value.length);
  return { item: found.length === 1 ? found[0] : undefined, ambiguous: new Set(found.map((item) => item.entityPublicId)).size > 1 };
};

/** Interpretador local: texto original nunca é mutado e nenhum provider é consultado. */
export function interpretText(input: TextInterpreterInput): TextInterpretation {
  const original = input.text ?? (input.messages ?? []).map((message) => message.text).join(' ');
  const normalizedText = normalizePortugueseText(original);
  const aliases = input.aliases ?? [];
  const serviceMatch = catalogTerm(normalizedText, input.catalog?.services, aliases, 'SERVICE');
  const comboMatch = catalogTerm(normalizedText, input.catalog?.combos, aliases, 'COMBO');
  const professionalMatch = catalogTerm(normalizedText, input.catalog?.professionals, aliases, 'PROFESSIONAL');
  const date = dateFrom(normalizedText); const time = timeFrom(normalizedText); const dayPeriod = periodFrom(normalizedText); const paymentMethod = paymentFrom(normalizedText);
  const entities: InterpreterEntityHints = { ...(serviceMatch.item === undefined ? {} : { ...(serviceMatch.item.id === undefined ? {} : { serviceId: serviceMatch.item.id }), serviceName: serviceMatch.item.name }), ...(comboMatch.item === undefined ? {} : { ...(comboMatch.item.id === undefined ? {} : { comboId: comboMatch.item.id }), comboName: comboMatch.item.name }), ...(professionalMatch.item === undefined ? {} : { ...(professionalMatch.item.id === undefined ? {} : { professionalId: professionalMatch.item.id }), professionalName: professionalMatch.item.name }), ...(date === undefined ? {} : { date }), ...(time === undefined ? {} : { time }), ...(dayPeriod === undefined ? {} : { dayPeriod }), ...(paymentMethod === undefined ? {} : { paymentMethod }) };
  const entityConfidence: TextInterpretation['entityConfidence'] = { ...(entities.serviceName === undefined ? {} : { serviceName: serviceMatch.ambiguous ? CONFIDENCE.MEDIUM : CONFIDENCE.HIGH }), ...(entities.professionalName === undefined ? {} : { professionalName: professionalMatch.ambiguous ? CONFIDENCE.MEDIUM : CONFIDENCE.HIGH }), ...(date === undefined ? {} : { date: CONFIDENCE.HIGH }), ...(time === undefined ? {} : { time: CONFIDENCE.HIGH }) };
  const result = (intent: TextIntent, confidence: number): TextInterpretation => ({ intent, confidence, entityConfidence, entities, normalizedText });
  if (hasAny(normalizedText, ['ja paguei', 'paguei ontem', 'paguei'])) return result('UNKNOWN', CONFIDENCE.LOW);
  if (hasAny(normalizedText, ['cancelar', 'desmarcar', 'nao vou conseguir ir'])) return result('CANCEL', CONFIDENCE.HIGH);
  if (hasAny(normalizedText, ['remarcar', 'mudar meu horario', 'trocar meu horario', 'outro horario'])) return result('RESCHEDULE', CONFIDENCE.HIGH);
  if (hasAny(normalizedText, ['qual meu horario', 'tenho horario marcado', 'quando e meu agendamento', 'qual dia eu marquei'])) return result('BOOKING_QUERY', CONFIDENCE.HIGH);
  if (hasAny(normalizedText, ['aceita pix', 'aceita cartao', 'aceita dinheiro', 'como posso pagar', 'formas de pagamento'])) return result('PAYMENT_METHODS', CONFIDENCE.HIGH);
  if (hasAny(normalizedText, ['quero pagar', 'me manda o pix', 'pagar meu horario'])) return result('PAYMENT', CONFIDENCE.HIGH);
  if (hasAny(normalizedText, ['quanto custa', 'qual valor', 'quanto e', 'preco', 'custa'])) return result('PRICE_QUERY', entities.serviceName === undefined ? CONFIDENCE.MEDIUM : CONFIDENCE.HIGH);
  if (hasAny(normalizedText, ['tem horario', 'tem vaga', 'tem algo de'])) return result('AVAILABILITY', date !== undefined || dayPeriod !== undefined ? CONFIDENCE.HIGH : CONFIDENCE.MEDIUM);
  if (hasAny(normalizedText, ['quero agendar', 'quero marcar', 'marca ', 'agendar']) || entities.serviceName !== undefined || entities.professionalName !== undefined) return result('BOOKING', date !== undefined || entities.serviceName !== undefined || entities.professionalName !== undefined ? CONFIDENCE.HIGH : CONFIDENCE.MEDIUM);
  return result('UNKNOWN', CONFIDENCE.LOW);
}
