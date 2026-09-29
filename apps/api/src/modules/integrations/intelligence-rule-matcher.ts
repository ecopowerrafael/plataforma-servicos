import {
  normalizeIntelligenceText,
  type IntelligenceRuleIntent,
  type IntelligenceTag,
} from './intelligence-rules.js';

export interface MatchEntity { tag: IntelligenceTag; value: string }
export interface RuleCandidate {
  ruleId: string;
  ruleName: string;
  intent: IntelligenceRuleIntent;
  priority: number;
  baseConfidence: number;
  patternId: string;
  pattern: string;
}
export type RuleMatch = RuleCandidate & {
  entities: MatchEntity[];
  coverage: number;
  specificity: number;
  score: number;
};

interface Segment { literal?: string; tag?: IntelligenceTag }

function segments(pattern: string): Segment[] {
  const result: Segment[] = [];
  const matcher = /\{([A-Z_]+)\}/gu;
  let cursor = 0;
  for (const match of pattern.matchAll(matcher)) {
    const index = match.index;
    const literal = normalizeIntelligenceText(pattern.slice(cursor, index));
    if (literal) result.push({ literal });
    result.push({ tag: match[1] as IntelligenceTag });
    cursor = index + match[0].length;
  }
  const tail = normalizeIntelligenceText(pattern.slice(cursor));
  if (tail) result.push({ literal: tail });
  return result;
}

export function matchPattern(text: string, candidate: RuleCandidate): RuleMatch | null {
  const normalized = normalizeIntelligenceText(text);
  const parts = segments(candidate.pattern);
  const entities: MatchEntity[] = [];
  let cursor = 0;
  let literalCount = 0;
  let covered = 0;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (part === undefined) continue;
    if (part.literal !== undefined) {
      const found = normalized.indexOf(part.literal, cursor);
      if (found < 0) return null;
      if (found > cursor) covered += found - cursor;
      covered += part.literal.length;
      cursor = found + part.literal.length;
      literalCount += part.literal.split(' ').length;
      continue;
    }
    const nextLiteral = parts.slice(index + 1).find((item) => item.literal !== undefined)?.literal;
    let end = nextLiteral === undefined ? normalized.length : normalized.indexOf(nextLiteral, cursor);
    if (part.tag === 'PROFESSIONAL') {
      const boundary = normalized.slice(cursor).search(/\b(?:para|amanha|hoje|sexta|sabado|domingo|as|\d{1,2}:?\d{0,2})\b/u);
      if (boundary > 0) end = cursor + boundary;
    }
    if (part.tag === 'DATE' && nextLiteral === undefined) {
      const boundary = normalized.slice(cursor).search(/\b(?:as|às|\d{1,2}:?\d{0,2})\b/u);
      if (boundary > 0) end = cursor + boundary;
    }
    if (end < 0 || end < cursor) return null;
    const value = normalized.slice(cursor, end).trim();
    if (!value) return null;
    if (part.tag === undefined) return null;
    entities.push({ tag: part.tag, value });
    covered += value.length;
    cursor = end;
  }
  if (cursor < normalized.length) covered += normalized.length - cursor;
  const coverage = normalized.length === 0 ? 0 : covered / normalized.length;
  const specificity = literalCount + entities.length * 0.25;
  const score = candidate.baseConfidence * 100 + candidate.priority * 0.01 + specificity * 20 + coverage;
  return { ...candidate, entities, coverage, specificity, score };
}

export function chooseBestMatch(text: string, candidates: RuleCandidate[]): RuleMatch | null {
  return candidates
    .map((candidate) => matchPattern(text, candidate))
    .filter((match): match is RuleMatch => match !== null)
    .sort((a, b) => b.score - a.score || b.priority - a.priority || a.patternId.localeCompare(b.patternId))[0] ?? null;
}
