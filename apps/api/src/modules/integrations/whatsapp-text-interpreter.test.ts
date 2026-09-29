import { describe, expect, it } from 'vitest';
import { interpretText, normalizePortugueseText } from './whatsapp-text-interpreter.js';

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
  it('combines short messages as one interpretation', () => expect(interpretText({ messages: [{ text: 'quero cortar' }, { text: 'amanhã' }, { text: 'de manhã' }], catalog, aliases })).toMatchObject({ intent: 'BOOKING', entities: { serviceName: 'Corte masculino', date: 'TOMORROW', dayPeriod: 'MORNING' } }));
  it('does not confirm a payment from text', () => expect(interpretText({ text: 'já paguei' })).toMatchObject({ intent: 'UNKNOWN', confidence: 0.35 }));
  it('does not treat vague uncertainty as high-confidence booking', () => expect(interpretText({ text: 'amanhã talvez eu passe aí' }).confidence).toBeLessThan(0.9));
  it('extracts professional and normalized time', () => expect(interpretText({ text: 'quero cortar com o João amanhã às 15h', catalog, aliases })).toMatchObject({ intent: 'BOOKING', entities: { serviceName: 'Corte masculino', professionalName: 'joao', date: 'TOMORROW', time: '15:00' } }));
  it('parses spoken afternoon time and explicit dates', () => expect(interpretText({ text: 'tem horário com Maria dia 30/09 às 3 da tarde', catalog: { professionals: [{ publicId: 'pro-3', name: 'Maria' }] } })).toMatchObject({ intent: 'AVAILABILITY', entities: { professionalName: 'Maria', date: '30/09', time: '15:00' } }));
  it('resolves unique real catalog entities and leaves ambiguous names unresolved', () => {
    expect(interpretText({ text: 'quero cortar com João', catalog, aliases }).entities).toMatchObject({ serviceId: 'svc-1', professionalName: 'joao' });
    expect(interpretText({ text: 'quero cortar com João Silva', catalog, aliases }).entities.professionalId).toBe('pro-1');
  });
});
