export const INTELLIGENCE_TAGS = [
  'SERVICE',
  'COMBO',
  'PROFESSIONAL',
  'DATE',
  'TIME',
  'DAY_PERIOD',
  'PAYMENT_METHOD',
] as const;

export type IntelligenceTag = (typeof INTELLIGENCE_TAGS)[number];
export type IntelligenceRuleIntent =
  | 'BOOKING'
  | 'AVAILABILITY'
  | 'PRICE_QUERY'
  | 'PAYMENT_METHODS'
  | 'PAYMENT'
  | 'CANCEL'
  | 'RESCHEDULE'
  | 'BOOKING_QUERY'
  | 'UNKNOWN';

const tagPattern = /\{([A-Z_]+)\}/gu;

export function normalizeIntelligenceText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/\bqto\b/gu, 'quanto')
    .replace(/\s+/gu, ' ')
    .replace(/[!?.,;:]+/gu, ' ')
    .trim();
}

export function tagsInPattern(pattern: string): IntelligenceTag[] {
  const tags: IntelligenceTag[] = [];
  for (const match of pattern.matchAll(tagPattern)) {
    const value = match[1];
    if (value === undefined || !(INTELLIGENCE_TAGS as readonly string[]).includes(value))
      throw new Error(`TAG_INVALID:${String(value)}`);
    if (!tags.includes(value as IntelligenceTag)) tags.push(value as IntelligenceTag);
  }
  return tags;
}

export function normalizePattern(pattern: string): string {
  if (pattern.trim() === '') throw new Error('PATTERN_EMPTY');
  tagsInPattern(pattern);
  const normalized = normalizeIntelligenceText(pattern);
  return normalized.replace(/\{(service|combo|professional|date|time|day_period|payment_method)\}/gu, (_match, tag: string) => `{${tag.toUpperCase()}}`);
}
