import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { AppError } from '../../errors/AppError.js';
import {
  DirectoryService,
  DIRECTORY_SITEMAP_PAGE_SIZE,
  directorySitemapPageCount,
} from './directory.service.js';
import { type DirectoryLocationService } from './directory-location.service.js';
import { type DirectorySeoService } from './directory-seo.service.js';
import {
  evaluateDirectoryBusinessSeo,
  type DirectorySeoEligibilityReason,
} from './directory-seo-quality.js';
import { platformAuthenticationPlugin } from './platform-auth.plugin.js';
import { type PlatformService } from './platform.service.js';
import { type AuthService } from '../auth/auth.service.js';
import {
  processDirectoryCityAggregateJobs,
  getDirectoryCityAggregateJobStats,
  retryFailedDirectoryCityAggregateJobs,
} from './directory-city-aggregate-job.js';
import {
  processDirectorySeoEligibilityBatch,
  markCategoryForSeoRecalculation,
} from './directory-seo-backfill.js';

const importParams = z.object({ publicId: z.uuid() });
const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(180).optional(),
  categorySlug: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().length(2).toUpperCase().optional(),
  active: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  indexable: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});
const metricsQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  categorySlug: z.string().optional(),
  state: z.string().length(2).optional(),
  city: z.string().optional(),
  search: z.string().optional(),
  hasTenant: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  businessPublicId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
const seoQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  categorySlug: z.string().optional(),
  city: z.string().optional(),
  citySlug: z.string().optional(),
  search: z.string().optional(),
  hasTenant: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});
function overviewInput(query: z.infer<typeof seoQuery>) {
  return {
    ...(query.from === undefined ? {} : { from: query.from }),
    ...(query.to === undefined ? {} : { to: query.to }),
    ...(query.categorySlug === undefined ? {} : { categorySlug: query.categorySlug }),
    ...(query.city === undefined ? {} : { city: query.city }),
    ...(query.search === undefined ? {} : { search: query.search }),
    ...(query.hasTenant === undefined ? {} : { hasTenant: query.hasTenant }),
  };
}
function queriesInput(query: z.infer<typeof seoQuery>) {
  return {
    ...(query.from === undefined ? {} : { from: query.from }),
    ...(query.to === undefined ? {} : { to: query.to }),
    ...(query.categorySlug === undefined ? {} : { categorySlug: query.categorySlug }),
    ...(query.citySlug === undefined ? {} : { citySlug: query.citySlug }),
  };
}

interface DirectoryRoutesOptions {
  service: DirectoryService;
  locationService: DirectoryLocationService;
  seo?: DirectorySeoService;
  platformService: PlatformService;
  authService: AuthService;
  cookieName: string;
}

export const directoryRoutes: FastifyPluginAsyncZod<DirectoryRoutesOptions> = async (
  app,
  options,
) => {
  await app.register(platformAuthenticationPlugin, {
    platformService: options.platformService,
    authService: options.authService,
    cookieName: options.cookieName,
  });
  const allow = (
    request: { platformAuth: Parameters<PlatformService['requirePermission']>[0] },
    permission: Parameters<PlatformService['requirePermission']>[1],
  ) => options.platformService.requirePermission(request.platformAuth, permission);
  app.post(
    '/platform/directory/imports/analyze',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request) => {
      allow(request, 'platform.tenant.update');
      const file = await request.file();
      if (file === undefined || !/\.xml$/iu.test(file.filename))
        throw new Error('Envie um arquivo XML.');
      return options.service.analyze(file.filename, await file.toBuffer());
    },
  );
  app.get(
    '/platform/directory/imports/:publicId',
    { schema: { params: importParams } },
    (request) => {
      allow(request, 'platform.tenant.read');
      return options.service.preview(request.params.publicId);
    },
  );
  app.get('/platform/directory/imports', {}, (request) => {
    allow(request, 'platform.tenant.read');
    return options.service.imports();
  });
  app.post(
    '/platform/directory/imports/:publicId/configure',
    {
      schema: {
        params: importParams,
        body: z.object({
          assignments: z
            .array(
              z.object({
                detected: z.string().min(1).max(160),
                categorySlug: z.string().min(2).max(120),
              }),
            )
            .max(100),
          newCategories: z
            .array(
              z.object({
                name: z.string().min(2).max(120),
                singularName: z.string().min(2).max(120),
                pluralName: z.string().min(2).max(120),
                slug: z.string().min(2).max(120),
                active: z.boolean().optional(),
                indexable: z.boolean().optional(),
              }),
            )
            .max(20)
            .default([]),
        }),
      },
    },
    (request) => {
      allow(request, 'platform.tenant.update');
      return options.service.configure(
        request.params.publicId,
        request.body.assignments,
        request.body.newCategories,
      );
    },
  );
  app.post(
    '/platform/directory/categories',
    {
      schema: {
        body: z.object({
          name: z.string().min(2).max(120),
          singularName: z.string().min(2).max(120),
          pluralName: z.string().min(2).max(120),
          slug: z.string().min(2).max(120),
          description: z.string().max(2000).optional(),
          icon: z.string().max(40).optional(),
          active: z.boolean().optional(),
          indexable: z.boolean().optional(),
        }),
      },
    },
    (request) => {
      allow(request, 'platform.tenant.update');
      return options.service.createCategory(request.body);
    },
  );
  app.post(
    '/platform/directory/imports/:publicId/process-batch',
    { schema: { params: importParams } },
    (request) => {
      allow(request, 'platform.tenant.update');
      return options.service.processBatch(request.params.publicId);
    },
  );
  app.post(
    '/platform/directory/imports/:publicId/process',
    { schema: { params: importParams } },
    (request) => {
      allow(request, 'platform.tenant.update');
      return options.service.processBatch(request.params.publicId);
    },
  );
  app.post(
    '/platform/directory/imports/:publicId/pause',
    { schema: { params: importParams } },
    (request) => {
      allow(request, 'platform.tenant.update');
      return options.service.pause(request.params.publicId);
    },
  );
  app.post(
    '/platform/directory/imports/:publicId/resume',
    { schema: { params: importParams } },
    (request) => {
      allow(request, 'platform.tenant.update');
      return options.service.resume(request.params.publicId);
    },
  );
  app.post(
    '/platform/directory/imports/:publicId/retry-errors',
    { schema: { params: importParams } },
    (request) => {
      allow(request, 'platform.tenant.update');
      return options.service.retryErrors(request.params.publicId);
    },
  );
  app.get(
    '/platform/directory/imports/:publicId/errors',
    { schema: { params: importParams } },
    (request) => {
      allow(request, 'platform.tenant.read');
      return options.service.importErrors(request.params.publicId);
    },
  );
  app.get('/platform/directory/categories', {}, (request) => {
    allow(request, 'platform.tenant.read');
    return options.service.categories();
  });
  app.get('/platform/directory/admin/categories', {}, (request) => {
    allow(request, 'platform.tenant.read');
    return options.service.adminCategories();
  });
  app.post(
    '/platform/directory/categories',
    {
      schema: {
        body: z.object({
          name: z.string().trim().min(2).max(120),
          singularName: z.string().trim().min(2).max(120),
          pluralName: z.string().trim().min(2).max(120),
          slug: z.string().trim().min(2).max(120),
          description: z.string().trim().max(2000).optional(),
          icon: z.string().trim().max(40).optional(),
          active: z.boolean().default(true),
          indexable: z.boolean().default(true),
        }),
      },
    },
    async (request, reply) => {
      allow(request, 'platform.tenant.create');
      return reply.status(201).send(await options.service.createCategory(request.body));
    },
  );
  app.patch(
    '/platform/directory/categories/:publicId',
    {
      schema: {
        params: importParams,
        body: z.object({
          name: z.string().min(2).max(120).optional(),
          singularName: z.string().min(2).max(120).optional(),
          pluralName: z.string().min(2).max(120).optional(),
          description: z.string().max(2000).nullable().optional(),
          icon: z.string().max(40).nullable().optional(),
          active: z.boolean().optional(),
          indexable: z.boolean().optional(),
          sortOrder: z.number().int().min(0).max(10000).optional(),
          geoapifyCategories: z.array(z.string()).nullable().optional(),
          externalSearchTerms: z.array(z.string()).nullable().optional(),
          externalNegativeTerms: z.array(z.string()).nullable().optional(),
        }),
      },
    },
    (request) => {
      allow(request, 'platform.tenant.update');
      return options.service.updateCategory(request.params.publicId, request.body);
    },
  );
  app.get('/platform/directory/location-config', {}, async (request) => {
    allow(request, 'platform.tenant.read');
    const service = (request.server as any).directoryLocationConfigService as any;
    const status = (await service?.getStatus()) ?? {
      geoapifyConfigured: false,
      geoapifyMaskedKey: null,
      source: 'NONE' as const,
    };
    return status;
  });
  app.put(
    '/platform/directory/location-config',
    { schema: { body: z.object({ geoapifyApiKey: z.string().min(1).max(256).nullable() }) } },
    async (request) => {
      allow(request, 'platform.tenant.update');
      const service = (request.server as any).directoryLocationConfigService as any;
      const status = (await service?.saveGeoapifyApiKey(request.body.geoapifyApiKey)) ?? {
        geoapifyConfigured: false,
        geoapifyMaskedKey: null,
        source: 'NONE' as const,
      };
      return status;
    },
  );
  app.post(
    '/platform/directory/location-test',
    {
      schema: {
        body: z.object({
          cep: z.string().min(8).max(9),
          categorySlug: z.string().min(1).max(120),
        }),
      },
    },
    async (request) => {
      allow(request, 'platform.tenant.read');
      try {
        const result = await options.locationService.searchWithDiagnostics(
          request.body.categorySlug,
          request.body.cep,
        );
        const categoryConfig = await options.service.getLocationCategoryConfig(
          request.body.categorySlug,
        );
        const apiConfigured =
          result.location.latitude !== null && result.location.longitude !== null;
        return {
          success: true,
          location: {
            cep: result.location.cep,
            city: result.location.city,
            state: result.location.state,
            coordinates: apiConfigured
              ? { lat: result.location.latitude, lng: result.location.longitude }
              : null,
          },
          results: {
            directory: result.results.filter((r) => r.source === 'DIRECTORY').length,
            geoapify: result.results.filter((r) => r.source === 'GEOAPIFY').length,
            total: result.results.length,
          },
          geoapify: {
            apiConfigured: true,
            categoryConfigured: (categoryConfig?.geoapifyCategories?.length ?? 0) > 0,
            categories: categoryConfig?.geoapifyCategories ?? [],
            externalSearchTerms: categoryConfig?.externalSearchTerms ?? [],
            hasCoordinates: apiConfigured,
          },
          diagnostics: result.diagnostics,
        };
      } catch (error) {
        const message =
          error instanceof AppError
            ? error.message
            : 'Erro ao testar localização. Tente novamente.';
        return {
          success: false,
          error: message,
        };
      }
    },
  );
  app.get('/platform/directory/businesses', { schema: { querystring: pagination } }, (request) => {
    allow(request, 'platform.tenant.read');
    return options.service.adminBusinesses(request.query);
  });
  app.patch(
    '/platform/directory/businesses/:publicId',
    {
      schema: {
        params: importParams,
        body: z.object({ active: z.boolean().optional(), indexable: z.boolean().optional() }),
      },
    },
    (request) => {
      allow(request, 'platform.tenant.update');
      return options.service.updateBusiness(request.params.publicId, request.body);
    },
  );
  app.post(
    '/platform/directory/businesses',
    {
      schema: {
        body: z.object({
          categoryPublicId: z.string().uuid(),
          name: z.string().min(1).max(180),
          rawAddress: z.string().min(1),
          street: z.string().max(180).optional(),
          number: z.string().max(32).optional(),
          complement: z.string().max(160).optional(),
          neighborhood: z.string().max(120).optional(),
          city: z.string().min(1).max(120),
          state: z.string().length(2).toUpperCase(),
          postalCode: z.string().length(8).optional(),
          phone: z.string().optional(),
          whatsapp: z.string().optional(),
          websiteUrl: z.string().url().optional(),
          active: z.boolean().optional(),
          indexable: z.boolean().optional(),
        }),
      },
    },
    (request: any) => {
      allow(request, 'platform.tenant.create');
      return options.service.createBusinessManual(request.body);
    },
  );
  app.get(
    '/platform/directory/businesses/:publicId',
    { schema: { params: importParams } },
    (request) => {
      allow(request, 'platform.tenant.read');
      return options.service.getBusinessDetail(request.params.publicId);
    },
  );
  app.patch(
    '/platform/directory/businesses/:publicId/details',
    {
      schema: {
        params: importParams,
        body: z.object({
          name: z.string().min(1).max(180).optional(),
          rawAddress: z.string().min(1).optional(),
          street: z.string().max(180).optional().nullable(),
          number: z.string().max(32).optional().nullable(),
          complement: z.string().max(160).optional().nullable(),
          neighborhood: z.string().max(120).optional().nullable(),
          city: z.string().min(1).max(120).optional(),
          state: z.string().length(2).toUpperCase().optional(),
          postalCode: z.string().length(8).optional().nullable(),
          phone: z.string().optional().nullable(),
          whatsapp: z.string().optional().nullable(),
          websiteUrl: z.string().url().optional().nullable(),
          active: z.boolean().optional(),
          indexable: z.boolean().optional(),
        }),
      },
    },
    (request: any) => {
      allow(request, 'platform.tenant.update');
      return options.service.updateBusinessDetails(request.params.publicId, request.body);
    },
  );
  app.get('/platform/directory/metrics', { schema: { querystring: metricsQuery } }, (request) => {
    allow(request, 'platform.tenant.read');
    return options.service.metrics(request.query);
  });
  app.get(
    '/platform/directory/metrics.csv',
    { schema: { querystring: metricsQuery } },
    async (request, reply) => {
      allow(request, 'platform.tenant.read');
      const metrics = await options.service.metrics(request.query);
      const quote = (value: string | number | boolean | Date | null) =>
        `"${String(value ?? '').replace(/"/gu, '""')}"`;
      const lines = [
        [
          'empresa',
          'categoria',
          'cidade',
          'telefone',
          'whatsapp',
          'cliques',
          'cliques_unicos',
          'visualizacoes',
          'ctr',
          'ultimo_clique',
          'tenant_vinculado',
        ].join(','),
        ...metrics.rows.map((row) =>
          [
            row.business,
            row.category,
            `${row.city}/${row.state}`,
            row.phone,
            row.whatsapp,
            row.whatsappClicks,
            row.uniqueWhatsappClicks,
            row.pageViews,
            row.whatsappCtr,
            row.lastWhatsappClickAt,
            row.tenantLinked,
          ]
            .map(quote)
            .join(','),
        ),
      ];
      return reply.type('text/csv; charset=utf-8').send(lines.join('\n'));
    },
  );
  const seo = () => {
    if (options.seo === undefined) throw new Error('SEO do Diretório indisponível.');
    return options.seo;
  };
  app.get('/platform/directory/seo/status', {}, (request) => {
    allow(request, 'platform.tenant.read');
    return seo().status();
  });
  app.get('/platform/directory/seo/overview', { schema: { querystring: seoQuery } }, (request) => {
    allow(request, 'platform.tenant.read');
    return seo().overview(overviewInput(request.query));
  });
  app.get(
    '/platform/directory/seo/businesses',
    { schema: { querystring: seoQuery } },
    async (request) => {
      allow(request, 'platform.tenant.read');
      return (await seo().overview(overviewInput(request.query))).rows;
    },
  );
  app.get('/platform/directory/seo/queries', { schema: { querystring: seoQuery } }, (request) => {
    allow(request, 'platform.tenant.read');
    return seo().queries(queriesInput(request.query));
  });
  app.get(
    '/platform/directory/seo/businesses/:publicId',
    { schema: { params: importParams } },
    (request) => {
      allow(request, 'platform.tenant.read');
      return seo().businessDetail(request.params.publicId);
    },
  );
  app.get(
    '/platform/directory/seo/businesses.csv',
    { schema: { querystring: seoQuery } },
    async (request, reply) => {
      allow(request, 'platform.tenant.read');
      const rows = (await seo().overview(overviewInput(request.query))).rows;
      const quote = (value: string | number | boolean) => `"${String(value).replace(/"/gu, '""')}"`;
      const lines = [
        [
          'empresa',
          'categoria',
          'cidade',
          'uf',
          'impressoes',
          'google_clicks',
          'google_ctr',
          'position',
          'page_views',
          'whatsapp_clicks',
          'unique_whatsapp_clicks',
          'whatsapp_conversion',
          'tenant_linked',
        ].join(','),
        ...rows.map((row) =>
          [
            row.business,
            row.category,
            row.city,
            row.state,
            row.impressions,
            row.googleClicks,
            row.googleCtr,
            row.position,
            row.pageViews,
            row.whatsappClicks,
            row.uniqueWhatsappClicks,
            row.whatsappConversion,
            row.tenantLinked,
          ]
            .map(quote)
            .join(','),
        ),
      ];
      return reply.type('text/csv; charset=utf-8').send(lines.join('\n'));
    },
  );
  app.post('/platform/directory/seo/search-console/sync', {}, (request) => {
    allow(request, 'platform.tenant.update');
    return seo().enqueueSync();
  });
  app.get('/platform/directory/seo/sitemaps', {}, (request) => {
    allow(request, 'platform.tenant.read');
    return seo().sitemapStatus();
  });
  app.post('/platform/directory/seo/sitemaps/submit', {}, (request) => {
    allow(request, 'platform.tenant.update');
    return seo().submitDirectorySitemap();
  });
  app.get('/platform/directory/seo/submissions', {}, (request) => {
    allow(request, 'platform.tenant.read');
    return seo().submissions();
  });
  app.post(
    '/platform/directory/seo/submissions/:publicId/retry',
    { schema: { params: importParams } },
    (request) => {
      allow(request, 'platform.tenant.update');
      return seo().retrySubmission(request.params.publicId);
    },
  );
  app.post(
    '/platform/directory/seo/indexnow/enqueue',
    { schema: { body: z.object({ url: z.url() }) } },
    (request) => {
      allow(request, 'platform.tenant.update');
      return seo().enqueueManual(request.body.url);
    },
  );
  app.get('/platform/directory/seo/inspections', {}, (request) => {
    allow(request, 'platform.tenant.read');
    return seo().inspections();
  });
  app.post(
    '/platform/directory/seo/inspections',
    {
      schema: {
        body: z.object({ url: z.url(), priority: z.number().int().min(0).max(1000).default(0) }),
      },
    },
    (request) => {
      allow(request, 'platform.tenant.update');
      return seo().enqueueInspection(request.body.url, request.body.priority);
    },
  );

  // Temporary maintenance endpoints for queue/backfill operations.
  // Protegidos por platformAuthenticationPlugin (registrado no início deste
  // plugin) + allow() — nunca em publicDirectoryRoutes, que não tem sessão.
  app.post('/platform/directory/maintenance/seo/process-batch', async (request) => {
    allow(request, 'platform.tenant.update');
    return processDirectorySeoEligibilityBatch(options.service['client'], 200);
  });

  app.post('/platform/directory/maintenance/aggregates/process-batch', async (request) => {
    allow(request, 'platform.tenant.update');
    const processed = await processDirectoryCityAggregateJobs(options.service['client'], 10);
    return { processed };
  });

  // Ação manual — nunca disparada automaticamente. Reseta jobs FAILED
  // (inclusive os que já esgotaram as 5 tentativas) para PENDING, para que o
  // próximo process-batch tente de novo. Não apaga nenhum registro.
  app.post('/platform/directory/maintenance/aggregates/retry-failed', async (request) => {
    allow(request, 'platform.tenant.update');
    const retried = await retryFailedDirectoryCityAggregateJobs(options.service['client']);
    return { retried };
  });

  app.get('/platform/directory/maintenance/status', async (request) => {
    allow(request, 'platform.tenant.read');
    const client = options.service['client'];

    // Diagnóstico read-only: nenhuma escrita, só COUNTs e a mesma função pura
    // de avaliação (evaluateDirectoryBusinessSeo) já usada pelo backfill,
    // rodada em memória sobre os dados atuais — nunca grava seoEligible/score.
    const [
      stats,
      totalBusinesses,
      activeBusinesses,
      seoEvaluated,
      seoPendingCount,
      seoEligible,
      seoIneligible,
      sitemapCounts,
    ] = await Promise.all([
      getDirectoryCityAggregateJobStats(client),
      client.directoryBusiness.count(),
      client.directoryBusiness.count({ where: { active: true } }),
      client.directoryBusiness.count({ where: { seoEvaluatedAt: { not: null } } }),
      client.directoryBusiness.count({ where: { seoEvaluatedAt: null } }),
      client.directoryBusiness.count({
        where: { seoEvaluatedAt: { not: null }, seoEligible: true },
      }),
      client.directoryBusiness.count({
        where: { seoEvaluatedAt: { not: null }, seoEligible: false },
      }),
      options.service['sitemapCounts'](),
    ]);

    const ineligibleBusinesses = await client.directoryBusiness.findMany({
      where: { seoEvaluatedAt: { not: null }, seoEligible: false },
      select: {
        active: true,
        indexable: true,
        name: true,
        city: true,
        state: true,
        rawAddress: true,
        neighborhood: true,
        postalCode: true,
        phone: true,
        whatsapp: true,
        websiteUrl: true,
        tenantId: true,
        category: { select: { active: true, indexable: true } },
      },
    });
    const reasonCounts: Record<DirectorySeoEligibilityReason, number> = {
      BUSINESS_INACTIVE: 0,
      BUSINESS_NOT_INDEXABLE: 0,
      CATEGORY_INACTIVE: 0,
      CATEGORY_NOT_INDEXABLE: 0,
      MISSING_NAME: 0,
      MISSING_CITY: 0,
      INVALID_STATE: 0,
      MISSING_ADDRESS: 0,
      MISSING_CONTACT: 0,
      LOW_SCORE: 0,
    };
    for (const business of ineligibleBusinesses) {
      const evaluation = evaluateDirectoryBusinessSeo({
        active: business.active,
        indexable: business.indexable,
        name: business.name,
        city: business.city,
        state: business.state,
        rawAddress: business.rawAddress,
        neighborhood: business.neighborhood,
        postalCode: business.postalCode,
        phone: business.phone,
        whatsapp: business.whatsapp,
        websiteUrl: business.websiteUrl,
        tenantId: business.tenantId,
        categoryActive: business.category.active,
        categoryIndexable: business.category.indexable,
      });
      for (const reason of evaluation.reasons) reasonCounts[reason] += 1;
    }

    const totalUrls = sitemapCounts.total;
    return {
      seoPendingCount,
      cityAggregates: stats,
      aggregatesQueueSize: stats.pendingCount + stats.processingCount,
      oldestPendingAt: stats.oldestPendingAt,
      seo: {
        totalBusinesses,
        activeBusinesses,
        seoEvaluated,
        seoPending: seoPendingCount,
        seoEligible,
        seoIneligible,
        ineligibleReasons: reasonCounts,
      },
      sitemap: {
        pageSize: DIRECTORY_SITEMAP_PAGE_SIZE,
        categoryCount: sitemapCounts.categories,
        cityCount: sitemapCounts.cities,
        businessCount: sitemapCounts.businesses,
        totalUrls,
        pageCount: directorySitemapPageCount(totalUrls),
      },
    };
  });

  app.post(
    '/platform/directory/maintenance/category/:categoryId/mark-seo-recalc',
    async (request) => {
      allow(request, 'platform.tenant.update');
      const categoryId = BigInt((request.params as any).categoryId);
      const count = await markCategoryForSeoRecalculation(options.service['client'], categoryId);
      return { markedCount: count };
    },
  );
};

interface PublicDirectoryRoutesOptions {
  service: DirectoryService;
  locationService: DirectoryLocationService;
  indexNowKey?: string;
}
export const publicDirectoryRoutes: FastifyPluginAsyncZod<PublicDirectoryRoutesOptions> = async (
  app,
  options,
) => {
  if (options.indexNowKey !== undefined)
    app.get(`/${options.indexNowKey}.txt`, async (_request, reply) =>
      reply.type('text/plain; charset=utf-8').send(options.indexNowKey),
    );
  const eventBody = z.object({
    type: z.enum(['BUSINESS_VIEW', 'WHATSAPP_CLICK']),
    visitorId: z.string().max(200).optional(),
    sessionId: z.string().max(200).optional(),
    sourcePath: z.string().min(1).max(500),
    referrer: z.string().max(500).optional(),
    utmSource: z.string().max(160).optional(),
    utmMedium: z.string().max(160).optional(),
    utmCampaign: z.string().max(160).optional(),
  });
  app.post(
    '/public/directory/businesses/:publicId/events',
    {
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      schema: { params: importParams, body: eventBody },
    },
    async (request, reply) => {
      await options.service.recordEvent(request.params.publicId, request.body);
      return reply.status(202).send({ accepted: true });
    },
  );
  const escapeXml = (value: string) =>
    value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
  app.get('/sitemap-directory.xml', async (_request, reply) => {
    reply.header(
      'Cache-Control',
      'public, max-age=600, s-maxage=21600, stale-while-revalidate=86400',
    );
    const summary = await options.service.sitemapSummary();
    const entries = Array.from(
      { length: summary.pageCount },
      (_, index) =>
        `<sitemap><loc>https://agendei.site/sitemap-directory-${String(index + 1)}.xml</loc></sitemap>`,
    ).join('');
    return reply
      .type('application/xml; charset=utf-8')
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</sitemapindex>`,
      );
  });
  app.get(
    '/sitemap-directory-:page.xml',
    // O param aceita qualquer segmento (não só dígitos) de propósito: sufixos
    // não numéricos como "categories" ou "cities-1" (URLs antigas/erradas
    // indexadas pelo Search Console) devem virar 404 "página não existe",
    // nunca 400 de validação — por isso a checagem é manual abaixo, sem
    // z.coerce.number() no schema (que rejeitaria com VALIDATION_ERROR/400).
    { schema: { params: z.object({ page: z.string() }) } },
    async (request, reply) => {
      reply.header(
        'Cache-Control',
        'public, max-age=600, s-maxage=21600, stale-while-revalidate=86400',
      );
      if (!/^\d+$/u.test(request.params.page)) return reply.code(404).send();
      const page = Number(request.params.page);
      if (page < 1) return reply.code(404).send();
      const sitemap = await options.service.sitemapPage(page);
      if (sitemap.urls.length === 0) return reply.code(404).send();
      return reply
        .type('application/xml; charset=utf-8')
        .send(
          `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemap.urls.map((url) => `<url><loc>https://agendei.site${escapeXml(url.path)}</loc>${url.updatedAt === null ? '' : `<lastmod>${url.updatedAt.toISOString()}</lastmod>`}</url>`).join('')}</urlset>`,
        );
    },
  );
  app.get(
    '/public/directory/categories',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (_request, reply) => {
      reply.header(
        'Cache-Control',
        'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
      );
      return { categories: await options.service.categories() };
    },
  );
  app.get(
    '/public/directory/location/by-cep/:cep',
    {
      config: { rateLimit: { max: 20, timeWindow: '10 minutes' } },
      schema: {
        params: z.object({ cep: z.string().min(8).max(9) }),
        querystring: z.object({ category: z.string().min(1).max(120) }),
      },
    },
    (request) => options.locationService.search(request.query.category, request.params.cep),
  );
  app.get(
    '/public/directory/categories/:categorySlug/cities',
    { schema: { params: z.object({ categorySlug: z.string().min(1).max(120) }) } },
    async (request, reply) => {
      reply.header(
        'Cache-Control',
        'public, max-age=300, s-maxage=1800, stale-while-revalidate=86400',
      );
      return options.service.categoryCities(request.params.categorySlug);
    },
  );
  app.get(
    '/public/directory/:categorySlug/:citySlug',
    {
      schema: {
        params: z.object({
          categorySlug: z.string().min(1).max(120),
          citySlug: z.string().min(1).max(180),
        }),
        querystring: pagination,
      },
    },
    async (request, reply) => {
      reply.header(
        'Cache-Control',
        'public, max-age=120, s-maxage=900, stale-while-revalidate=3600',
      );
      return options.service.cityBusinesses(
        request.params.categorySlug,
        request.params.citySlug,
        request.query.page,
        request.query.limit,
      );
    },
  );
  app.get(
    '/public/directory/:categorySlug/:citySlug/:businessSlug',
    {
      schema: {
        params: z.object({
          categorySlug: z.string().min(1).max(120),
          citySlug: z.string().min(1).max(180),
          businessSlug: z.string().min(1).max(180),
        }),
      },
    },
    async (request, reply) => {
      reply.header(
        'Cache-Control',
        'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
      );
      return options.service.business(
        request.params.categorySlug,
        request.params.citySlug,
        request.params.businessSlug,
      );
    },
  );
};
