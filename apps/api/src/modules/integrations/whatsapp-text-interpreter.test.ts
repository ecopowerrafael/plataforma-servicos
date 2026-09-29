import { describe, expect, it } from 'vitest';
import { interpretText, normalizePortugueseText } from './whatsapp-text-interpreter.js';
import { resolveDate, resolveTime } from './intelligence-date-time.js';

describe('whatsapp text interpreter', () => {
  const catalog = { services: [{ publicId: 'svc-1', name: 'Corte masculino' }], professionals: [{ publicId: 'pro-1', name: 'João Silva' }, { publicId: 'pro-2', name: 'João Pedro' }] };
  const aliases = [{ entityType: 'SERVICE' as const, entityPublicId: 'svc-1', alias: 'cortar' }];
  it('normalizes Portuguese without changing the source text', () => expect(normalizePortugueseText('  Qto custa CORTÊ?  ')).toBe('quanto custa corte'));
  it.each([
    ['quero agendar', 'BOOKING'], ['quero marcar corte', 'BOOKING'], ['quero cortar amanhã de manhã', 'BOOKING'],
    ['quanto custa corte?', 'PRICE_QUERY'], ['qual valor da barba?', 'PRICE_QUERY'], ['quanto custa?', 'PRICE_QUERY'],
    ['tem horário amanhã de manhã?', 'AVAILABILITY'], ['aceita pix?', 'PAYMENT_METHODS'], ['como posso pagar?', 'PAYMENT_METHODS'],
    ['quero pagar', 'PAYMENT'], ['quero cancelar meu horário', 'CANCEL'], ['quero remarcar', 'RESCHEDULE'], ['qual meu horário?', 'BOOKING_QUERY'],
  ])('%s -> %s', (text, intent) => expect(interpretText({ text, catalog, aliases }).intent).toBe(intent));
  it('combines short messages as one interpretation', () => expect(interpretText({ messages: [{ text: 'quero cortar' }, { text: 'amanhã' }, { text: 'de manhã' }], catalog, aliases })).toMatchObject({ intent: 'BOOKING', entities: { serviceName: 'Corte masculino', date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), dayPeriod: 'MORNING' } }));
  it('does not confirm a payment from text', () => expect(interpretText({ text: 'já paguei' })).toMatchObject({ intent: 'UNKNOWN', confidence: 0.35 }));
  it('does not treat vague uncertainty as high-confidence booking', () => expect(interpretText({ text: 'amanhã talvez eu passe aí' }).confidence).toBeLessThan(0.9));
  it('extracts only unique real professionals and normalized time', () => expect(interpretText({ text: 'quero cortar com o João amanhã às 15h', catalog, aliases })).toMatchObject({ intent: 'BOOKING', entities: { serviceName: 'Corte masculino', date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), time: '15:00' } }));
  it('parses spoken afternoon time and explicit dates', () => expect(interpretText({ text: 'tem horário com Maria dia 30/09 às 3 da tarde', catalog: { professionals: [{ publicId: 'pro-3', name: 'Maria' }] } })).toMatchObject({ intent: 'AVAILABILITY', entities: { professionalName: 'Maria', date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), time: '15:00' } }));
  it('resolves unique real catalog entities and leaves ambiguous names unresolved', () => {
    expect(interpretText({ text: 'quero cortar com João', catalog, aliases }).entities).toMatchObject({ serviceId: 'svc-1' });
    expect(interpretText({ text: 'quero cortar com João Silva', catalog, aliases }).entities.professionalId).toBe('pro-1');
  });
  it('resolves relative dates and weekdays from a frozen local date', () => {
    const now = new Date('2026-09-29T12:00:00-03:00');
    expect(resolveDate('hoje', now)?.isoDate).toBe('2026-09-29');
    expect(resolveDate('amanhã', now)?.isoDate).toBe('2026-09-30');
    expect(resolveDate('depois de amanhã', now)?.isoDate).toBe('2026-10-01');
    expect(resolveDate('quarta', now)?.isoDate).toBe('2026-09-30');
    expect(resolveDate('terça', now)?.isoDate).toBe('2026-10-06');
    expect(resolveDate('01/09', now)?.isoDate).toBe('2027-09-01');
    expect(resolveTime('às 14:30')?.time).toBe('14:30');
    expect(resolveTime('3 da tarde')?.time).toBe('15:00');
  });
});
