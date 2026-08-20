import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';

import { httpClient } from '../../lib/http.js';
import { runMaintenanceLoop } from './directory-maintenance-runner.js';
import { Pagination } from './PlatformUi.js';

const PAGE_SIZE = 20;
const row = z.object({ businessPublicId: z.string(), business: z.string(), city: z.string(), state: z.string(), tenantLinked: z.boolean(), impressions: z.number(), googleClicks: z.number(), googleCtr: z.number(), position: z.number(), pageViews: z.number(), whatsappClicks: z.number(), uniqueWhatsappClicks: z.number(), whatsappConversion: z.number() });
const searchQuery = z.object({ query: z.string(), clicks: z.number(), impressions: z.number(), ctr: z.number(), position: z.number() });
const inspection = z.object({ publicId: z.string(), url: z.string(), status: z.string(), priority: z.number(), attempts: z.number(), lastError: z.string().nullable(), verdict: z.string().nullable(), coverageState: z.string().nullable(), googleCanonical: z.string().nullable(), lastCrawlAt: z.string().nullable(), processedAt: z.string().nullable() });
const overview = z.object({ status: z.object({ searchConsoleConfigured: z.boolean(), indexNowConfigured: z.boolean(), lastSearchConsoleSyncAt: z.string().nullable(), lastSearchConsoleSyncStatus: z.string().nullable() }), summary: z.object({ impressions: z.number(), googleClicks: z.number(), googleCtr: z.number(), position: z.number(), pageViews: z.number(), whatsappClicks: z.number(), pageToWhatsapp: z.number() }), rows: z.array(row), opportunities: z.array(row) });
const submission = z.object({ publicId: z.string(), url: z.string(), provider: z.string(), reason: z.string(), status: z.string(), attempts: z.number(), lastError: z.string().nullable(), createdAt: z.string(), processedAt: z.string().nullable() });
const businessDetail = z.object({ business: z.object({ publicId: z.string(), name: z.string(), url: z.string() }), google: z.object({ impressions: z.number(), clicks: z.number(), ctr: z.number(), position: z.number() }), queries: z.array(searchQuery), inspection: inspection.nullable() });
const maintenanceStatus = z.object({ seoPendingCount: z.number(), cityAggregates: z.object({ pendingCount: z.number(), processingCount: z.number(), failedCount: z.number(), processedCount: z.number(), oldestPendingAt: z.string().nullable() }), aggregatesQueueSize: z.number(), oldestPendingAt: z.string().nullable() });
const seoBatchResult = z.object({ processedCount: z.number(), errorCount: z.number(), aggregatesEnqueued: z.number() });
const aggregatesBatchResult = z.object({ processed: z.number() });
type Sort = 'impressions' | 'googleClicks' | 'whatsappClicks' | 'whatsappConversion' | 'position';
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const totalPages = (total: number) => Math.max(Math.ceil(total / PAGE_SIZE), 1);
const pageItems = <Item,>(items: Item[], page: number) => items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

function PagedTableFooter({ page, total, onPage }: { page: number; total: number; onPage: (page: number) => void }) {
  if (total <= PAGE_SIZE) return null;
  return <Pagination page={page} totalPages={totalPages(total)} total={total} limit={PAGE_SIZE} onPage={onPage} />;
}

export function DirectorySeoPanel() {
  const cache = useQueryClient();
  const [period, setPeriod] = useState('28'); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [tab, setTab] = useState<'overview' | 'queries' | 'indexing' | 'sitemaps' | 'maintenance'>('overview'); const [sort, setSort] = useState<Sort>('impressions');
  const [manualUrl, setManualUrl] = useState(''); const [selected, setSelected] = useState<string | null>(null);
  const [categorySlug, setCategorySlug] = useState(''); const [city, setCity] = useState('');
  const [overviewPage, setOverviewPage] = useState(1); const [queriesPage, setQueriesPage] = useState(1);
  const [submissionsPage, setSubmissionsPage] = useState(1); const [inspectionsPage, setInspectionsPage] = useState(1);
  const params = useMemo(() => { const value = new URLSearchParams(); if (categorySlug) value.set('categorySlug', categorySlug); if (city) value.set('city', city); if (period === 'custom') { if (from) value.set('from', from); if (to) value.set('to', to); return value; } const end = new Date(); const start = new Date(end); start.setDate(end.getDate() - Number(period) + 1); value.set('from', start.toISOString().slice(0, 10)); value.set('to', end.toISOString().slice(0, 10)); return value; }, [period, from, to, categorySlug, city]);
  const seo = useQuery({ queryKey: ['platform', 'directory', 'seo', params.toString()], queryFn: () => httpClient.request(`/platform/directory/seo/overview?${params}`, { schema: overview }) });
  const queries = useQuery({ enabled: tab === 'queries', queryKey: ['platform', 'directory', 'seo-queries', params.toString()], queryFn: () => httpClient.request(`/platform/directory/seo/queries?${params}`, { schema: z.array(searchQuery) }) });
  const submissions = useQuery({ enabled: tab === 'indexing', queryKey: ['platform', 'directory', 'seo-submissions'], queryFn: () => httpClient.request('/platform/directory/seo/submissions', { schema: z.array(submission) }) });
  const inspections = useQuery({ enabled: tab === 'indexing', queryKey: ['platform', 'directory', 'seo-inspections'], queryFn: () => httpClient.request('/platform/directory/seo/inspections', { schema: z.array(inspection) }) });
  const detail = useQuery({ enabled: selected !== null, queryKey: ['platform', 'directory', 'seo-business', selected], queryFn: () => httpClient.request(`/platform/directory/seo/businesses/${selected}`, { schema: businessDetail }) });
  const sitemaps = useQuery({ enabled: tab === 'sitemaps', queryKey: ['platform', 'directory', 'seo-sitemaps'], queryFn: () => httpClient.request('/platform/directory/seo/sitemaps', { schema: z.object({ configured: z.boolean(), sitemap: z.string(), entries: z.array(z.unknown()) }) }) });
  const maintenance = useQuery({ enabled: tab === 'maintenance', queryKey: ['platform', 'directory', 'maintenance-status'], queryFn: () => httpClient.request('/platform/directory/maintenance/status', { schema: maintenanceStatus }) });
  const [maintenanceRunning, setMaintenanceRunning] = useState(false);
  const [maintenancePhase, setMaintenancePhase] = useState<'idle' | 'seo' | 'aggregates' | 'done'>('idle');
  const [maintenanceProcessed, setMaintenanceProcessed] = useState(0);
  const [maintenanceTotal, setMaintenanceTotal] = useState(0);
  const [maintenanceErrors, setMaintenanceErrors] = useState(0);
  const maintenancePausedRef = useRef(false);
  const runSeoBatch = async () => {
    const result = await httpClient.request('/platform/directory/maintenance/seo/process-batch', { method: 'POST', schema: seoBatchResult });
    await maintenance.refetch();
    return result;
  };
  const runAggregatesBatch = async () => {
    const result = await httpClient.request('/platform/directory/maintenance/aggregates/process-batch', { method: 'POST', schema: aggregatesBatchResult });
    await maintenance.refetch();
    return result;
  };
  const processOneBatch = async () => {
    setMaintenanceRunning(true);
    setMaintenancePhase('seo');
    setMaintenanceProcessed(0);
    setMaintenanceErrors(0);
    setMaintenanceTotal(maintenance.data?.seoPendingCount ?? 0);
    const result = await runSeoBatch();
    setMaintenanceProcessed(result.processedCount);
    setMaintenanceErrors(result.errorCount);
    setMaintenancePhase('idle');
    setMaintenanceRunning(false);
  };
  const processAll = async () => {
    maintenancePausedRef.current = false;
    setMaintenanceRunning(true);
    setMaintenancePhase('seo');
    setMaintenanceProcessed(0);
    setMaintenanceErrors(0);
    setMaintenanceTotal(maintenance.data?.seoPendingCount ?? 0);
    const outcome = await runMaintenanceLoop({
      runSeoBatch,
      runAggregatesBatch,
      isPaused: () => maintenancePausedRef.current,
      onSeoProgress: ({ processed, errors }) => {
        setMaintenanceProcessed(processed);
        setMaintenanceErrors(errors);
      },
      onAggregatesStart: () => setMaintenancePhase('aggregates'),
    });
    setMaintenancePhase(outcome === 'done' ? 'done' : 'idle');
    setMaintenanceRunning(false);
  };
  const pauseMaintenance = () => { maintenancePausedRef.current = true; };
  const sync = useMutation({ mutationFn: () => httpClient.request('/platform/directory/seo/search-console/sync', { method: 'POST', schema: z.unknown() }), onSuccess: () => cache.invalidateQueries({ queryKey: ['platform', 'directory', 'seo'] }) });
  const enqueue = useMutation({ mutationFn: (url: string) => httpClient.request('/platform/directory/seo/indexnow/enqueue', { method: 'POST', body: { url }, schema: z.unknown() }), onSuccess: () => { setManualUrl(''); return cache.invalidateQueries({ queryKey: ['platform', 'directory', 'seo-submissions'] }); } });
  const retry = useMutation({ mutationFn: (id: string) => httpClient.request(`/platform/directory/seo/submissions/${id}/retry`, { method: 'POST', schema: z.unknown() }), onSuccess: () => cache.invalidateQueries({ queryKey: ['platform', 'directory', 'seo-submissions'] }) });
  const submitSitemap = useMutation({ mutationFn: () => httpClient.request('/platform/directory/seo/sitemaps/submit', { method: 'POST', schema: z.unknown() }) });
  const rows = useMemo(() => [...(seo.data?.rows ?? [])].sort((a, b) => sort === 'position' ? a.position - b.position : b[sort] - a[sort]), [seo.data?.rows, sort]);
  const pagedRows = pageItems(rows, overviewPage); const pagedQueries = pageItems(queries.data ?? [], queriesPage); const pagedSubmissions = pageItems(submissions.data ?? [], submissionsPage); const pagedInspections = pageItems(inspections.data ?? [], inspectionsPage);
  useEffect(() => { setOverviewPage(1); setQueriesPage(1); }, [params, sort]);
  useEffect(() => { setOverviewPage((page) => Math.min(page, totalPages(rows.length))); }, [rows.length]);
  useEffect(() => { setQueriesPage((page) => Math.min(page, totalPages(queries.data?.length ?? 0))); }, [queries.data?.length]);
  useEffect(() => { setSubmissionsPage((page) => Math.min(page, totalPages(submissions.data?.length ?? 0))); }, [submissions.data?.length]);
  useEffect(() => { setInspectionsPage((page) => Math.min(page, totalPages(inspections.data?.length ?? 0))); }, [inspections.data?.length]);

  return <article className="platform-panel"><h2>SEO</h2><p>Dados do Google podem ter atraso de processamento. As taxas são agregadas e não identificam o mesmo usuário.</p>{!seo.data?.status.searchConsoleConfigured ? <p>Search Console não configurado</p> : <p>Última sincronização: {seo.data.status.lastSearchConsoleSyncAt ?? 'ainda não executada'} · {seo.data.status.lastSearchConsoleSyncStatus ?? 'PENDENTE'}</p>}<div className="platform-actions"><label>Período <select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="7">7 dias</option><option value="28">28 dias</option><option value="90">3 meses</option><option value="custom">Personalizado</option></select></label>{period === 'custom' ? <><label>De <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>Até <input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label></> : null}<button type="button" onClick={() => sync.mutate()} disabled={sync.isPending}>Atualizar dados do Google</button><button type="button" onClick={() => window.open(`/api/platform/directory/seo/businesses.csv?${params}`, '_blank', 'noopener,noreferrer')}>Exportar CSV</button></div><nav className="platform-actions" aria-label="Seções SEO"><button type="button" onClick={() => setTab('overview')}>Visão geral</button><button type="button" onClick={() => setTab('queries')}>Consultas</button><button type="button" onClick={() => setTab('indexing')}>Indexação</button><button type="button" onClick={() => setTab('sitemaps')}>Sitemaps</button><button type="button" onClick={() => setTab('maintenance')}>Manutenção SEO</button></nav>{tab === 'overview' ? <><p>Impressões Google: {seo.data?.summary.impressions ?? 0} · Cliques Google: {seo.data?.summary.googleClicks ?? 0} · CTR Google: {percent(seo.data?.summary.googleCtr ?? 0)} · Posição média: {(seo.data?.summary.position ?? 0).toFixed(1)} · Visualizações: {seo.data?.summary.pageViews ?? 0} · Cliques WhatsApp: {seo.data?.summary.whatsappClicks ?? 0} · Conversão página → WhatsApp: {percent(seo.data?.summary.pageToWhatsapp ?? 0)}</p><h3>Oportunidades SEO</h3>{seo.data?.opportunities.slice(0, 5).map((item) => <p key={item.businessPublicId}>{item.business} · {item.impressions} impressões · {item.googleClicks} cliques Google · {item.whatsappClicks} cliques WhatsApp</p>)}<label>Ordenar por <select value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="impressions">Impressões</option><option value="googleClicks">Cliques Google</option><option value="whatsappClicks">Cliques WhatsApp</option><option value="whatsappConversion">Conversão</option><option value="position">Posição</option></select></label><table><thead><tr><th>Empresa</th><th>Cidade</th><th>Impressões</th><th>Google</th><th>CTR</th><th>Posição</th><th>Views</th><th>WhatsApp</th><th>Conversão</th><th>Cliente?</th></tr></thead><tbody>{pagedRows.map((item) => <tr key={item.businessPublicId}><td><button type="button" onClick={() => setSelected(item.businessPublicId)}>{item.business}</button></td><td>{item.city}/{item.state}</td><td>{item.impressions}</td><td>{item.googleClicks}</td><td>{percent(item.googleCtr)}</td><td>{item.position.toFixed(1)}</td><td>{item.pageViews}</td><td>{item.whatsappClicks}</td><td>{percent(item.whatsappConversion)}</td><td>{item.tenantLinked ? 'Sim' : 'Não'}</td></tr>)}</tbody></table><PagedTableFooter page={overviewPage} total={rows.length} onPage={setOverviewPage} />{detail.data ? <aside><h3>Desempenho no Google: {detail.data.business.name}</h3><p>Últimos 28 dias · {detail.data.google.impressions} impressões · {detail.data.google.clicks} cliques · {percent(detail.data.google.ctr)} CTR · posição {detail.data.google.position.toFixed(1)}</p><p>Consultas principais: {detail.data.queries.map((item) => item.query).join(' · ') || 'Sem dados do Google no período.'}</p>{detail.data.inspection ? <p>Inspeção: {detail.data.inspection.verdict ?? detail.data.inspection.status} · {detail.data.inspection.coverageState ?? 'sem cobertura informada'} · Canonical: {detail.data.inspection.googleCanonical ?? 'não informado'} · Último crawl: {detail.data.inspection.lastCrawlAt ?? 'não informado'}</p> : null}</aside> : null}</> : null}{tab === 'queries' ? <><table><thead><tr><th>Consulta</th><th>Cliques</th><th>Impressões</th><th>CTR</th><th>Posição</th></tr></thead><tbody>{pagedQueries.map((item) => <tr key={item.query}><td>{item.query}</td><td>{item.clicks}</td><td>{item.impressions}</td><td>{percent(item.ctr)}</td><td>{item.position.toFixed(1)}</td></tr>)}</tbody></table><PagedTableFooter page={queriesPage} total={queries.data?.length ?? 0} onPage={setQueriesPage} /></> : null}{tab === 'indexing' ? <><div className="platform-actions"><input value={manualUrl} placeholder="https://agendei.site/encontre/..." onChange={(event) => setManualUrl(event.target.value)} /><button type="button" disabled={manualUrl === '' || enqueue.isPending} onClick={() => enqueue.mutate(manualUrl)}>Enviar URL manualmente</button></div><table><thead><tr><th>URL</th><th>Motivo</th><th>Provider</th><th>Status</th><th>Tentativas</th><th>Criada</th><th>Processada</th><th>Erro</th><th /></tr></thead><tbody>{pagedSubmissions.map((item) => <tr key={item.publicId}><td>{item.url}</td><td>{item.reason}</td><td>{item.provider}</td><td>{item.status}</td><td>{item.attempts}</td><td>{item.createdAt}</td><td>{item.processedAt ?? '—'}</td><td>{item.lastError ?? '—'}</td><td>{item.status === 'FAILED' ? <button type="button" onClick={() => retry.mutate(item.publicId)}>Reprocessar</button> : null}</td></tr>)}</tbody></table><PagedTableFooter page={submissionsPage} total={submissions.data?.length ?? 0} onPage={setSubmissionsPage} /><h3>Inspeções de URL</h3><table><thead><tr><th>URL</th><th>Status</th><th>Cobertura</th><th>Canonical</th><th>Tentativas</th><th>Erro</th></tr></thead><tbody>{pagedInspections.map((item) => <tr key={item.publicId}><td>{item.url}</td><td>{item.verdict ?? item.status}</td><td>{item.coverageState ?? '—'}</td><td>{item.googleCanonical ?? '—'}</td><td>{item.attempts}</td><td>{item.lastError ?? '—'}</td></tr>)}</tbody></table><PagedTableFooter page={inspectionsPage} total={inspections.data?.length ?? 0} onPage={setInspectionsPage} /></> : null}{tab === 'sitemaps' ? <><p>{sitemaps.data?.configured ? 'Search Console configurado.' : 'Search Console não configurado'}</p><p>{sitemaps.data?.sitemap}</p><button type="button" onClick={() => submitSitemap.mutate()} disabled={submitSitemap.isPending || !sitemaps.data?.configured}>Enviar sitemap ao Google</button><pre>{JSON.stringify(sitemaps.data?.entries ?? [], null, 2)}</pre></> : null}{tab === 'maintenance' ? <><h3>Manutenção SEO</h3><p>Negócios pendentes de avaliação SEO: {maintenance.data?.seoPendingCount ?? 0}</p><p>Jobs de agregados pendentes: {(maintenance.data?.cityAggregates.pendingCount ?? 0) + (maintenance.data?.cityAggregates.processingCount ?? 0)}</p><p>Jobs de agregados com falha: {maintenance.data?.cityAggregates.failedCount ?? 0}</p><div className="platform-actions"><button type="button" onClick={() => void processOneBatch()} disabled={maintenanceRunning}>Processar SEO</button><button type="button" onClick={() => void processAll()} disabled={maintenanceRunning}>Processar todos</button><button type="button" onClick={pauseMaintenance} disabled={!maintenanceRunning}>Pausar</button></div>{maintenanceRunning || maintenanceTotal > 0 ? <><p>{maintenanceProcessed} / {maintenanceTotal} processados{maintenanceErrors > 0 ? ` · ${maintenanceErrors} erros` : ''}</p><progress value={maintenanceProcessed} max={Math.max(maintenanceTotal, 1)} /></> : null}{maintenancePhase === 'done' ? <p>SEO processado com sucesso. <a href="/sitemap-directory.xml" target="_blank" rel="noreferrer">/sitemap-directory.xml</a> · <a href="/sitemap-directory-1.xml" target="_blank" rel="noreferrer">/sitemap-directory-1.xml</a></p> : null}</> : null}</article>;
}
