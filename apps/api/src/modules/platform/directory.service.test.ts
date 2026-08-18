import { describe, expect, it } from 'vitest';

import { looksLikeApproximateDirectoryDuplicate, normalizeDirectoryPhone, parseDirectoryXml } from './directory.service.js';

const xml = `<?xml version="1.0"?><local-commerce-data><cities><city ibge_code="2304400"><name>Fortaleza - CE</name><establishments><establishment local_id="1910"><business_type>Barbearia</business_type><segment_key>barbearia</segment_key><name>Mr. Barba</name><address>Av. Santos Dumont, 100, CEP 60150-161</address><phone>085987805630</phone><whatsapp>85987805630</whatsapp><quality><relevance_score>95</relevance_score><review_status>approved</review_status></quality></establishment></establishments></city></cities></local-commerce-data>`;

describe('Directory XML importer', () => {
  it('normalizes Brazilian phone numbers without duplicating country code', () => {
    expect(normalizeDirectoryPhone('85987805630')).toBe('5585987805630');
    expect(normalizeDirectoryPhone('+55 (85) 98780-5630')).toBe('5585987805630');
    expect(normalizeDirectoryPhone('123')).toBeNull();
  });

  it('reads establishments from the expected collector XML format', () => {
    expect(parseDirectoryXml(Buffer.from(xml))).toMatchObject([{ sourceLocalId: '1910', name: 'Mr. Barba', city: 'Fortaleza', state: 'CE', whatsapp: '5585987805630', relevanceScore: 95 }]);
  });

  it('rejects XML with DTD or external entities', () => {
    expect(() => parseDirectoryXml(Buffer.from('<!DOCTYPE test SYSTEM "https://example.com/x"><local-commerce-data/>'))).toThrow('XML válido');
  });

  it('detects an approximate name/address match without treating unrelated businesses as equal', () => {
    const record = parseDirectoryXml(Buffer.from(xml))[0];
    expect(looksLikeApproximateDirectoryDuplicate(record, { name: 'Mr. Barba Barbearia', rawAddress: 'Av. Santos Dumont, 100 - Aldeota, Fortaleza - CE' })).toBe(true);
    expect(looksLikeApproximateDirectoryDuplicate(record, { name: 'Outro estabelecimento', rawAddress: 'Rua distante, 999 - Centro, Fortaleza - CE' })).toBe(false);
  });
});
