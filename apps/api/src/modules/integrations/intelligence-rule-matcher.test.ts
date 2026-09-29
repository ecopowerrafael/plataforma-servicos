import { describe, expect, it } from 'vitest';

import { EntityResolver } from './intelligence-entity-resolver.js';
import { chooseBestMatch } from './intelligence-rule-matcher.js';
import { normalizePattern } from './intelligence-rules.js';

describe('configurable intelligence matcher', () => {
  const candidates = [
    { ruleId: 'generic', ruleName: 'Booking generic', intent: 'BOOKING' as const, priority: 100, baseConfidence: 0.7, patternId: 'a', pattern: 'quero {SERVICE}' },
    { ruleId: 'specific', ruleName: 'Booking detailed', intent: 'BOOKING' as const, priority: 0, baseConfidence: 0.8, patternId: 'b', pattern: 'quero {SERVICE} com {PROFESSIONAL} {DATE} às {TIME}' },
  ];

  it('chooses the more specific pattern for a natural variation', () => {
    const result = chooseBestMatch('eu quero limpeza dental com Ana para amanhã às 15', candidates);
    expect(result?.ruleId).toBe('specific');
    expect(result?.entities.map((entity) => entity.tag)).toEqual(['SERVICE', 'PROFESSIONAL', 'DATE', 'TIME']);
  });

  it('rejects unknown tags and derives normalized patterns in the backend', () => {
    expect(normalizePattern('Quanto custa {SERVICE}')).toBe('quanto custa {SERVICE}');
    expect(() => normalizePattern('quanto custa {UNKNOWN}')).toThrow('TAG_INVALID');
  });

  it('resolves the same structure across niches and preserves ambiguity', () => {
    const resolver = new EntityResolver();
    const services = [
      { publicId: 'service-a', name: 'Consulta Cardiológica', entityType: 'SERVICE' as const },
      { publicId: 'service-b', name: 'Consulta Clínica', entityType: 'SERVICE' as const },
    ];
    expect(resolver.resolve('SERVICE', 'consulta cardiologica', services).entity?.publicId).toBe('service-a');
    expect(resolver.resolve('SERVICE', 'consulta', services).ambiguous).toBe(true);
    expect(resolver.resolve('SERVICE', 'limpeza dental', [{ publicId: 'service-c', name: 'Limpeza Dental', entityType: 'SERVICE' as const }]).entity?.publicId).toBe('service-c');
  });
});
