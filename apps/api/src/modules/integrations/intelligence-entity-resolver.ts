import { normalizeIntelligenceText, type IntelligenceTag } from './intelligence-rules.js';

export interface EntityCandidate {
  publicId: string;
  name: string;
  entityType: 'SERVICE' | 'COMBO' | 'PROFESSIONAL';
}
export type Alias = EntityCandidate & { alias: string; enabled?: boolean };
export interface EntityResolution {
  tag: IntelligenceTag;
  value: string;
  entity?: EntityCandidate;
  candidates: EntityCandidate[];
  ambiguous: boolean;
}

export class EntityResolver {
  public resolve(tag: IntelligenceTag, value: string, entities: EntityCandidate[], aliases: Alias[] = []): EntityResolution {
    const supported = tag === 'SERVICE' || tag === 'COMBO' || tag === 'PROFESSIONAL';
    if (!supported) return { tag, value, candidates: [], ambiguous: false };
    const normalized = normalizeIntelligenceText(value);
    const scored = entities.flatMap((entity) => {
      if (entity.entityType !== tag) return [];
      const direct = normalizeIntelligenceText(entity.name);
      const aliasMatch = aliases.some((alias) => alias.enabled !== false && alias.entityType === tag && alias.publicId === entity.publicId && normalizeIntelligenceText(alias.alias) === normalized);
      const directTokens = direct.split(' ').filter((token) => token.length > 1 && token !== 'e');
      const valueTokens = normalized.split(' ').filter((token) => token.length > 1 && token !== 'e');
      const completeTokenMatch = valueTokens.length >= directTokens.length && directTokens.every((token) => valueTokens.includes(token));
      const partialNameMatch = tag !== 'COMBO' && direct.includes(normalized);
      const fuzzyWordMatch = tag !== 'COMBO' && directTokens[0]!.length >= 4 && valueTokens.some((token) => token.length >= 4 && directTokens[0]!.slice(0, 4) === token.slice(0, 4));
      const score = aliasMatch || direct === normalized ? 4 : completeTokenMatch ? 3 : partialNameMatch ? 2 : fuzzyWordMatch ? 1 : 0;
      return score === 0 ? [] : [{ entity, score }];
    });
    const bestScore = Math.max(0, ...scored.map((item) => item.score));
    const matches = scored.filter((item) => item.score === bestScore).map((item) => item.entity);
    return { tag, value, ...(matches.length === 1 ? { entity: matches[0] } : {}), candidates: matches, ambiguous: matches.length > 1 };
  }
}
