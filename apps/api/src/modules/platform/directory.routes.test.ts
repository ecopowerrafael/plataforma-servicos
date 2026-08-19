import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { afterEach, describe, expect, it } from 'vitest';

import { publicDirectoryRoutes } from './directory.routes.js';
import { type DirectoryLocationService } from './directory-location.service.js';
import { type DirectoryService } from './directory.service.js';

const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

describe('directory sitemap route', () => {
  it('renders canonical URLs and relevant lastmod values', async () => {
    const app = Fastify().withTypeProvider<ZodTypeProvider>(); app.setValidatorCompiler(validatorCompiler); app.setSerializerCompiler(serializerCompiler); apps.push(app);
    await app.register(publicDirectoryRoutes, { service: { sitemapUrls: async () => [{ path: '/encontre', updatedAt: null }, { path: '/encontre/barbearias/maceio-al', updatedAt: new Date('2026-08-18T12:00:00.000Z') }] } as unknown as DirectoryService, locationService: {} as DirectoryLocationService });
    const response = await app.inject('/sitemap-directory.xml');
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/xml');
    expect(response.body).toContain('<loc>https://agendei.site/encontre/barbearias/maceio-al</loc>');
    expect(response.body).toContain('<lastmod>2026-08-18T12:00:00.000Z</lastmod>');
  });
});
