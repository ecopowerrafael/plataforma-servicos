import { describe, expect, it } from 'vitest';

import { DirectoryService, aggregateDirectoryMetrics, looksLikeApproximateDirectoryDuplicate, normalizeDirectoryPhone, parseDirectoryXml } from './directory.service.js';
import { type PrismaClient } from '../../database-client/client.js';

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

describe('Directory telemetry aggregation', () => {
  it('keeps business events separate, calculates CTR, and deduplicates unique clicks', () => {
    const metrics = aggregateDirectoryMetrics([
      { type: 'BUSINESS_VIEW', visitorHash: 'visitor-a', createdAt: new Date('2026-08-18T10:00:00.000Z') },
      { type: 'WHATSAPP_CLICK', visitorHash: 'visitor-a', createdAt: new Date('2026-08-18T10:01:00.000Z') },
      { type: 'WHATSAPP_CLICK', visitorHash: 'visitor-a', createdAt: new Date('2026-08-18T10:02:00.000Z') },
      { type: 'WHATSAPP_CLICK', visitorHash: 'visitor-b', createdAt: new Date('2026-08-19T10:02:00.000Z') },
    ]);
    expect(metrics).toMatchObject({ pageViews: 1, whatsappClicks: 3, uniqueWhatsappClicks: 2, whatsappCtr: 3, lastWhatsappClickAt: new Date('2026-08-19T10:02:00.000Z') });
    expect(metrics.daily).toEqual([{ date: '2026-08-18', pageViews: 1, whatsappClicks: 2 }, { date: '2026-08-19', pageViews: 0, whatsappClicks: 1 }]);
  });

  it('avoids division by zero when a business only has clicks', () => {
    expect(aggregateDirectoryMetrics([{ type: 'WHATSAPP_CLICK', visitorHash: 'visitor-a', createdAt: new Date('2026-08-18T10:00:00.000Z') }]).whatsappCtr).toBe(0);
  });

  it('keeps the metrics of two businesses isolated and ranks an unlinked prospect', async () => {
    const client = { directoryBusiness: { findMany: async () => [{ publicId: '00000000-0000-4000-8000-000000000001', name: 'Barbearia A', city: 'Fortaleza', state: 'CE', phone: null, whatsapp: '5585000000001', tenantId: null, category: { pluralName: 'Barbearias' }, events: [{ type: 'BUSINESS_VIEW', visitorHash: 'a', createdAt: new Date('2026-08-18T10:00:00.000Z') }, { type: 'WHATSAPP_CLICK', visitorHash: 'a', createdAt: new Date('2026-08-18T10:01:00.000Z') }] }, { publicId: '00000000-0000-4000-8000-000000000002', name: 'Barbearia B', city: 'Fortaleza', state: 'CE', phone: null, whatsapp: '5585000000002', tenantId: 2n, category: { pluralName: 'Barbearias' }, events: [{ type: 'WHATSAPP_CLICK', visitorHash: 'b', createdAt: new Date('2026-08-18T10:02:00.000Z') }, { type: 'WHATSAPP_CLICK', visitorHash: 'c', createdAt: new Date('2026-08-18T10:03:00.000Z') }] }] } } as unknown as PrismaClient;
    const metrics = await new DirectoryService(client).metrics();
    expect(metrics.rows).toEqual(expect.arrayContaining([expect.objectContaining({ business: 'Barbearia A', pageViews: 1, whatsappClicks: 1, uniqueWhatsappClicks: 1, whatsappCtr: 1 }), expect.objectContaining({ business: 'Barbearia B', pageViews: 0, whatsappClicks: 2, uniqueWhatsappClicks: 2, whatsappCtr: 0 })]));
    expect(metrics.ranking).toEqual([expect.objectContaining({ business: 'Barbearia A', whatsappClicks: 1, tenantLinked: false })]);
  });
});
