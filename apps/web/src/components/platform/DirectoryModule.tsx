import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  IconArrowRight,
  IconBuildingStore,
  IconCategory,
  IconChartBar,
  IconCircleCheck,
  IconFileUpload,
  IconMapPin,
  IconMessageCircle,
  IconPlus,
  IconRoute,
  IconSearch,
} from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';

import { httpClient } from '../../lib/http.js';
import { ErrorState, PageHeader } from './PlatformUi.js';
import { DirectorySeoPanel } from './DirectorySeoPanel.js';
import { DirectoryBusinessForm } from './DirectoryBusinessForm.js';
import { DirectoryCategoryForm, type DirectoryCategoryValue } from './DirectoryCategoryForm.js';
import {
  DirectoryBadge,
  DirectoryPagination,
  DirectorySectionHeader,
  DirectoryStatCard,
  DirectoryTabs,
  type DirectoryTab,
} from './DirectoryWorkspace.js';

const Category = z.object({
  slug: z.string().nullable(),
  name: z.string(),
  detected: z.string(),
  count: z.number(),
  existing: z.boolean(),
  created: z.number(),
  updated: z.number(),
  unchanged: z.number(),
  duplicates: z.number(),
});
const ImportPreview = z.object({
  import: z.object({
    publicId: z.string(),
    filename: z.string(),
    status: z.string(),
    totalFound: z.number(),
    totalSelected: z.number(),
    processedCount: z.number(),
    totalCreated: z.number(),
    totalUpdated: z.number(),
    totalUnchanged: z.number(),
    totalDuplicates: z.number(),
    errors: z.number().default(0),
    remaining: z.number().default(0),
    progressPercent: z.number().default(0),
  }),
  categories: z.array(Category),
  completedWithErrors: z.boolean().optional(),
  batchProcessed: z.number().optional(),
});
const MetricRow = z.object({
  businessPublicId: z.string(),
  business: z.string(),
  category: z.string(),
  city: z.string(),
  state: z.string(),
  pageViews: z.number(),
  whatsappClicks: z.number(),
  uniqueWhatsappClicks: z.number(),
  whatsappCtr: z.number(),
  lastWhatsappClickAt: z.string().nullable(),
  tenantLinked: z.boolean(),
  daily: z.array(z.object({ date: z.string(), pageViews: z.number(), whatsappClicks: z.number() })),
});
const Metrics = z.object({
  summary: z.object({
    pageViews: z.number(),
    whatsappClicks: z.number(),
    uniqueWhatsappClicks: z.number(),
    whatsappCtr: z.number(),
    businessesWithClicks: z.number(),
    prospectsWithClicks: z.number(),
  }),
  rows: z.array(MetricRow),
  ranking: z.array(MetricRow),
  detail: MetricRow.nullable(),
  total: z.number().optional(),
  page: z.number().optional(),
  limit: z.number().optional(),
});
const AdminCategory = z.object({
  publicId: z.string(),
  name: z.string(),
  singularName: z.string(),
  pluralName: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  active: z.boolean(),
  indexable: z.boolean(),
  geoapifyCategories: z.array(z.string()).nullable(),
  externalSearchTerms: z.array(z.string()).nullable(),
  externalNegativeTerms: z.array(z.string()).nullable(),
  _count: z.object({ businesses: z.number() }),
});
const ImportError = z.object({
  position: z.number(),
  name: z.string(),
  city: z.string(),
  state: z.string(),
  status: z.literal('ERROR'),
  message: z.string(),
});

function date(value: string | null) {
  return value === null
    ? '—'
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
        new Date(value),
      );
}

export function DirectoryModule() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<DirectoryTab>('overview');
  const [preview, setPreview] = useState<z.infer<typeof ImportPreview>>();
  const [selectedDetected, setSelectedDetected] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState<{
    detected: string;
    name: string;
    singularName: string;
    pluralName: string;
    slug: string;
  }>();
  const [showErrors, setShowErrors] = useState(false);
  const [configureError, setConfigureError] = useState<string>();
  const [processError, setProcessError] = useState<string>();
  const [period, setPeriod] = useState('all');
  const [categorySlug, setCategorySlug] = useState('');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [search, setSearch] = useState('');
  const [hasTenant, setHasTenant] = useState('');
  const [selectedMetric, setSelectedMetric] = useState<string>();
  const [metricsPage, setMetricsPage] = useState(1);
  const [geoapifyKey, setGeoapifyKey] = useState('');
  const [testCep, setTestCep] = useState('');
  const [testCategory, setTestCategory] = useState('');
  type BusinessFormMode = { mode: 'create' } | { mode: 'edit'; publicId: string } | null;
  const [businessForm, setBusinessForm] = useState<BusinessFormMode>(null);
  const [categoryForm, setCategoryForm] = useState<'create' | string | null>(null);
  const [businessPage, setBusinessPage] = useState(1);
  const [businessSearch, setBusinessSearch] = useState('');
  const [businessCategory, setBusinessCategory] = useState('');
  const [businessCity, setBusinessCity] = useState('');
  const [businessState, setBusinessState] = useState('');
  const [businessStatus, setBusinessStatus] = useState('');
  const [businessIndexable, setBusinessIndexable] = useState('');
  const [categoryPage, setCategoryPage] = useState(1);
  const [categorySearch, setCategorySearch] = useState('');
  const [importsPage, setImportsPage] = useState(1);
  const [openBusinessMenu, setOpenBusinessMenu] = useState<string>();
  const METRICS_PER_PAGE = 25;
  const BUSINESS_PAGE_SIZE = 20;
  const CATEGORY_PAGE_SIZE = 10;
  const IMPORT_PAGE_SIZE = 8;
  const params = useMemo(() => {
    const value = new URLSearchParams();
    const now = new Date();
    if (period !== 'all') {
      const from = new Date(now);
      from.setDate(now.getDate() - Number(period) + 1);
      value.set('from', from.toISOString().slice(0, 10));
      value.set('to', now.toISOString().slice(0, 10));
    }
    if (categorySlug) value.set('categorySlug', categorySlug);
    if (state) value.set('state', state.toUpperCase());
    if (city) value.set('city', city);
    if (search) value.set('search', search);
    if (hasTenant) value.set('hasTenant', hasTenant);
    value.set('page', String(metricsPage));
    value.set('limit', String(METRICS_PER_PAGE));
    return value;
  }, [period, categorySlug, state, city, search, hasTenant, metricsPage]);
  const invalidateImportData = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['platform', 'directory', 'categories'] }),
      queryClient.invalidateQueries({ queryKey: ['platform', 'directory', 'businesses'] }),
      queryClient.invalidateQueries({ queryKey: ['platform', 'directory', 'imports'] }),
    ]);

  const locationConfig = useQuery({
    queryKey: ['platform', 'directory', 'location-config'],
    queryFn: () =>
      httpClient.request('/platform/directory/location-config', {
        schema: z.object({
          geoapifyConfigured: z.boolean(),
          geoapifyMaskedKey: z.string().nullable(),
          source: z.enum(['DATABASE', 'ENV', 'NONE']),
        }),
      }),
  });
  const saveLocationConfig = useMutation({
    mutationFn: (geoapifyApiKey: string | null) =>
      httpClient.request('/platform/directory/location-config', {
        method: 'PUT',
        body: { geoapifyApiKey },
        schema: z.object({
          geoapifyConfigured: z.boolean(),
          geoapifyMaskedKey: z.string().nullable(),
          source: z.enum(['DATABASE', 'ENV', 'NONE']),
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'directory', 'location-config'] });
      setGeoapifyKey('');
    },
  });
  const testLocation = useMutation({
    mutationFn: () =>
      httpClient.request('/platform/directory/location-test', {
        method: 'POST',
        body: { cep: testCep, categorySlug: testCategory },
        schema: z.object({
          success: z.boolean(),
          location: z
            .object({
              cep: z.string(),
              city: z.string(),
              state: z.string(),
              coordinates: z.object({ lat: z.number(), lng: z.number() }).nullable(),
            })
            .optional(),
          results: z
            .object({ directory: z.number(), geoapify: z.number(), total: z.number() })
            .optional(),
          geoapify: z
            .object({
              apiConfigured: z.boolean(),
              categoryConfigured: z.boolean(),
              categories: z.array(z.string()),
              externalSearchTerms: z.array(z.string()),
              hasCoordinates: z.boolean(),
            })
            .optional(),
          diagnostics: z
            .object({
              geocoding: z.object({
                attempted: z.boolean(),
                success: z.boolean(),
                source: z.enum(['CACHE', 'BRASILAPI', 'VIACEP', 'GEOAPIFY']).nullable(),
                httpStatus: z.number().optional(),
                featuresReceived: z.number().optional(),
                apiKeyAvailable: z.boolean().optional(),
                requestAttempted: z.boolean().optional(),
                requestUrlHost: z.string().nullable().optional(),
                errorType: z.string().optional(),
                errorCode: z.string().optional(),
                errorMessage: z.string().optional(),
                durationMs: z.number().optional(),
              }),
              places: z.object({
                attempted: z.boolean(),
                httpStatus: z.number().optional(),
                featuresReceived: z.number().optional(),
                acceptedResults: z.number().optional(),
                categoriesSent: z.array(z.string()).optional(),
                radius: z.number().optional(),
                errorType: z.string().optional(),
                errorMessage: z.string().optional(),
                samples: z
                  .array(
                    z.object({
                      name: z.string(),
                      score: z.number(),
                      accepted: z.boolean(),
                      reasons: z.array(z.string()),
                      categories: z.array(z.string()).optional(),
                      rawClassification: z.record(z.string(), z.unknown()).optional(),
                      radius: z.number().optional(),
                    }),
                  )
                  .optional(),
              }),
            })
            .optional(),
          error: z.string().optional(),
        }),
      }),
  });

  const categories = useQuery({
    queryKey: ['platform', 'directory', 'categories'],
    queryFn: () =>
      httpClient.request('/platform/directory/admin/categories', {
        schema: z.array(AdminCategory),
      }),
  });
  const metrics = useQuery({
    queryKey: ['platform', 'directory', 'metrics', params.toString()],
    queryFn: () => httpClient.request(`/platform/directory/metrics?${params}`, { schema: Metrics }),
  });
  const detail = useQuery({
    enabled: selectedMetric !== undefined,
    queryKey: ['platform', 'directory', 'metric-detail', selectedMetric, params.toString()],
    queryFn: () => {
      const detailParams = new URLSearchParams(params);
      detailParams.set('businessPublicId', selectedMetric ?? '');
      return httpClient.request(`/platform/directory/metrics?${detailParams}`, { schema: Metrics });
    },
  });
  const upload = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.set('file', file);
      return httpClient.request('/platform/directory/imports/analyze', {
        method: 'POST',
        body,
        schema: ImportPreview,
      });
    },
    onSuccess: (data) => {
      setPreview(data);
      setSelectedDetected(
        data.categories.filter((item) => item.existing).map((item) => item.detected),
      );
      configure.reset();
      process.reset();
      setConfigureError(undefined);
      setProcessError(undefined);
    },
  });
  const configure = useMutation({
    mutationFn: () =>
      httpClient.request(
        `/platform/directory/imports/${preview?.import.publicId ?? ''}/configure`,
        {
          method: 'POST',
          body: {
            assignments: [
              ...(preview?.categories
                .filter(
                  (item) =>
                    item.existing && item.slug !== null && selectedDetected.includes(item.detected),
                )
                .map((item) => ({ detected: item.detected, categorySlug: item.slug! })) ?? []),
              ...(newCategory !== undefined && selectedDetected.includes(newCategory.detected)
                ? [{ detected: newCategory.detected, categorySlug: newCategory.slug }]
                : []),
            ],
            newCategories:
              newCategory !== undefined && selectedDetected.includes(newCategory.detected)
                ? [newCategory]
                : [],
          },
          schema: ImportPreview,
        },
      ),
    onSuccess: (data) => {
      setPreview(data);
      setConfigureError(undefined);
    },
    onError: (err: any) => {
      const code = err?.response?.data?.error?.code || 'UNKNOWN';
      const message =
        code === 'DIRECTORY_IMPORT_ALREADY_STARTED'
          ? 'Uma importação já está em processamento. Aguarde a conclusão.'
          : err?.response?.data?.error?.message || 'Erro ao preparar seleção.';
      setConfigureError(message);
    },
  });
  const process = useMutation({
    mutationFn: () =>
      httpClient.request(
        `/platform/directory/imports/${preview?.import.publicId ?? ''}/process-batch`,
        { method: 'POST', schema: ImportPreview },
      ),
    onSuccess: async (data) => {
      setPreview(data);
      setProcessError(undefined);
      await invalidateImportData();
    },
    onError: (err: any) => {
      const message = err?.response?.data?.error?.message || 'Erro ao processar lote.';
      setProcessError(message);
    },
  });
  const retryErrors = useMutation({
    mutationFn: () =>
      httpClient.request(
        `/platform/directory/imports/${preview?.import.publicId ?? ''}/retry-errors`,
        { method: 'POST', schema: ImportPreview },
      ),
    onSuccess: async (data) => {
      setPreview(data);
      await invalidateImportData();
    },
  });
  const pause = useMutation({
    mutationFn: () =>
      httpClient.request(`/platform/directory/imports/${preview?.import.publicId ?? ''}/pause`, {
        method: 'POST',
        schema: ImportPreview,
      }),
    onSuccess: setPreview,
  });
  const resume = useMutation({
    mutationFn: () =>
      httpClient.request(`/platform/directory/imports/${preview?.import.publicId ?? ''}/resume`, {
        method: 'POST',
        schema: ImportPreview,
      }),
    onSuccess: setPreview,
  });
  const categoryUpdate = useMutation({
    mutationFn: ({
      publicId,
      body,
    }: {
      publicId: string;
      body: { active?: boolean; indexable?: boolean };
    }) =>
      httpClient.request(`/platform/directory/categories/${publicId}`, {
        method: 'PATCH',
        body,
        schema: z.unknown(),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['platform', 'directory', 'categories'] }),
  });
  const businessParams = useMemo(() => {
    const value = new URLSearchParams({
      page: String(businessPage),
      limit: String(BUSINESS_PAGE_SIZE),
    });
    if (businessSearch.trim()) value.set('search', businessSearch.trim());
    if (businessCategory) value.set('categorySlug', businessCategory);
    if (businessCity.trim()) value.set('city', businessCity.trim());
    if (businessState.trim().length === 2) value.set('state', businessState.toUpperCase());
    if (businessStatus) value.set('active', businessStatus);
    if (businessIndexable) value.set('indexable', businessIndexable);
    return value;
  }, [
    businessCategory,
    businessCity,
    businessIndexable,
    businessPage,
    businessSearch,
    businessState,
    businessStatus,
  ]);
  const businesses = useQuery({
    queryKey: ['platform', 'directory', 'businesses', businessParams.toString()],
    queryFn: () =>
      httpClient.request(`/platform/directory/businesses?${businessParams}`, {
        schema: z.object({
          items: z.array(
            z.object({
              publicId: z.string(),
              name: z.string(),
              city: z.string(),
              state: z.string(),
              active: z.boolean(),
              indexable: z.boolean(),
              whatsapp: z.string().nullable(),
              seoQualityScore: z.number(),
              updatedAt: z.coerce.date(),
              category: z.object({ pluralName: z.string(), slug: z.string() }),
            }),
          ),
          page: z.number(),
          limit: z.number(),
          total: z.number(),
          totalPages: z.number(),
          summary: z.object({
            totalBusinesses: z.number(),
            activeBusinesses: z.number(),
            indexableBusinesses: z.number(),
            categoryCount: z.number(),
            cityCount: z.number(),
          }),
        }),
      }),
  });
  const imports = useQuery({
    queryKey: ['platform', 'directory', 'imports'],
    queryFn: () =>
      httpClient.request('/platform/directory/imports', {
        schema: z.array(
          z.object({
            publicId: z.string(),
            filename: z.string(),
            status: z.string(),
            totalFound: z.number(),
            totalSelected: z.number(),
            processedCount: z.number(),
            totalCreated: z.number(),
            totalUpdated: z.number(),
            totalUnchanged: z.number(),
            totalDuplicates: z.number(),
            createdAt: z.string(),
          }),
        ),
      }),
  });
  const importErrors = useQuery({
    enabled: showErrors && preview !== undefined,
    queryKey: ['platform', 'directory', 'import-errors', preview?.import.publicId],
    queryFn: () =>
      httpClient.request(`/platform/directory/imports/${preview?.import.publicId ?? ''}/errors`, {
        schema: z.array(ImportError),
      }),
  });
  const businessUpdate = useMutation({
    mutationFn: ({
      publicId,
      body,
    }: {
      publicId: string;
      body: { active?: boolean; indexable?: boolean };
    }) =>
      httpClient.request(`/platform/directory/businesses/${publicId}`, {
        method: 'PATCH',
        body,
        schema: z.unknown(),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['platform', 'directory', 'businesses'] }),
  });
  useEffect(() => {
    if (preview?.import.status === 'QUEUED' && !process.isPending) {
      const timer = window.setTimeout(() => process.mutate(), 500);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [preview?.import.status, process.isPending, process.mutate]);
  useEffect(() => {
    setBusinessPage(1);
  }, [
    businessCategory,
    businessCity,
    businessIndexable,
    businessSearch,
    businessState,
    businessStatus,
  ]);

  const filteredCategories = (categories.data ?? []).filter((item) =>
    `${item.pluralName} ${item.slug}`.toLowerCase().includes(categorySearch.trim().toLowerCase()),
  );
  const pagedCategories = filteredCategories.slice(
    (categoryPage - 1) * CATEGORY_PAGE_SIZE,
    categoryPage * CATEGORY_PAGE_SIZE,
  );
  const pagedImports = (imports.data ?? []).slice(
    (importsPage - 1) * IMPORT_PAGE_SIZE,
    importsPage * IMPORT_PAGE_SIZE,
  );
  const latestImport = imports.data?.[0];
  const overviewMetrics = metrics.data?.summary;
  const overviewSummary = businesses.data?.summary;
  const conversion = overviewMetrics?.pageViews
    ? `${((overviewMetrics.whatsappClicks / overviewMetrics.pageViews) * 100).toFixed(1)}%`
    : '0,0%';

  const openCreateBusiness = () => {
    setBusinessForm({ mode: 'create' });
    setActiveTab('businesses');
  };
  return (
    <section className="directory-workspace">
      <PageHeader
        title="Diretório"
        description="Gerencie presença local, descoberta e performance em uma operação centralizada."
      />
      <div className="directory-top-actions">
        <button
          type="button"
          className="directory-button directory-button--primary"
          onClick={openCreateBusiness}
        >
          <IconPlus size={18} /> Adicionar estabelecimento
        </button>
        <button type="button" className="directory-button" onClick={() => setActiveTab('imports')}>
          <IconFileUpload size={18} /> Importar XML
        </button>
      </div>
      <DirectoryTabs active={activeTab} onChange={setActiveTab} />

      {activeTab === 'overview' ? (
        <div className="directory-tab-content">
          <DirectorySectionHeader
            eyebrow="Visão geral"
            title="Sua operação local em um só lugar"
            description="Acompanhe cobertura, saúde técnica e os principais sinais de intenção do diretório."
          />
          <div className="directory-stats-grid">
            <DirectoryStatCard
              tone="gold"
              icon={<IconBuildingStore size={22} />}
              label="Estabelecimentos"
              value={overviewSummary?.totalBusinesses ?? 0}
              hint={`${overviewSummary?.activeBusinesses ?? 0} ativos`}
            />
            <DirectoryStatCard
              tone="purple"
              icon={<IconCategory size={22} />}
              label="Categorias"
              value={overviewSummary?.categoryCount ?? categories.data?.length ?? 0}
              hint="nichos organizados"
            />
            <DirectoryStatCard
              tone="blue"
              icon={<IconMapPin size={22} />}
              label="Cidades cobertas"
              value={overviewSummary?.cityCount ?? 0}
              hint="com presença ativa"
            />
            <DirectoryStatCard
              tone="green"
              icon={<IconCircleCheck size={22} />}
              label="Indexáveis"
              value={overviewSummary?.indexableBusinesses ?? 0}
              hint="aptos para sitemap"
            />
            <DirectoryStatCard
              tone="green"
              icon={<IconMessageCircle size={22} />}
              label="Cliques no WhatsApp"
              value={overviewMetrics?.whatsappClicks ?? 0}
              hint={`${overviewMetrics?.uniqueWhatsappClicks ?? 0} únicos`}
            />
            <DirectoryStatCard
              tone="orange"
              icon={<IconRoute size={22} />}
              label="Como chegar"
              value="—"
              hint="evento ainda não instrumentado"
            />
            <DirectoryStatCard
              tone="blue"
              icon={<IconSearch size={22} />}
              label="Conversão"
              value={conversion}
              hint="visualização → WhatsApp"
            />
            <DirectoryStatCard
              tone="purple"
              icon={<IconFileUpload size={22} />}
              label="Última importação"
              value={latestImport?.status ?? 'Nenhuma'}
              hint={
                latestImport
                  ? `${latestImport.processedCount}/${latestImport.totalSelected} processados`
                  : 'envie seu primeiro XML'
              }
            />
          </div>
          <div className="directory-overview-grid">
            <article className="directory-card directory-card--health">
              <DirectorySectionHeader
                title="Saúde do diretório"
                description="Leitura rápida das integrações e rotinas essenciais."
              />
              <div className="directory-health-list">
                <div>
                  <span>SEO e sitemap</span>
                  <DirectoryBadge
                    tone={(overviewSummary?.indexableBusinesses ?? 0) > 0 ? 'success' : 'warning'}
                  >
                    {(overviewSummary?.indexableBusinesses ?? 0) > 0 ? 'Operacional' : 'Revisar'}
                  </DirectoryBadge>
                </div>
                <div>
                  <span>Geoapify</span>
                  <DirectoryBadge
                    tone={locationConfig.data?.geoapifyConfigured ? 'success' : 'warning'}
                  >
                    {locationConfig.data?.geoapifyConfigured ? 'Configurada' : 'Pendente'}
                  </DirectoryBadge>
                </div>
                <div>
                  <span>Importações</span>
                  <DirectoryBadge
                    tone={
                      latestImport?.status === 'FAILED'
                        ? 'danger'
                        : latestImport
                          ? 'info'
                          : 'neutral'
                    }
                  >
                    {latestImport?.status ?? 'Sem histórico'}
                  </DirectoryBadge>
                </div>
                <div>
                  <span>Estabelecimentos ativos</span>
                  <DirectoryBadge tone="success">
                    {overviewSummary?.activeBusinesses ?? 0}
                  </DirectoryBadge>
                </div>
              </div>
            </article>
            <article className="directory-card directory-card--quick">
              <DirectorySectionHeader
                title="Ações rápidas"
                description="Atalhos para as tarefas mais frequentes."
              />
              <div className="directory-quick-grid">
                <button type="button" onClick={openCreateBusiness}>
                  <IconBuildingStore size={21} />
                  <span>
                    <strong>Adicionar estabelecimento</strong>
                    <small>Cadastro manual completo</small>
                  </span>
                  <IconArrowRight size={18} />
                </button>
                <button type="button" onClick={() => setActiveTab('imports')}>
                  <IconFileUpload size={21} />
                  <span>
                    <strong>Importar XML</strong>
                    <small>Analisar e processar em lotes</small>
                  </span>
                  <IconArrowRight size={18} />
                </button>
                <button type="button" onClick={() => setActiveTab('categories')}>
                  <IconCategory size={21} />
                  <span>
                    <strong>Gerenciar categorias</strong>
                    <small>Organização e indexação</small>
                  </span>
                  <IconArrowRight size={18} />
                </button>
                <button type="button" onClick={() => setActiveTab('geo')}>
                  <IconMapPin size={21} />
                  <span>
                    <strong>Configurar Geoapify</strong>
                    <small>Busca externa e cobertura</small>
                  </span>
                  <IconArrowRight size={18} />
                </button>
                <button type="button" onClick={() => setActiveTab('seo')}>
                  <IconSearch size={21} />
                  <span>
                    <strong>Atualizar SEO</strong>
                    <small>Search Console e sitemap</small>
                  </span>
                  <IconArrowRight size={18} />
                </button>
              </div>
            </article>
          </div>
        </div>
      ) : null}

      {activeTab === 'seo' ? <DirectorySeoPanel /> : null}
      {activeTab === 'geo' ? (
        <div className="directory-tab-content">
          <DirectorySectionHeader
            eyebrow="Integrações"
            title="Geolocalização e busca externa"
            description="Configure a fonte externa e valide a cobertura por CEP antes de publicar."
          />
          <article className="platform-panel directory-card">
            <h2>Geolocalização e busca externa</h2>
            <p>
              A Geoapify é utilizada para localizar estabelecimentos próximos quando o Diretório não
              possui resultados locais suficientes.
            </p>
            <div
              style={{
                marginBottom: '1.5rem',
                padding: '1rem',
                backgroundColor: 'var(--ds-background-secondary)',
                borderRadius: '6px',
              }}
            >
              <div style={{ marginBottom: '0.75rem' }}>
                <strong>Geoapify API Key</strong>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <input
                  type="password"
                  placeholder="Cole a chave da API da Geoapify"
                  value={geoapifyKey}
                  onChange={(e) => setGeoapifyKey(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '0.5rem',
                    border: '1px solid var(--ds-border-neutral)',
                    borderRadius: '4px',
                  }}
                />
                <button
                  onClick={() => saveLocationConfig.mutate(geoapifyKey)}
                  disabled={saveLocationConfig.isPending || !geoapifyKey.trim()}
                >
                  Salvar
                </button>
                {locationConfig.data?.geoapifyConfigured ? (
                  <button
                    onClick={() => saveLocationConfig.mutate(null)}
                    disabled={saveLocationConfig.isPending}
                  >
                    Remover
                  </button>
                ) : null}
              </div>
              <div style={{ fontSize: '0.9rem', color: 'var(--ds-text-tertiary)' }}>
                Status:{' '}
                {locationConfig.data?.geoapifyConfigured
                  ? `Configurada (${locationConfig.data.source})`
                  : 'Não configurada'}
                {locationConfig.data?.geoapifyMaskedKey
                  ? ` · ${locationConfig.data.geoapifyMaskedKey}`
                  : ''}
              </div>
            </div>
            <div>
              <h3>Teste de localização</h3>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <input
                  type="text"
                  placeholder="CEP (ex: 18150-000)"
                  value={testCep}
                  onChange={(e) => setTestCep(e.target.value)}
                  maxLength={9}
                  style={{
                    flex: 1,
                    padding: '0.5rem',
                    border: '1px solid var(--ds-border-neutral)',
                    borderRadius: '4px',
                  }}
                />
                <select
                  value={testCategory}
                  onChange={(e) => setTestCategory(e.target.value)}
                  style={{
                    padding: '0.5rem',
                    border: '1px solid var(--ds-border-neutral)',
                    borderRadius: '4px',
                  }}
                >
                  <option value="">Escolha uma categoria</option>
                  {categories.data?.map((cat) => (
                    <option key={cat.slug} value={cat.slug}>
                      {cat.pluralName} {cat.geoapifyCategories?.length ? '✓' : '—'}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => testLocation.mutate()}
                  disabled={testLocation.isPending || !testCep.trim() || !testCategory}
                >
                  Testar
                </button>
              </div>
              {testCategory && (
                <div
                  style={{
                    marginTop: '0.5rem',
                    fontSize: '0.9rem',
                    color: 'var(--ds-text-tertiary)',
                  }}
                >
                  Categoria:{' '}
                  {(() => {
                    const cat = categories.data?.find((c) => c.slug === testCategory);
                    return cat
                      ? `${cat.geoapifyCategories?.length ? '✓ Configurada' : '— Não configurada'} (${cat.geoapifyCategories?.length ?? 0} categorias Geoapify)`
                      : '—';
                  })()}
                </div>
              )}
              {testLocation.data && (
                <div
                  style={{
                    marginTop: '1rem',
                    padding: '0.75rem',
                    backgroundColor: testLocation.data.success
                      ? 'var(--ds-background-positive-subtle)'
                      : 'var(--ds-background-negative-subtle)',
                    borderRadius: '4px',
                    color: testLocation.data.success
                      ? 'var(--ds-text-positive)'
                      : 'var(--ds-text-negative)',
                    fontSize: '0.85rem',
                    fontFamily: 'monospace',
                    lineHeight: '1.4',
                  }}
                >
                  {testLocation.data.success ? (
                    <>
                      <strong>✓ CEP encontrado!</strong>
                      <br />
                      Localização: {testLocation.data.location?.city}/
                      {testLocation.data.location?.state}
                      <br />
                      Coordenadas:{' '}
                      {testLocation.data.location?.coordinates
                        ? `${testLocation.data.location.coordinates.lat.toFixed(4)}, ${testLocation.data.location.coordinates.lng.toFixed(4)}`
                        : 'Não disponíveis'}
                      <br />
                      <br />
                      <strong>Geoapify:</strong>
                      <br />
                      API: {testLocation.data.geoapify?.apiConfigured ? '✓' : '✗'} Configurada
                      <br />
                      Categoria: {testLocation.data.geoapify?.categoryConfigured ? '✓' : '✗'}{' '}
                      Configurada{' '}
                      {testLocation.data.geoapify?.categories?.length
                        ? `(${testLocation.data.geoapify.categories.length} categorias)`
                        : ''}
                      <br />
                      <br />
                      <strong>Geocoding:</strong>
                      <br />
                      Tentado: {testLocation.data.diagnostics?.geocoding.attempted ? 'Sim' : 'Não'}
                      <br />
                      Sucesso: {testLocation.data.diagnostics?.geocoding.success ? 'Sim' : 'Não'}
                      <br />
                      Fonte: {testLocation.data.diagnostics?.geocoding.source ?? '—'}
                      <br />
                      Chave disponível:{' '}
                      {testLocation.data.diagnostics?.geocoding.apiKeyAvailable !== undefined
                        ? testLocation.data.diagnostics.geocoding.apiKeyAvailable
                          ? 'Sim'
                          : 'Não'
                        : '—'}
                      <br />
                      Requisição externa:{' '}
                      {testLocation.data.diagnostics?.geocoding.requestAttempted !== undefined
                        ? testLocation.data.diagnostics.geocoding.requestAttempted
                          ? 'Sim'
                          : 'Não'
                        : '—'}
                      <br />
                      {testLocation.data.diagnostics?.geocoding.requestUrlHost && (
                        <>
                          Host: {testLocation.data.diagnostics.geocoding.requestUrlHost}
                          <br />
                        </>
                      )}
                      {testLocation.data.diagnostics?.geocoding.httpStatus !== undefined && (
                        <>
                          HTTP: {testLocation.data.diagnostics.geocoding.httpStatus}
                          <br />
                        </>
                      )}
                      {testLocation.data.diagnostics?.geocoding.featuresReceived !== undefined && (
                        <>
                          Features: {testLocation.data.diagnostics.geocoding.featuresReceived}
                          <br />
                        </>
                      )}
                      {testLocation.data.diagnostics?.geocoding.durationMs !== undefined && (
                        <>
                          Duração: {testLocation.data.diagnostics.geocoding.durationMs}ms
                          <br />
                        </>
                      )}
                      {testLocation.data.diagnostics?.geocoding.errorType && (
                        <>
                          Erro: {testLocation.data.diagnostics.geocoding.errorType}
                          <br />
                        </>
                      )}
                      {testLocation.data.diagnostics?.geocoding.errorMessage && (
                        <>
                          Mensagem: {testLocation.data.diagnostics.geocoding.errorMessage}
                          <br />
                        </>
                      )}
                      {testLocation.data.diagnostics?.geocoding.errorCode && (
                        <>
                          Código: {testLocation.data.diagnostics.geocoding.errorCode}
                          <br />
                        </>
                      )}
                      <br />
                      <strong>Places:</strong>
                      <br />
                      Tentado: {testLocation.data.diagnostics?.places.attempted ? 'Sim' : 'Não'}
                      <br />
                      {testLocation.data.diagnostics?.places.categoriesSent && (
                        <>
                          Categorias:
                          <br />
                          {testLocation.data.diagnostics.places.categoriesSent
                            .map((cat) => `  ${cat}`)
                            .join('\n')}
                          <br />
                        </>
                      )}
                      {testLocation.data.diagnostics?.places.radius !== undefined && (
                        <>
                          Raio: {testLocation.data.diagnostics.places.radius / 1000}km
                          <br />
                        </>
                      )}
                      {testLocation.data.diagnostics?.places.httpStatus !== undefined && (
                        <>
                          HTTP: {testLocation.data.diagnostics.places.httpStatus}
                          <br />
                        </>
                      )}
                      {testLocation.data.diagnostics?.places.featuresReceived !== undefined && (
                        <>
                          Features: {testLocation.data.diagnostics.places.featuresReceived}
                          <br />
                        </>
                      )}
                      {testLocation.data.diagnostics?.places.acceptedResults !== undefined && (
                        <>
                          Aceitos: {testLocation.data.diagnostics.places.acceptedResults}
                          <br />
                        </>
                      )}
                      {testLocation.data.diagnostics?.places.errorType && (
                        <>
                          Erro: {testLocation.data.diagnostics.places.errorType}
                          <br />
                        </>
                      )}
                      {testLocation.data.diagnostics?.places.errorMessage && (
                        <>
                          Mensagem: {testLocation.data.diagnostics.places.errorMessage}
                          <br />
                        </>
                      )}
                      <br />
                      <strong>Resultados:</strong>
                      <br />
                      Diretório: {testLocation.data.results?.directory} | Geoapify:{' '}
                      {testLocation.data.results?.geoapify} | Total:{' '}
                      {testLocation.data.results?.total}
                      {testLocation.data.diagnostics?.places.samples &&
                        testLocation.data.diagnostics.places.samples.length > 0 && (
                          <>
                            <br />
                            <br />
                            <strong>Features retornadas pela Geoapify:</strong>
                            <br />
                            {testLocation.data.diagnostics.places.samples.map((sample, idx) => (
                              <details
                                key={idx}
                                style={{
                                  marginBottom: '0.5rem',
                                  padding: '0.5rem',
                                  backgroundColor: 'var(--ds-background-tertiary)',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                }}
                              >
                                <summary
                                  style={{
                                    fontWeight: sample.accepted ? 'bold' : 'normal',
                                    color: sample.accepted
                                      ? 'var(--ds-text-positive)'
                                      : 'var(--ds-text-negative)',
                                  }}
                                >
                                  {sample.accepted ? '✓' : '✕'} {sample.name} — score {sample.score}
                                  {sample.radius ? ` — raio ${sample.radius / 1000}km` : ''}
                                </summary>
                                <div
                                  style={{
                                    marginTop: '0.5rem',
                                    fontSize: '0.8rem',
                                    color: 'var(--ds-text-secondary)',
                                  }}
                                >
                                  {sample.reasons.map((reason, ridx) => (
                                    <div key={ridx}>• {reason}</div>
                                  ))}
                                  {sample.categories && sample.categories.length > 0 && (
                                    <>
                                      <br />
                                      Categorias: {sample.categories.join(', ')}
                                    </>
                                  )}
                                  {sample.rawClassification &&
                                    Object.keys(sample.rawClassification).length > 0 && (
                                      <>
                                        <br />
                                        Classificação OSM:{' '}
                                        {Object.entries(sample.rawClassification)
                                          .map(([k, v]) => `${k}=${v}`)
                                          .join(', ')}
                                      </>
                                    )}
                                </div>
                              </details>
                            ))}
                          </>
                        )}
                    </>
                  ) : (
                    <>
                      <strong>✗ Erro:</strong>
                      <br />
                      {testLocation.data.error}
                    </>
                  )}
                </div>
              )}
            </div>
          </article>
        </div>
      ) : null}
      {activeTab === 'metrics' ? (
        <div className="directory-tab-content">
          <DirectorySectionHeader
            eyebrow="Performance"
            title="Métricas e desempenho"
            description="Entenda a descoberta, a intenção e as oportunidades comerciais do diretório."
          />
          <article className="platform-panel directory-card">
            <div className="directory-metric-cards">
              <DirectoryStatCard
                tone="blue"
                icon={<IconSearch size={21} />}
                label="Visualizações"
                value={metrics.data?.summary.pageViews ?? 0}
              />
              <DirectoryStatCard
                tone="green"
                icon={<IconMessageCircle size={21} />}
                label="Cliques no WhatsApp"
                value={metrics.data?.summary.whatsappClicks ?? 0}
              />
              <DirectoryStatCard
                tone="purple"
                icon={<IconCircleCheck size={21} />}
                label="Cliques únicos"
                value={metrics.data?.summary.uniqueWhatsappClicks ?? 0}
              />
              <DirectoryStatCard
                tone="gold"
                icon={<IconArrowRight size={21} />}
                label="CTR"
                value={`${((metrics.data?.summary.whatsappCtr ?? 0) * 100).toFixed(1)}%`}
              />
              <DirectoryStatCard
                tone="orange"
                icon={<IconRoute size={21} />}
                label="Como chegar"
                value="—"
                hint="ainda não mensurado"
              />
              <DirectoryStatCard
                tone="green"
                icon={<IconChartBar size={21} />}
                label="Conversão"
                value={`${((metrics.data?.summary.whatsappCtr ?? 0) * 100).toFixed(1)}%`}
                hint="visualização → contato"
              />
            </div>
            <div className="platform-actions">
              <label>
                Período{' '}
                <select value={period} onChange={(event) => setPeriod(event.target.value)}>
                  <option value="1">Hoje</option>
                  <option value="7">7 dias</option>
                  <option value="30">30 dias</option>
                  <option value="all">Todo período</option>
                </select>
              </label>
              <label>
                Categoria{' '}
                <select
                  value={categorySlug}
                  onChange={(event) => setCategorySlug(event.target.value)}
                >
                  <option value="">Todas</option>
                  {categories.data?.map((item) => (
                    <option key={item.slug} value={item.slug}>
                      {item.pluralName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                UF{' '}
                <input
                  value={state}
                  maxLength={2}
                  onChange={(event) => setState(event.target.value)}
                />
              </label>
              <label>
                Cidade <input value={city} onChange={(event) => setCity(event.target.value)} />
              </label>
              <label>
                Empresa <input value={search} onChange={(event) => setSearch(event.target.value)} />
              </label>
              <label>
                Cliente Agendei{' '}
                <select value={hasTenant} onChange={(event) => setHasTenant(event.target.value)}>
                  <option value="">Todos</option>
                  <option value="true">Sim</option>
                  <option value="false">Não</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() =>
                  window.open(
                    `/api/platform/directory/metrics.csv?${params}`,
                    '_blank',
                    'noopener,noreferrer',
                  )
                }
              >
                Exportar CSV
              </button>
            </div>
            <div className="directory-ranking-card">
              <div>
                <h3>Ranking de oportunidade</h3>
                <p>Estabelecimentos com maior intenção e ainda sem App Agendei.</p>
              </div>
              <ol>
                {metrics.data?.ranking.slice(0, 5).map((row, index, ranking) => {
                  const maximum = Math.max(...ranking.map((item) => item.whatsappClicks), 1);
                  return (
                    <li key={row.businessPublicId}>
                      <strong>{index + 1}</strong>
                      <span>
                        <b>{row.business}</b>
                        <i>
                          <em style={{ width: `${(row.whatsappClicks / maximum) * 100}%` }} />
                        </i>
                      </span>
                      <small>{row.whatsappClicks} cliques</small>
                    </li>
                  );
                })}
              </ol>
            </div>
            <div
              style={{ marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'center' }}
            >
              <button
                onClick={() => setMetricsPage(Math.max(1, metricsPage - 1))}
                disabled={metricsPage === 1}
              >
                ← Anterior
              </button>
              <span>
                Página {metricsPage} de{' '}
                {Math.ceil((metrics.data?.total ?? 0) / METRICS_PER_PAGE) || 1}
              </span>
              <button
                onClick={() => setMetricsPage(metricsPage + 1)}
                disabled={!metrics.data?.rows || metrics.data.rows.length < METRICS_PER_PAGE}
              >
                Próxima →
              </button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Estabelecimento</th>
                  <th>Categoria</th>
                  <th>Cidade</th>
                  <th>Views</th>
                  <th>Cliques</th>
                  <th>Únicos</th>
                  <th>CTR</th>
                  <th>Último clique</th>
                  <th>Cliente?</th>
                </tr>
              </thead>
              <tbody>
                {metrics.data?.rows.map((row) => (
                  <tr key={row.businessPublicId}>
                    <td>
                      <button type="button" onClick={() => setSelectedMetric(row.businessPublicId)}>
                        {row.business}
                      </button>
                    </td>
                    <td>{row.category}</td>
                    <td>
                      {row.city}/{row.state}
                    </td>
                    <td>{row.pageViews}</td>
                    <td>{row.whatsappClicks}</td>
                    <td>{row.uniqueWhatsappClicks}</td>
                    <td>{(row.whatsappCtr * 100).toFixed(1)}%</td>
                    <td>{date(row.lastWhatsappClickAt)}</td>
                    <td>{row.tenantLinked ? 'Sim' : 'Não'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: '16px', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={() => setMetricsPage(Math.max(1, metricsPage - 1))}
                disabled={metricsPage === 1}
              >
                ← Anterior
              </button>
              <span>
                Página {metricsPage} de{' '}
                {Math.ceil((metrics.data?.total ?? 0) / METRICS_PER_PAGE) || 1}
              </span>
              <button
                onClick={() => setMetricsPage(metricsPage + 1)}
                disabled={!metrics.data?.rows || metrics.data.rows.length < METRICS_PER_PAGE}
              >
                Próxima →
              </button>
            </div>
            {detail.data?.detail ? (
              <aside>
                <h3>Métricas de {detail.data.detail.business}</h3>
                <p>
                  Visualizações: {detail.data.detail.pageViews} · Cliques:{' '}
                  {detail.data.detail.whatsappClicks} · Únicos:{' '}
                  {detail.data.detail.uniqueWhatsappClicks} · CTR:{' '}
                  {(detail.data.detail.whatsappCtr * 100).toFixed(1)}% · Último clique:{' '}
                  {date(detail.data.detail.lastWhatsappClickAt)}
                </p>
                <p>
                  Evolução diária:{' '}
                  {detail.data.detail.daily
                    .map(
                      (item) =>
                        `${item.date}: ${item.pageViews} visualizações, ${item.whatsappClicks} cliques`,
                    )
                    .join(' · ') || 'Sem eventos no período.'}
                </p>
              </aside>
            ) : null}
          </article>
        </div>
      ) : null}
      {activeTab === 'imports' ? (
        <div className="directory-tab-content">
          <DirectorySectionHeader
            eyebrow="Dados"
            title="Importações"
            description="Analise, revise e processe arquivos XML com acompanhamento de progresso e erros."
          />
          <article className="platform-panel directory-card directory-upload-card">
            <h2>Importar XML</h2>
            <p>O arquivo é analisado antes de qualquer estabelecimento ser gravado.</p>
            <input
              type="file"
              accept=".xml,application/xml,text/xml"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) upload.mutate(file);
              }}
            />
            {upload.error instanceof Error ? <ErrorState message={upload.error.message} /> : null}
          </article>
          {preview ? (
            <article className="platform-panel">
              <h2>{preview.import.filename}</h2>
              <p>
                {preview.import.errors > 0 && preview.import.remaining === 0
                  ? 'Concluída com erros · '
                  : ''}
                {preview.import.totalFound} estabelecimentos encontrados ·{' '}
                {preview.import.processedCount}/{preview.import.totalSelected} processados
              </p>
              <div className="directory-import-summary">
                <span>
                  <strong>{preview.import.totalCreated}</strong>Novos
                </span>
                <span>
                  <strong>{preview.import.totalUpdated}</strong>Atualizados
                </span>
                <span>
                  <strong>{preview.import.totalUnchanged}</strong>Iguais
                </span>
                <span>
                  <strong>{preview.import.totalDuplicates}</strong>Duplicados
                </span>
                <span className={preview.import.errors > 0 ? 'has-error' : undefined}>
                  <strong>{preview.import.errors}</strong>Erros
                </span>
              </div>
              <div className="directory-import-progress">
                <div>
                  <span>Progresso da execução</span>
                  <strong>{preview.import.progressPercent}%</strong>
                </div>
                <progress max={100} value={preview.import.progressPercent} />
              </div>
              {configureError && (
                <div
                  style={{
                    marginBottom: '1rem',
                    padding: '0.75rem',
                    backgroundColor: 'var(--ds-background-negative-subtle)',
                    borderRadius: '4px',
                    color: 'var(--ds-text-negative)',
                    fontSize: '0.9rem',
                  }}
                >
                  <strong>Erro ao preparar:</strong> {configureError}
                </div>
              )}
              {processError && (
                <div
                  style={{
                    marginBottom: '1rem',
                    padding: '0.75rem',
                    backgroundColor: 'var(--ds-background-negative-subtle)',
                    borderRadius: '4px',
                    color: 'var(--ds-text-negative)',
                    fontSize: '0.9rem',
                  }}
                >
                  <strong>Erro ao processar:</strong> {processError}
                </div>
              )}
              <ul>
                {preview.categories.map((item) => (
                  <li key={`${item.slug}-${item.name}`}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedDetected.includes(item.detected)}
                        onChange={(event) =>
                          setSelectedDetected((current) =>
                            event.target.checked
                              ? [...new Set([...current, item.detected])]
                              : current.filter((value) => value !== item.detected),
                          )
                        }
                      />
                      <strong>{item.name}</strong>: {item.count}
                    </label>
                    <small>
                      {item.created} novos · {item.updated} atualizações · {item.unchanged} sem
                      alteração · {item.duplicates} possíveis duplicados
                    </small>
                    {item.existing ? null : (
                      <button
                        type="button"
                        onClick={() => {
                          setNewCategory({
                            detected: item.detected,
                            name: item.name,
                            singularName: item.detected,
                            pluralName: item.name,
                            slug: item.detected
                              .toLowerCase()
                              .normalize('NFD')
                              .replace(/[\u0300-\u036f]/gu, '')
                              .replace(/[^a-z0-9]+/gu, '-')
                              .replace(/(^-|-$)/gu, ''),
                          });
                          setSelectedDetected((current) => [
                            ...new Set([...current, item.detected]),
                          ]);
                        }}
                      >
                        Criar categoria
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {newCategory ? (
                <fieldset>
                  <legend>Novo nicho detectado</legend>
                  <input
                    value={newCategory.singularName}
                    aria-label="Nome singular"
                    onChange={(event) =>
                      setNewCategory({ ...newCategory, singularName: event.target.value })
                    }
                  />
                  <input
                    value={newCategory.pluralName}
                    aria-label="Nome plural"
                    onChange={(event) =>
                      setNewCategory({
                        ...newCategory,
                        name: event.target.value,
                        pluralName: event.target.value,
                      })
                    }
                  />
                  <input
                    value={newCategory.slug}
                    aria-label="Slug"
                    onChange={(event) =>
                      setNewCategory({ ...newCategory, slug: event.target.value })
                    }
                  />
                </fieldset>
              ) : null}
              <div className="platform-actions">
                <button
                  type="button"
                  onClick={() => configure.mutate()}
                  disabled={
                    configure.isPending ||
                    selectedDetected.length === 0 ||
                    preview.import.status !== 'ANALYZED'
                  }
                >
                  Preparar seleção
                </button>
                <button
                  type="button"
                  onClick={() => process.mutate()}
                  disabled={
                    process.isPending ||
                    preview.import.status === 'COMPLETED' ||
                    preview.import.status === 'PAUSED'
                  }
                >
                  Continuar
                </button>
                {preview.import.status === 'PAUSED' ? (
                  <button type="button" onClick={() => resume.mutate()} disabled={resume.isPending}>
                    Retomar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => pause.mutate()}
                    disabled={pause.isPending || preview.import.status === 'COMPLETED'}
                  >
                    Pausar
                  </button>
                )}
                {preview.import.errors > 0 ? (
                  <>
                    <button type="button" onClick={() => setShowErrors(true)}>
                      Ver erros
                    </button>
                    <button
                      type="button"
                      onClick={() => retryErrors.mutate()}
                      disabled={retryErrors.isPending}
                    >
                      Reprocessar erros
                    </button>
                  </>
                ) : null}
              </div>
              <p>
                Novos: {preview.import.totalCreated} · Atualizados: {preview.import.totalUpdated} ·
                Iguais: {preview.import.totalUnchanged} · Possíveis duplicados:{' '}
                {preview.import.totalDuplicates} · Erros: {preview.import.errors}
              </p>
              {showErrors ? (
                <ul>
                  {importErrors.data?.slice(0, 10).map((item) => (
                    <li key={item.position}>
                      {item.position} · {item.name} · {item.city}/{item.state}: {item.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ) : null}
          <article className="platform-panel directory-card">
            <DirectorySectionHeader
              title="Histórico recente"
              description="Retome uma importação ou confira o resultado dos últimos arquivos processados."
            />
            <div className="directory-table-wrap">
              <table className="directory-table">
                <thead>
                  <tr>
                    <th>Arquivo</th>
                    <th>Status</th>
                    <th>Progresso</th>
                    <th>Novos</th>
                    <th>Atualizados</th>
                    <th>Data</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedImports.map((item) => (
                    <tr key={item.publicId}>
                      <td>
                        <strong>{item.filename}</strong>
                      </td>
                      <td>
                        <DirectoryBadge
                          tone={
                            item.status === 'COMPLETED'
                              ? 'success'
                              : item.status === 'FAILED'
                                ? 'danger'
                                : 'info'
                          }
                        >
                          {item.status}
                        </DirectoryBadge>
                      </td>
                      <td>
                        {item.processedCount}/{item.totalSelected}
                      </td>
                      <td>{item.totalCreated}</td>
                      <td>{item.totalUpdated}</td>
                      <td>{date(item.createdAt)}</td>
                      <td>
                        <button
                          type="button"
                          className="directory-link-button"
                          onClick={() =>
                            httpClient
                              .request(`/platform/directory/imports/${item.publicId}`, {
                                schema: ImportPreview,
                              })
                              .then((data) => {
                                setPreview(data);
                                setSelectedDetected(
                                  data.categories
                                    .filter((category) => category.existing)
                                    .map((category) => category.detected),
                                );
                              })
                          }
                        >
                          Abrir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DirectoryPagination
              page={importsPage}
              total={(imports.data ?? []).length}
              totalPages={Math.ceil((imports.data?.length ?? 0) / IMPORT_PAGE_SIZE)}
              onPage={setImportsPage}
            />
          </article>
        </div>
      ) : null}
      {activeTab === 'categories' ? (
        <div className="directory-tab-content">
          <DirectorySectionHeader
            eyebrow="Taxonomia"
            title="Categorias"
            description="Organize nichos, indexação e regras de busca externa."
            action={
              <button
                type="button"
                className="directory-button directory-button--primary"
                onClick={() => setCategoryForm('create')}
              >
                <IconPlus size={18} /> Nova categoria
              </button>
            }
          />
          <article className="platform-panel directory-card">
            <div className="directory-filter-bar">
              <label>
                <span>Buscar categoria</span>
                <input
                  value={categorySearch}
                  placeholder="Nome ou slug"
                  onChange={(event) => {
                    setCategorySearch(event.target.value);
                    setCategoryPage(1);
                  }}
                />
              </label>
            </div>
            <div className="directory-table-wrap">
              <table className="directory-table">
                <thead>
                  <tr>
                    <th>Categoria</th>
                    <th>Slug</th>
                    <th>Estabelecimentos</th>
                    <th>Status</th>
                    <th>Indexável</th>
                    <th>Geoapify</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedCategories.map((item) => (
                    <tr key={item.publicId}>
                      <td>
                        <strong>{item.pluralName}</strong>
                        <small>{item.singularName}</small>
                      </td>
                      <td>{item.slug}</td>
                      <td>{item._count.businesses}</td>
                      <td>
                        <DirectoryBadge tone={item.active ? 'success' : 'neutral'}>
                          {item.active ? 'Ativa' : 'Inativa'}
                        </DirectoryBadge>
                      </td>
                      <td>
                        <DirectoryBadge tone={item.indexable ? 'info' : 'warning'}>
                          {item.indexable ? 'Sim' : 'Não'}
                        </DirectoryBadge>
                      </td>
                      <td>
                        <DirectoryBadge
                          tone={item.geoapifyCategories?.length ? 'success' : 'warning'}
                        >
                          {item.geoapifyCategories?.length
                            ? `${item.geoapifyCategories.length} regras`
                            : 'Pendente'}
                        </DirectoryBadge>
                      </td>
                      <td className="directory-actions-cell">
                        <details>
                          <summary aria-label={`Ações para ${item.pluralName}`}>•••</summary>
                          <div>
                            <button type="button" onClick={() => setCategoryForm(item.publicId)}>
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                categoryUpdate.mutate({
                                  publicId: item.publicId,
                                  body: { active: !item.active },
                                })
                              }
                            >
                              {item.active ? 'Desativar' : 'Ativar'}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                categoryUpdate.mutate({
                                  publicId: item.publicId,
                                  body: { indexable: !item.indexable },
                                })
                              }
                            >
                              {item.indexable ? 'Não indexar' : 'Indexar'}
                            </button>
                            <button type="button" onClick={() => setCategoryForm(item.publicId)}>
                              Configurar Geoapify
                            </button>
                          </div>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DirectoryPagination
              page={categoryPage}
              total={filteredCategories.length}
              totalPages={Math.ceil(filteredCategories.length / CATEGORY_PAGE_SIZE)}
              onPage={setCategoryPage}
            />
          </article>
        </div>
      ) : null}

      {activeTab === 'businesses' ? (
        <div className="directory-tab-content">
          <DirectorySectionHeader
            eyebrow="Catálogo"
            title="Estabelecimentos"
            description="Revise presença, qualidade SEO e publicação de cada negócio."
            action={
              <button
                type="button"
                className="directory-button directory-button--primary"
                onClick={() => setBusinessForm({ mode: 'create' })}
              >
                <IconPlus size={18} /> Adicionar estabelecimento
              </button>
            }
          />
          <div className="directory-filter-bar directory-filter-bar--businesses">
            <label>
              <span>Buscar</span>
              <input
                value={businessSearch}
                placeholder="Nome do estabelecimento"
                onChange={(event) => setBusinessSearch(event.target.value)}
              />
            </label>
            <label>
              <span>Categoria</span>
              <select
                value={businessCategory}
                onChange={(event) => setBusinessCategory(event.target.value)}
              >
                <option value="">Todas</option>
                {categories.data?.map((item) => (
                  <option key={item.publicId} value={item.slug}>
                    {item.pluralName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Cidade</span>
              <input
                value={businessCity}
                placeholder="Cidade"
                onChange={(event) => setBusinessCity(event.target.value)}
              />
            </label>
            <label>
              <span>UF</span>
              <input
                value={businessState}
                maxLength={2}
                placeholder="UF"
                onChange={(event) => setBusinessState(event.target.value.toUpperCase())}
              />
            </label>
            <label>
              <span>Status</span>
              <select
                value={businessStatus}
                onChange={(event) => setBusinessStatus(event.target.value)}
              >
                <option value="">Todos</option>
                <option value="true">Ativos</option>
                <option value="false">Inativos</option>
              </select>
            </label>
            <label>
              <span>Indexação</span>
              <select
                value={businessIndexable}
                onChange={(event) => setBusinessIndexable(event.target.value)}
              >
                <option value="">Todos</option>
                <option value="true">Indexáveis</option>
                <option value="false">Não indexáveis</option>
              </select>
            </label>
          </div>
          <div className="directory-table-wrap">
            <table className="directory-table directory-business-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Categoria</th>
                  <th>Cidade/Estado</th>
                  <th>WhatsApp</th>
                  <th>Status</th>
                  <th>Indexável</th>
                  <th>SEO score</th>
                  <th>Atualização</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {businesses.data?.items.map((item) => (
                  <tr key={item.publicId}>
                    <td>
                      <strong>{item.name}</strong>
                    </td>
                    <td>{item.category.pluralName}</td>
                    <td>
                      {item.city}/{item.state}
                    </td>
                    <td>{item.whatsapp ?? '—'}</td>
                    <td>
                      <DirectoryBadge tone={item.active ? 'success' : 'neutral'}>
                        {item.active ? 'Ativo' : 'Inativo'}
                      </DirectoryBadge>
                    </td>
                    <td>
                      <DirectoryBadge tone={item.indexable ? 'info' : 'warning'}>
                        {item.indexable ? 'Sim' : 'Não'}
                      </DirectoryBadge>
                    </td>
                    <td>
                      <span className="directory-score">
                        <i style={{ width: `${item.seoQualityScore}%` }} />
                        {item.seoQualityScore}
                      </span>
                    </td>
                    <td>{new Intl.DateTimeFormat('pt-BR').format(item.updatedAt)}</td>
                    <td className="directory-actions-cell">
                      <details
                        open={openBusinessMenu === item.publicId}
                        onToggle={(event) =>
                          setOpenBusinessMenu(
                            (event.currentTarget as HTMLDetailsElement).open
                              ? item.publicId
                              : undefined,
                          )
                        }
                      >
                        <summary aria-label={`Ações para ${item.name}`}>•••</summary>
                        <div>
                          <button
                            type="button"
                            onClick={() =>
                              setBusinessForm({ mode: 'edit', publicId: item.publicId })
                            }
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              businessUpdate.mutate({
                                publicId: item.publicId,
                                body: { active: !item.active },
                              })
                            }
                          >
                            {item.active ? 'Desativar' : 'Ativar'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              businessUpdate.mutate({
                                publicId: item.publicId,
                                body: { indexable: !item.indexable },
                              })
                            }
                          >
                            {item.indexable ? 'Não indexar' : 'Indexar'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setBusinessForm({ mode: 'edit', publicId: item.publicId })
                            }
                          >
                            Ver detalhes
                          </button>
                        </div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {businesses.data?.items.length === 0 ? (
              <div className="directory-empty">
                Nenhum estabelecimento encontrado com esses filtros.
              </div>
            ) : null}
          </div>
          <DirectoryPagination
            page={businesses.data?.page ?? businessPage}
            total={businesses.data?.total ?? 0}
            totalPages={businesses.data?.totalPages ?? 0}
            onPage={setBusinessPage}
          />
        </div>
      ) : null}

      {activeTab === 'settings' ? (
        <div className="directory-tab-content">
          <DirectorySectionHeader
            eyebrow="Governança"
            title="Configurações"
            description="Centralize os padrões que orientam publicação, descoberta e manutenção do diretório."
          />
          <div className="directory-settings-grid">
            <article className="directory-card">
              <span className="directory-card__eyebrow">SEO</span>
              <h3>Indexação e sitemap</h3>
              <p>
                As regras efetivas são calculadas pela qualidade do cadastro, status da categoria e
                opção indexável.
              </p>
              <button
                type="button"
                className="directory-link-button"
                onClick={() => setActiveTab('seo')}
              >
                Abrir configurações SEO <IconArrowRight size={16} />
              </button>
            </article>
            <article className="directory-card">
              <span className="directory-card__eyebrow">Novos registros</span>
              <h3>Padrões de publicação</h3>
              <p>
                Novos estabelecimentos e categorias continuam editáveis no cadastro e na prévia da
                importação.
              </p>
              <button
                type="button"
                className="directory-link-button"
                onClick={() => setActiveTab('categories')}
              >
                Gerenciar categorias <IconArrowRight size={16} />
              </button>
            </article>
            <article className="directory-card">
              <span className="directory-card__eyebrow">Importação</span>
              <h3>Revisão antes de gravar</h3>
              <p>O XML é analisado, classificado e confirmado antes do processamento em lotes.</p>
              <button
                type="button"
                className="directory-link-button"
                onClick={() => setActiveTab('imports')}
              >
                Abrir importações <IconArrowRight size={16} />
              </button>
            </article>
            <article className="directory-card">
              <span className="directory-card__eyebrow">Cache externo</span>
              <h3>Geoapify e atualização</h3>
              <p>
                A alteração da configuração por categoria invalida o cache externo automaticamente.
              </p>
              <button
                type="button"
                className="directory-link-button"
                onClick={() => setActiveTab('geo')}
              >
                Configurar geolocalização <IconArrowRight size={16} />
              </button>
            </article>
          </div>
        </div>
      ) : null}
      {categoryForm !== null ? (
        <DirectoryCategoryForm
          {...(categoryForm === 'create'
            ? {}
            : {
                category: categories.data?.find(
                  (item) => item.publicId === categoryForm,
                ) as DirectoryCategoryValue,
              })}
          onClose={() => setCategoryForm(null)}
        />
      ) : null}
      {businessForm && (
        <DirectoryBusinessForm
          {...(businessForm.mode === 'edit'
            ? { businessPublicId: businessForm.publicId }
            : {})}
          onClose={() => setBusinessForm(null)}
        />
      )}
    </section>
  );
}
