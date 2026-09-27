import { describe, expect, it } from 'vitest';

import { formatCycle, formatDate, formatMoney, formatStatus } from './PlatformUi.js';

describe('platform presentation formatters', () => {
  it('formats monetary values stored in cents', () => {
    expect(formatMoney('59000')).toContain('590,00');
    expect(formatMoney('190000')).toContain('1.900,00');
  });

  it('translates commercial status and billing cycles', () => {
    expect(formatStatus('TRIALING')).toBe('Em teste');
    expect(formatStatus('PAST_DUE')).toBe('Pagamento pendente');
    expect(formatCycle('ANNUAL')).toBe('Anual');
  });

  it('formats dates for the administrative locale', () => {
    expect(formatDate('2026-08-17T21:54:26.186Z')).toBe('17/08/2026');
  });
});
