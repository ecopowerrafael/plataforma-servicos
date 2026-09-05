import { describe, expect, it } from 'vitest';

import { normalizeWhatsAppPhone } from './whatsapp-phone.js';

describe('normalizeWhatsAppPhone', () => {
  it('adds the Brazilian country code to local numbers', () => {
    expect(normalizeWhatsAppPhone('(11) 99999-9999')).toBe('5511999999999');
  });

  it('preserves an existing international number without formatting', () => {
    expect(normalizeWhatsAppPhone('+55 11 99999-9999')).toBe('5511999999999');
    expect(normalizeWhatsAppPhone('+1 415 555 2671')).toBe('14155552671');
  });

  it('rejects unusable numbers', () => {
    expect(normalizeWhatsAppPhone('123')).toBeNull();
  });
});
