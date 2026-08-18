import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { DirectoryService } from './directory.service.js';
import { type DirectorySeoService } from './directory-seo.service.js';
import { platformAuthenticationPlugin } from './platform-auth.plugin.js';
import { type PlatformService } from './platform.service.js';
import { type AuthService } from '../auth/auth.service.js';

const importParams = z.object({ publicId: z.uuid() });
const pagination = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(20) });
const metricsQuery = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), categorySlug: z.string().optional(), state: z.string().length(2).optional(), city: z.string().optional(), search: z.string().optional(), hasTenant: z.enum(['true', 'false']).transform((value) => value === 'true').optional(), businessPublicId: z.uuid().optional() });
const seoQuery = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), categorySlug: z.string().optional(), city: z.string().optional(), citySlug: z.string().optional(), search: z.string().optional(), hasTenant: z.enum(['true', 'false']).transform((value) => value === 'true').optional() });

interface DirectoryRoutesOptions { service: DirectoryService; seo?: DirectorySeoService; platformService: PlatformService; authService: AuthService; cookieName: string }

export const directoryRoutes: FastifyPluginAsyncZod<DirectoryRoutesOptions> = async (app, options) => {
  await app.register(platformAuthenticationPlugin, { platformService: options.platformService, authService: options.authService, cookieName: options.cookieName });
  const allow = (request: { platformAuth: Parameters<PlatformService['requirePermission']>[0] }, permission: Parameters<PlatformService['requirePermission']>[1]) => options.platformService.requirePermission(request.platformAuth, permission);
  app.post('/platform/directory/imports/analyze', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request) => {
    allow(request, 'platform.tenant.update');
    const file = await request.file();
    if (file === undefined || !/\.xml$/iu.test(file.filename)) throw new Error('Envie um arquivo XML.');
    return options.service.analyze(file.filename, await file.toBuffer());
  });
  app.get('/platform/directory/imports/:publicId', { schema: { params: importParams } }, (request) => { allow(request, 'platform.tenant.read'); return options.service.preview(request.params.publicId); });
  app.get('/platform/directory/imports', {}, (request) => { allow(request, 'platform.tenant.read'); return options.service.imports(); });
  app.post('/platform/directory/imports/:publicId/configure', { schema: { params: importParams, body: z.object({ assignments: z.array(z.object({ detected: z.string().min(1).max(160), categorySlug: z.string().min(2).max(120) })).max(100), newCategories: z.array(z.object({ name: z.string().min(2).max(120), singularName: z.string().min(2).max(120), pluralName: z.string().min(2).max(120), slug: z.string().min(2).max(120), active: z.boolean().optional(), indexable: z.boolean().optional() })).max(20).default([]) }) } }, (request) => { allow(request, 'platform.tenant.update'); return options.service.configure(request.params.publicId, request.body.assignments, request.body.newCategories); });
  app.post('/platform/directory/categories', { schema: { body: z.object({ name: z.string().min(2).max(120), singularName: z.string().min(2).max(120), pluralName: z.string().min(2).max(120), slug: z.string().min(2).max(120), description: z.string().max(2000).optional(), icon: z.string().max(40).optional(), active: z.boolean().optional(), indexable: z.boolean().optional() }) } }, (request) => { allow(request, 'platform.tenant.update'); return options.service.createCategory(request.body); });
  app.post('/platform/directory/imports/:publicId/process-batch', { schema: { params: importParams } }, (request) => { allow(request, 'platform.tenant.update'); return options.service.processBatch(request.params.publicId); });
  app.post('/platform/directory/imports/:publicId/process', { schema: { params: importParams } }, (request) => { allow(request, 'platform.tenant.update'); return options.service.processBatch(request.params.publicId); });
  app.post('/platform/directory/imports/:publicId/pause', { schema: { params: importParams } }, (request) => { allow(request, 'platform.tenant.update'); return options.service.pause(request.params.publicId); });
  app.post('/platform/directory/imports/:publicId/resume', { schema: { params: importParams } }, (request) => { allow(request, 'platform.tenant.update'); return options.service.resume(request.params.publicId); });
  app.post('/platform/directory/imports/:publicId/retry-errors', { schema: { params: importParams } }, (request) => { allow(request, 'platform.tenant.update'); return options.service.retryErrors(request.params.publicId); });
  app.get('/platform/directory/imports/:publicId/errors', { schema: { params: importParams } }, (request) => { allow(request, 'platform.tenant.read'); return options.service.importErrors(request.params.publicId); });
  app.get('/platform/directory/categories', {}, (request) => { allow(request, 'platform.tenant.read'); return options.service.categories(); });
  app.get('/platform/directory/admin/categories', {}, (request) => { allow(request, 'platform.tenant.read'); return options.service.adminCategories(); });
  app.patch('/platform/directory/categories/:publicId', { schema: { params: importParams, body: z.object({ name: z.string().min(2).max(120).optional(), singularName: z.string().min(2).max(120).optional(), pluralName: z.string().min(2).max(120).optional(), description: z.string().max(2000).nullable().optional(), icon: z.string().max(40).nullable().optional(), active: z.boolean().optional(), indexable: z.boolean().optional(), sortOrder: z.number().int().min(0).max(10000).optional() }) } }, (request) => { allow(request, 'platform.tenant.update'); return options.service.updateCategory(request.params.publicId, request.body); });
  app.get('/platform/directory/businesses', { schema: { querystring: pagination } }, (request) => { allow(request, 'platform.tenant.read'); return options.service.adminBusinesses(request.query.page, request.query.limit); });
  app.patch('/platform/directory/businesses/:publicId', { schema: { params: importParams, body: z.object({ active: z.boolean().optional(), indexable: z.boolean().optional() }) } }, (request) => { allow(request, 'platform.tenant.update'); return options.service.updateBusiness(request.params.publicId, request.body); });
  app.get('/platform/directory/metrics', { schema: { querystring: metricsQuery } }, (request) => { allow(request, 'platform.tenant.read'); return options.service.metrics(request.query); });
  app.get('/platform/directory/metrics.csv', { schema: { querystring: metricsQuery } }, async (request, reply) => { allow(request, 'platform.tenant.read'); const metrics = await options.service.metrics(request.query); const quote = (value: string | number | boolean | Date | null) => `"${String(value ?? '').replace(/"/gu, '""')}"`; const lines = [['empresa','categoria','cidade','telefone','whatsapp','cliques','cliques_unicos','visualizacoes','ctr','ultimo_clique','tenant_vinculado'].join(','), ...metrics.rows.map((row) => [row.business,row.category,`${row.city}/${row.state}`,row.phone,row.whatsapp,row.whatsappClicks,row.uniqueWhatsappClicks,row.pageViews,row.whatsappCtr,row.lastWhatsappClickAt,row.tenantLinked].map(quote).join(','))]; return reply.type('text/csv; charset=utf-8').send(lines.join('\n')); });
  const seo = () => { if (options.seo === undefined) throw new Error('SEO do Diretório indisponível.'); return options.seo; };
  app.get('/platform/directory/seo/status', {}, (request) => { allow(request, 'platform.tenant.read'); return seo().status(); });
  app.get('/platform/directory/seo/overview', { schema: { querystring: seoQuery } }, (request) => { allow(request, 'platform.tenant.read'); return seo().overview(request.query); });
  app.get('/platform/directory/seo/businesses', { schema: { querystring: seoQuery } }, async (request) => { allow(request, 'platform.tenant.read'); return (await seo().overview(request.query)).rows; });
  app.get('/platform/directory/seo/queries', { schema: { querystring: seoQuery } }, (request) => { allow(request, 'platform.tenant.read'); return seo().queries(request.query); });
  app.get('/platform/directory/seo/businesses/:publicId', { schema: { params: importParams } }, (request) => { allow(request, 'platform.tenant.read'); return seo().businessDetail(request.params.publicId); });
  app.get('/platform/directory/seo/businesses.csv', { schema: { querystring: seoQuery } }, async (request, reply) => { allow(request, 'platform.tenant.read'); const rows = (await seo().overview(request.query)).rows; const quote = (value: string | number | boolean) => `"${String(value).replace(/"/gu, '""')}"`; const lines = [['empresa','categoria','cidade','uf','impressoes','google_clicks','google_ctr','position','page_views','whatsapp_clicks','unique_whatsapp_clicks','whatsapp_conversion','tenant_linked'].join(','), ...rows.map((row) => [row.business,row.category,row.city,row.state,row.impressions,row.googleClicks,row.googleCtr,row.position,row.pageViews,row.whatsappClicks,row.uniqueWhatsappClicks,row.whatsappConversion,row.tenantLinked].map(quote).join(','))]; return reply.type('text/csv; charset=utf-8').send(lines.join('\n')); });
  app.post('/platform/directory/seo/search-console/sync', {}, (request) => { allow(request, 'platform.tenant.update'); return seo().enqueueSync(); });
  app.get('/platform/directory/seo/sitemaps', {}, (request) => { allow(request, 'platform.tenant.read'); return seo().sitemapStatus(); });
  app.post('/platform/directory/seo/sitemaps/submit', {}, (request) => { allow(request, 'platform.tenant.update'); return seo().submitDirectorySitemap(); });
  app.get('/platform/directory/seo/submissions', {}, (request) => { allow(request, 'platform.tenant.read'); return seo().submissions(); });
  app.post('/platform/directory/seo/submissions/:publicId/retry', { schema: { params: importParams } }, (request) => { allow(request, 'platform.tenant.update'); return seo().retrySubmission(request.params.publicId); });
  app.post('/platform/directory/seo/indexnow/enqueue', { schema: { body: z.object({ url: z.url() }) } }, (request) => { allow(request, 'platform.tenant.update'); return seo().enqueueManual(request.body.url); });
  app.get('/platform/directory/seo/inspections', {}, (request) => { allow(request, 'platform.tenant.read'); return seo().inspections(); });
  app.post('/platform/directory/seo/inspections', { schema: { body: z.object({ url: z.url(), priority: z.number().int().min(0).max(1000).default(0) }) } }, (request) => { allow(request, 'platform.tenant.update'); return seo().enqueueInspection(request.body.url, request.body.priority); });
};

interface PublicDirectoryRoutesOptions { service: DirectoryService; indexNowKey?: string }
export const publicDirectoryRoutes: FastifyPluginAsyncZod<PublicDirectoryRoutesOptions> = async (app, options) => {
  if (options.indexNowKey !== undefined) app.get(`/${options.indexNowKey}.txt`, async (_request, reply) => reply.type('text/plain; charset=utf-8').send(options.indexNowKey));
  const eventBody = z.object({ type: z.enum(['BUSINESS_VIEW', 'WHATSAPP_CLICK']), visitorId: z.string().max(200).optional(), sessionId: z.string().max(200).optional(), sourcePath: z.string().min(1).max(500), referrer: z.string().max(500).optional(), utmSource: z.string().max(160).optional(), utmMedium: z.string().max(160).optional(), utmCampaign: z.string().max(160).optional() });
  app.post('/public/directory/businesses/:publicId/events', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } }, schema: { params: importParams, body: eventBody } }, async (request, reply) => { await options.service.recordEvent(request.params.publicId, request.body); return reply.status(202).send({ accepted: true }); });
  app.get('/sitemap-directory.xml', async (_request, reply) => {
    const escape = (value: string) => value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
    const urls = await options.service.sitemapUrls();
    return reply.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>https://agendei.site${escape(url.path)}</loc>${url.updatedAt === null ? '' : `<lastmod>${url.updatedAt.toISOString()}</lastmod>`}</url>`).join('')}</urlset>`);
  });
  app.get('/public/directory/categories', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async () => ({ categories: await options.service.categories() }));
  app.get('/public/directory/categories/:categorySlug/cities', { schema: { params: z.object({ categorySlug: z.string().min(1).max(120) }) } }, (request) => options.service.categoryCities(request.params.categorySlug));
  app.get('/public/directory/:categorySlug/:citySlug', { schema: { params: z.object({ categorySlug: z.string().min(1).max(120), citySlug: z.string().min(1).max(180) }), querystring: pagination } }, (request) => options.service.cityBusinesses(request.params.categorySlug, request.params.citySlug, request.query.page, request.query.limit));
  app.get('/public/directory/:categorySlug/:citySlug/:businessSlug', { schema: { params: z.object({ categorySlug: z.string().min(1).max(120), citySlug: z.string().min(1).max(180), businessSlug: z.string().min(1).max(180) }) } }, (request) => options.service.business(request.params.categorySlug, request.params.citySlug, request.params.businessSlug));
};
