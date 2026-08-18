import { describe, expect, it, vi } from 'vitest';

import { type PrismaClient } from '../../database-client/client.js';
import { DirectorySeoService } from './directory-seo.service.js';

describe('DirectorySeoService', () => {
  it('keeps missing Google credentials configurable instead of throwing', async () => {
    const client = { directorySeoSyncRun: { findFirst: vi.fn().mockResolvedValue(null) } } as unknown as PrismaClient;
    const service = new DirectorySeoService(client);
    expect(service.configurationStatus()).toEqual({ searchConsoleConfigured: false, indexNowConfigured: false });
    await expect(service.processSyncs()).resolves.toEqual({ processed: 0, configured: false });
  });

  it('queues one deduplicated IndexNow submission and processes it in a batch', async () => {
    const upsert = vi.fn().mockResolvedValue({ publicId: 'submission' }); const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const client = { seoUrlSubmission: { upsert, findMany: vi.fn().mockResolvedValue([{ id: 1n, url: 'https://agendei.site/encontre/barbearias/fortaleza-ce/a', provider: 'INDEXNOW', reason: 'UPDATED', status: 'PENDING', attempts: 0 }]), updateMany } } as unknown as PrismaClient;
    const service = new DirectorySeoService(client, { indexNowKey: 'indexnow-test-key' }, undefined, vi.fn().mockResolvedValue(new Response(null, { status: 202 })));
    await service.enqueueIndexNow('https://agendei.site/encontre/barbearias/fortaleza-ce/a', 'UPDATED', 1n);
    await service.enqueueIndexNow('https://agendei.site/encontre/barbearias/fortaleza-ce/a', 'UPDATED', 1n);
    expect(upsert).toHaveBeenCalledTimes(2);
    await expect(service.processIndexNow()).resolves.toEqual({ processed: 1, configured: true });
    expect(updateMany).toHaveBeenCalledTimes(2);
  });

  it('upserts only directory Search Console pages and maps an individual business', async () => {
    const dailyUpsert = vi.fn().mockResolvedValue({}); const queryUpsert = vi.fn().mockResolvedValue({}); const update = vi.fn().mockResolvedValue({});
    const run = { id: 1n, fromDate: new Date('2026-08-01T00:00:00.000Z'), toDate: new Date('2026-08-03T00:00:00.000Z') };
    const client = { directorySeoSyncRun: { findFirst: vi.fn().mockResolvedValue(run), update }, directoryCategory: { findUnique: vi.fn().mockResolvedValue({ id: 7n }) }, directoryBusiness: { findFirst: vi.fn().mockResolvedValue({ id: 9n }) }, directorySeoDailyMetric: { upsert: dailyUpsert }, directorySeoQueryMetric: { upsert: queryUpsert } } as unknown as PrismaClient;
    const google = { query: vi.fn().mockImplementation(async ({ dimensions }: { dimensions: string[] }) => dimensions.length === 2 ? [{ keys: ['2026-08-02', 'https://agendei.site/encontre/barbearias/fortaleza-ce/empresa-a'], clicks: 10, impressions: 100, ctr: 0.1, position: 3 }, { keys: ['2026-08-02', 'https://agendei.site/planos'], clicks: 99, impressions: 999, ctr: 0.1, position: 3 }] : [{ keys: ['2026-08-02', 'https://agendei.site/encontre/barbearias/fortaleza-ce/empresa-a', 'barbearia fortaleza'], clicks: 4, impressions: 40, ctr: 0.1, position: 2 }]), listSitemaps: vi.fn(), submitSitemap: vi.fn(), inspect: vi.fn() };
    const service = new DirectorySeoService(client, { siteUrl: 'sc-domain:agendei.site', accessToken: 'server-token' }, google);
    await expect(service.processSyncs()).resolves.toEqual({ processed: 1, configured: true });
    expect(dailyUpsert).toHaveBeenCalledTimes(1); expect(queryUpsert).toHaveBeenCalledTimes(1);
    expect(dailyUpsert.mock.calls[0][0].create).toMatchObject({ businessId: 9n, categoryId: 7n, citySlug: 'fortaleza-ce', clicks: 10, impressions: 100 });
  });

  it('calculates the aggregate funnel without mixing businesses', async () => {
    const client = { directoryBusiness: { findMany: vi.fn().mockResolvedValue([{ publicId: 'a', name: 'Empresa A', city: 'Fortaleza', state: 'CE', tenantId: null, category: { pluralName: 'Barbearias' }, seoMetrics: [{ impressions: 1000, clicks: 100, position: 4 }], events: [...Array.from({ length: 40 }, () => ({ type: 'BUSINESS_VIEW', visitorHash: null })), ...Array.from({ length: 10 }, (_, index) => ({ type: 'WHATSAPP_CLICK', visitorHash: `v-${index}` }))] }, { publicId: 'b', name: 'Empresa B', city: 'Fortaleza', state: 'CE', tenantId: 2n, category: { pluralName: 'Barbearias' }, seoMetrics: [{ impressions: 1, clicks: 0, position: 20 }], events: [] }] ) }, directorySeoSyncRun: { findFirst: vi.fn().mockResolvedValue(null) } } as unknown as PrismaClient;
    const overview = await new DirectorySeoService(client).overview();
    expect(overview.rows.find((row) => row.businessPublicId === 'a')).toMatchObject({ impressions: 1000, googleClicks: 100, googleCtr: 0.1, pageViews: 40, whatsappClicks: 10, uniqueWhatsappClicks: 10, whatsappConversion: 0.25 });
    expect(overview.rows.find((row) => row.businessPublicId === 'b')).toMatchObject({ pageViews: 0, whatsappClicks: 0 });
  });
});
