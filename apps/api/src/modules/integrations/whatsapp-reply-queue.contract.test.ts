import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const repository = readFileSync(new URL('./integration.repository.ts', import.meta.url), 'utf8');
const integration = readFileSync(new URL('./integration.service.ts', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../../../prisma/schema.prisma', import.meta.url), 'utf8');

describe('WhatsApp reply queue contract', () => {
  it('persists pending state and a processing lease on each conversation', () => {
    expect(schema).toContain('pendingReplyAt');
    expect(schema).toContain('pendingReplyEventId');
    expect(schema).toContain('replyProcessingToken');
    expect(repository).toContain('claimPendingReply');
    expect(repository).toContain('updateMany');
  });

  it('uses an atomic conditional claim and tokenized completion', () => {
    expect(repository).toMatch(/pendingReplyAt:\s*candidate\.pendingReplyAt/u);
    expect(repository).toMatch(/replyProcessingToken:\s*token/u);
    expect(repository).toMatch(/replyProcessingToken:\s*token.*pendingReplyAt:\s*null/su);
  });

  it('processes pending replies through the periodic worker path', () => {
    expect(integration).toContain('processPendingWhatsappReplies');
    expect(integration).toContain('bypassResponseInterval: true');
    expect(integration).toContain('inboundEventsAfter');
  });
});
