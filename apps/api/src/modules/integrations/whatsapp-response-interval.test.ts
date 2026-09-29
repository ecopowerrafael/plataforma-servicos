import { describe, expect, it } from 'vitest';
import { nextAllowedReplyAt, shouldDeferReply } from './whatsapp-response-interval.js';

describe('whatsapp response interval', () => {
  const sentAt = new Date('2026-09-29T10:00:00.000Z');
  it('responds immediately when configured as zero', () => expect(shouldDeferReply(sentAt, 0, new Date('2026-09-29T10:00:00.001Z'))).toBe(false));
  it('defers before the configured deadline and allows at the deadline', () => {
    expect(nextAllowedReplyAt(sentAt, 5)?.toISOString()).toBe('2026-09-29T10:00:05.000Z');
    expect(shouldDeferReply(sentAt, 5, new Date('2026-09-29T10:00:02.000Z'))).toBe(true);
    expect(shouldDeferReply(sentAt, 5, new Date('2026-09-29T10:00:05.000Z'))).toBe(false);
  });
  it('does not create a global pause when there was no automated reply', () => expect(shouldDeferReply(null, 60, new Date())).toBe(false));
});
