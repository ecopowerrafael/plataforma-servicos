import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { afterEach, describe, expect, it } from 'vitest';

import { publicDirectoryRoutes } from './directory.routes.js';
import { type DirectoryLocationService } from './directory-location.service.js';
import { type DirectoryService } from './directory.service.js';

const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('directory sitemap route', () => {
  it('renders a directory sitemap index and paged XML children', async () => {
    const app = Fastify().withTypeProvider<ZodTypeProvider>();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    apps.push(app);
    await app.register(publicDirectoryRoutes, {
      service: {
        sitemapSummary: async () => ({ total: 1_001, pageSize: 1_000, pageCount: 2 }),
        sitemapPage: async (page: number) =>
          page === 1
            ? {
                total: 1_001,
                pageCount: 2,
                urls: [
                  { path: '/encontre', updatedAt: null },
                  {
                    path: '/encontre/barbearias/maceio-al',
                    updatedAt: new Date('2026-08-18T12:00:00.000Z'),
                  },
                ],
              }
            : page === 2
              ? {
                  total: 1_001,
                  pageCount: 2,
                  urls: [
                    {
                      path: '/encontre/barbearias/maceio-al/empresa',
                      updatedAt: new Date('2026-08-18T12:01:00.000Z'),
                    },
                  ],
                }
              : { total: 1_001, pageCount: 2, urls: [] },
      } as unknown as DirectoryService,
      locationService: {} as DirectoryLocationService,
    });
    const [index, first, second, missing, categories, citiesOne] = await Promise.all([
      app.inject('/sitemap-directory.xml'),
      app.inject('/sitemap-directory-1.xml'),
      app.inject('/sitemap-directory-2.xml'),
      app.inject('/sitemap-directory-3.xml'),
      app.inject('/sitemap-directory-categories.xml'),
      app.inject('/sitemap-directory-cities-1.xml'),
    ]);
    expect(index.statusCode).toBe(200);
    expect(index.headers['content-type']).toContain('application/xml');
    expect(index.body).toContain('<sitemapindex');
    expect(index.body).toContain('https://agendei.site/sitemap-directory-1.xml');
    expect(index.body).toContain('https://agendei.site/sitemap-directory-2.xml');
    expect(first.statusCode).toBe(200);
    expect(first.body).toContain('<urlset');
    expect(first.body).toContain('<loc>https://agendei.site/encontre/barbearias/maceio-al</loc>');
    expect(first.body).toContain('<lastmod>2026-08-18T12:00:00.000Z</lastmod>');
    expect(second.statusCode).toBe(200);
    expect(missing.statusCode).toBe(404);
    // Sufixos não numéricos (URLs antigas/erradas indexadas pelo Search
    // Console) devem virar 404 limpo, nunca VALIDATION_ERROR/400.
    expect(categories.statusCode).toBe(404);
    expect(citiesOne.statusCode).toBe(404);
  });
});
