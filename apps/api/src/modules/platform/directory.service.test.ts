import { describe, expect, it, vi } from 'vitest';

import {
  DIRECTORY_SITEMAP_PAGE_SIZE,
  DirectoryService,
  aggregateDirectoryMetrics,
  directorySitemapPageCount,
  extractDirectoryAddressParts,
  looksLikeApproximateDirectoryDuplicate,
  normalizeDirectoryPhone,
  parseDirectoryXml,
} from './directory.service.js';
import { type PrismaClient } from '../../database-client/client.js';

const xml = `<?xml version="1.0"?><local-commerce-data><cities><city ibge_code="2304400"><name>Fortaleza - CE</name><establishments><establishment local_id="1910"><business_type>Barbearia</business_type><segment_key>barbearia</segment_key><name>Mr. Barba</name><address>Av. Santos Dumont, 100, CEP 60150-161</address><phone>085987805630</phone><whatsapp>85987805630</whatsapp><quality><relevance_score>95</relevance_score><review_status>approved</review_status></quality></establishment></establishments></city></cities></local-commerce-data>`;

describe('Directory XML importer', () => {
  it('normalizes Brazilian phone numbers without duplicating country code', () => {
    expect(normalizeDirectoryPhone('85987805630')).toBe('5585987805630');
    expect(normalizeDirectoryPhone('+55 (85) 98780-5630')).toBe('5585987805630');
    expect(normalizeDirectoryPhone('085987805630')).toBe('5585987805630');
    expect(normalizeDirectoryPhone('123')).toBeNull();
  });

  it('reads establishments from the expected collector XML format', () => {
    expect(parseDirectoryXml(Buffer.from(xml))).toMatchObject([
      {
        sourceLocalId: '1910',
        name: 'Mr. Barba',
        city: 'Fortaleza',
        state: 'CE',
        whatsapp: '5585987805630',
        relevanceScore: 95,
      },
    ]);
  });

  it('extracts the complete CEP from real collector addresses', () => {
    expect(
      extractDirectoryAddressParts(
        'Conj. Tupã Mirim, Rua 122 - n 144 - Parque Dois Irmãos, Fortaleza - CE, 60744-600',
      ).postalCode,
    ).toBe('60744600');
  });

  it('rejects XML with DTD or external entities', () => {
    expect(() =>
      parseDirectoryXml(
        Buffer.from('<!DOCTYPE test SYSTEM "https://example.com/x"><local-commerce-data/>'),
      ),
    ).toThrow('XML válido');
  });

  it('detects an approximate name/address match without treating unrelated businesses as equal', () => {
    const record = parseDirectoryXml(Buffer.from(xml))[0];
    expect(
      looksLikeApproximateDirectoryDuplicate(record, {
        name: 'Mr. Barba Barbearia',
        rawAddress: 'Av. Santos Dumont, 100 - Aldeota, Fortaleza - CE',
      }),
    ).toBe(true);
    expect(
      looksLikeApproximateDirectoryDuplicate(record, {
        name: 'Outro estabelecimento',
        rawAddress: 'Rua distante, 999 - Centro, Fortaleza - CE',
      }),
    ).toBe(false);
  });
});

describe('Directory import batches', () => {
  it('checks approximate duplicates without a MySQL LIKE comparison', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 1n,
        name: 'Mr. Barba Barbearia',
        rawAddress: 'Av. Santos Dumont, 100 - Aldeota, Fortaleza - CE',
      },
    ]);
    const client = { directoryBusiness: { findMany } } as unknown as PrismaClient;
    const service = new DirectoryService(client);
    const result = await service['approximateDuplicate'](
      1n,
      parseDirectoryXml(Buffer.from(xml))[0],
    );
    expect(result).toMatchObject({ id: 1n });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { categoryId: 1n, city: 'Fortaleza', state: 'CE' } }),
    );
  });

  it('claims one conservative batch and never asks for more than 25 pending items', async () => {
    const directoryImport = {
      id: 1n,
      publicId: '00000000-0000-4000-8000-000000000010',
      status: 'QUEUED',
      totalSelected: 0,
      totalFound: 0,
      totalCreated: 0,
      totalUpdated: 0,
      totalUnchanged: 0,
      totalDuplicates: 0,
      processedCount: 0,
      filename: 'barbearias.xml',
    };
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(directoryImport)
      .mockResolvedValue({ ...directoryImport, items: [] });
    const findMany = vi.fn().mockResolvedValue([]);
    const client = {
      directoryImport: {
        findUnique,
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue(directoryImport),
      },
      directoryImportItem: {
        findMany,
        count: vi.fn().mockResolvedValue(0),
        groupBy: vi.fn().mockResolvedValue([]),
      },
      directoryCategory: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient;
    await new DirectoryService(client).processBatch(directoryImport.publicId);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 25, where: expect.objectContaining({ status: 'SKIPPED' }) }),
    );
  });
});

describe('Directory sitemap', () => {
  function serviceForIndexedUrls(total: number) {
    const businessCount = total === 0 ? 0 : total - 1;
    const client = {
      directoryCategory: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
      directoryBusiness: {
        count: vi.fn().mockResolvedValue(businessCount),
        groupBy: vi.fn().mockResolvedValue([]),
        findMany: vi.fn().mockImplementation(({ skip, take }: { skip: number; take: number }) =>
          Array.from({ length: take }, (_, index) => ({
            slug: `empresa-${String(skip + index + 1)}`,
            citySlug: 'fortaleza-ce',
            updatedAt: new Date('2026-08-18T12:00:00.000Z'),
            category: { slug: 'barbearias' },
          })),
        ),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ total: 0n }]),
    } as unknown as PrismaClient;
    return new DirectoryService(client);
  }

  it.each([
    [0, 0],
    [1, 1],
    [999, 1],
    [1_000, 1],
    [1_001, 2],
    [4_327, 5],
    [5_001, 6],
  ])('calculates %i indexable URLs as %i sitemap batches', (total, expectedPages) => {
    expect(directorySitemapPageCount(total)).toBe(expectedPages);
  });

  it.each([0, 2, 999, 1_000, 1_001, 4_327, 5_001])(
    'splits %i indexable URLs into stable batches of at most 1,000',
    async (total) => {
      const service = serviceForIndexedUrls(total);
      const summary = await service.sitemapSummary();
      expect(summary).toMatchObject({
        total,
        pageSize: DIRECTORY_SITEMAP_PAGE_SIZE,
        pageCount: Math.ceil(total / DIRECTORY_SITEMAP_PAGE_SIZE),
      });

      const pages = await Promise.all(
        Array.from({ length: summary.pageCount }, (_, index) => service.sitemapPage(index + 1)),
      );
      const urls = pages.flatMap((page) => page.urls.map((url) => url.path));
      expect(pages.every((page) => page.urls.length <= DIRECTORY_SITEMAP_PAGE_SIZE)).toBe(true);
      expect(new Set(urls).size).toBe(total);
      expect(urls).toHaveLength(total);
      expect(urls).toEqual(
        total === 0
          ? []
          : [
              '/encontre',
              ...Array.from(
                { length: total - 1 },
                (_, index) => `/encontre/barbearias/fortaleza-ce/empresa-${String(index + 1)}`,
              ),
            ],
      );
    },
  );

  it('creates and removes batches automatically as the indexable total crosses a page boundary', async () => {
    const service = serviceForIndexedUrls(1_001);
    await expect(service.sitemapSummary()).resolves.toMatchObject({ pageCount: 2 });
    const reduced = serviceForIndexedUrls(1_000);
    await expect(reduced.sitemapSummary()).resolves.toMatchObject({ pageCount: 1 });
  });
});

describe('Directory telemetry aggregation', () => {
  it('keeps business events separate, calculates CTR, and deduplicates unique clicks', () => {
    const metrics = aggregateDirectoryMetrics([
      {
        type: 'BUSINESS_VIEW',
        visitorHash: 'visitor-a',
        createdAt: new Date('2026-08-18T10:00:00.000Z'),
      },
      {
        type: 'WHATSAPP_CLICK',
        visitorHash: 'visitor-a',
        createdAt: new Date('2026-08-18T10:01:00.000Z'),
      },
      {
        type: 'WHATSAPP_CLICK',
        visitorHash: 'visitor-a',
        createdAt: new Date('2026-08-18T10:02:00.000Z'),
      },
      {
        type: 'WHATSAPP_CLICK',
        visitorHash: 'visitor-b',
        createdAt: new Date('2026-08-19T10:02:00.000Z'),
      },
    ]);
    expect(metrics).toMatchObject({
      pageViews: 1,
      whatsappClicks: 3,
      uniqueWhatsappClicks: 2,
      whatsappCtr: 3,
      lastWhatsappClickAt: new Date('2026-08-19T10:02:00.000Z'),
    });
    expect(metrics.daily).toEqual([
      { date: '2026-08-18', pageViews: 1, whatsappClicks: 2 },
      { date: '2026-08-19', pageViews: 0, whatsappClicks: 1 },
    ]);
  });

  it('avoids division by zero when a business only has clicks', () => {
    expect(
      aggregateDirectoryMetrics([
        {
          type: 'WHATSAPP_CLICK',
          visitorHash: 'visitor-a',
          createdAt: new Date('2026-08-18T10:00:00.000Z'),
        },
      ]).whatsappCtr,
    ).toBe(0);
  });

  it('keeps the metrics of two businesses isolated and ranks an unlinked prospect', async () => {
    const client = {
      directoryBusiness: {
        findMany: async () => [
          {
            publicId: '00000000-0000-4000-8000-000000000001',
            name: 'Barbearia A',
            city: 'Fortaleza',
            state: 'CE',
            phone: null,
            whatsapp: '5585000000001',
            tenantId: null,
            category: { pluralName: 'Barbearias' },
            events: [
              {
                type: 'BUSINESS_VIEW',
                visitorHash: 'a',
                createdAt: new Date('2026-08-18T10:00:00.000Z'),
              },
              {
                type: 'WHATSAPP_CLICK',
                visitorHash: 'a',
                createdAt: new Date('2026-08-18T10:01:00.000Z'),
              },
            ],
          },
          {
            publicId: '00000000-0000-4000-8000-000000000002',
            name: 'Barbearia B',
            city: 'Fortaleza',
            state: 'CE',
            phone: null,
            whatsapp: '5585000000002',
            tenantId: 2n,
            category: { pluralName: 'Barbearias' },
            events: [
              {
                type: 'WHATSAPP_CLICK',
                visitorHash: 'b',
                createdAt: new Date('2026-08-18T10:02:00.000Z'),
              },
              {
                type: 'WHATSAPP_CLICK',
                visitorHash: 'c',
                createdAt: new Date('2026-08-18T10:03:00.000Z'),
              },
            ],
          },
        ],
      },
    } as unknown as PrismaClient;
    const metrics = await new DirectoryService(client).metrics();
    expect(metrics.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          business: 'Barbearia A',
          pageViews: 1,
          whatsappClicks: 1,
          uniqueWhatsappClicks: 1,
          whatsappCtr: 1,
        }),
        expect.objectContaining({
          business: 'Barbearia B',
          pageViews: 0,
          whatsappClicks: 2,
          uniqueWhatsappClicks: 2,
          whatsappCtr: 0,
        }),
      ]),
    );
    expect(metrics.ranking).toEqual([
      expect.objectContaining({ business: 'Barbearia A', whatsappClicks: 1, tenantLinked: false }),
    ]);
  });

  it('applies the requested period and business filters before aggregating metrics', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const client = { directoryBusiness: { findMany } } as unknown as PrismaClient;
    await new DirectoryService(client).metrics({
      from: new Date('2026-08-10T00:00:00.000Z'),
      to: new Date('2026-08-18T00:00:00.000Z'),
      businessPublicId: '00000000-0000-4000-8000-000000000001',
      hasTenant: false,
    });
    const call = findMany.mock.calls[0][0] as {
      where: { publicId: string; tenantId: null };
      include: { events: { where: { createdAt: { gte: Date; lte: Date } } } };
    };
    expect(call.where).toMatchObject({
      publicId: '00000000-0000-4000-8000-000000000001',
      tenantId: null,
    });
    expect(call.include.events.where.createdAt).toEqual({
      gte: new Date('2026-08-10T00:00:00.000Z'),
      lte: new Date('2026-08-18T23:59:59.999Z'),
    });
  });
});
