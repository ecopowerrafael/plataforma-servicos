import { describe, expect, it } from 'vitest';

import { formatAuditEvent, sanitizeAuditData } from './AuditPresentation.js';

describe('audit presentation', () => {
  it('formats known and unknown events', () => {
    expect(formatAuditEvent('platform.subscription.plan_changed')).toBe('Plano alterado');
    expect(formatAuditEvent('platform.unknown_custom_event')).toBe('Unknown custom event');
  });

  it('removes sensitive values recursively', () => {
    expect(sanitizeAuditData({ email: 'admin@test.com', token: 'secret', nested: { smtpSecret: 'hidden', status: 'ACTIVE' } })).toEqual({ email: 'admin@test.com', token: '[protegido]', nested: { smtpSecret: '[protegido]', status: 'ACTIVE' } });
  });
});
