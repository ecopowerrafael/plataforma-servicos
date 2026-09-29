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
    const matches = entities.filter((entity) => {
      if (entity.entityType !== tag) return false;
      const direct = normalizeIntelligenceText(entity.name);
      const aliasMatch = aliases.some((alias) => alias.enabled !== false && alias.entityType === tag && alias.publicId === entity.publicId && normalizeIntelligenceText(alias.alias) === normalized);
      return direct === normalized || direct.includes(normalized) || aliasMatch;
    });
    return { tag, value, ...(matches.length === 1 ? { entity: matches[0] } : {}), candidates: matches, ambiguous: matches.length > 1 };
  }
}
