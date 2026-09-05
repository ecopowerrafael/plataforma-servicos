import { describe, expect, it } from 'vitest';

import { auditReadDetails, sanitizeAuditValue } from './audit-sanitizer.js';

describe('platform audit read sanitization', () => {
  it('sanitizes sensitive fields recursively', () => {
    expect(sanitizeAuditValue({ passwordHash: 'hash', nested: { accessToken: 'token', status: 'ACTIVE' }, list: [{ smtpSecret: 'secret' }] })).toEqual({ passwordHash: '[protegido]', nested: { accessToken: '[protegido]', status: 'ACTIVE' }, list: [{ smtpSecret: '[protegido]' }] });
  });

  it('extracts reason and previous/new values', () => {
    expect(auditReadDetails({ previousStatus: 'TRIALING', newStatus: 'ACTIVE', reason: 'Aprovado' })).toMatchObject({ reason: 'Aprovado', before: { status: 'TRIALING' }, after: { status: 'ACTIVE' } });
  });

  it('keeps records without metadata compatible', () => {
    expect(auditReadDetails(null)).toEqual({ reason: null, metadata: null, before: null, after: null });
  });
});
