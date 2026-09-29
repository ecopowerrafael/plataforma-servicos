import { type IntelligenceRuleRepository } from './intelligence-rule.repository.js';
import { INTELLIGENCE_TAGS, normalizePattern, type IntelligenceRuleIntent } from './intelligence-rules.js';

const intents = new Set<IntelligenceRuleIntent>(['BOOKING', 'AVAILABILITY', 'PRICE_QUERY', 'PAYMENT_METHODS', 'PAYMENT', 'CANCEL', 'RESCHEDULE', 'BOOKING_QUERY', 'UNKNOWN']);

export class IntelligenceRuleService {
  public constructor(private readonly repository: IntelligenceRuleRepository) {}
  public list() { return this.repository.list(); }
  public ensureDefaultRules() { return this.repository.ensureDefaultRules(); }
  public async create(input: { name: string; description?: string | undefined; intent: string; enabled?: boolean | undefined; priority?: number | undefined; baseConfidence: number; patterns: string[] }) {
    this.validate(input); return this.repository.create(input);
  }
  public async update(publicId: string, input: { name?: string | undefined; description?: string | null | undefined; intent?: string | undefined; enabled?: boolean | undefined; priority?: number | undefined; baseConfidence?: number | undefined; patterns?: string[] | undefined }) {
    if (input.patterns) input.patterns.forEach((pattern) => normalizePattern(pattern));
    if (input.intent && !intents.has(input.intent as IntelligenceRuleIntent)) throw new Error('INTENT_INVALID');
    if (input.baseConfidence !== undefined && (input.baseConfidence < 0 || input.baseConfidence > 1)) throw new Error('CONFIDENCE_INVALID');
    return this.repository.update(publicId, input);
  }
  public delete(publicId: string) { return this.repository.softDelete(publicId); }
  private validate(input: { name: string; intent: string; baseConfidence: number; patterns: string[] }) {
    if (!input.name.trim() || !intents.has(input.intent as IntelligenceRuleIntent)) throw new Error('RULE_INVALID');
    if (!Number.isFinite(input.baseConfidence) || input.baseConfidence < 0 || input.baseConfidence > 1) throw new Error('CONFIDENCE_INVALID');
    if (input.patterns.length === 0) throw new Error('PATTERNS_REQUIRED');
    input.patterns.forEach((pattern) => normalizePattern(pattern));
  }
  public availableTags() { return [...INTELLIGENCE_TAGS]; }
}
