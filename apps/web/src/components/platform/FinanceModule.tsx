import {
  PlatformFinanceDashboardSchema,
  PlatformFinanceDelinquencyResponseSchema,
  PlatformFinanceOverviewSchema,
  PlatformFinanceReceiptsResponseSchema,
  PlatformFinanceSubscriptionsResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { environment } from '../../config/environment.js';
import { httpClient } from '../../lib/http.js';
import { ErrorState, formatDate, formatMoney, PageHeader, Pagination, StatusBadge } from './PlatformUi.js';

type FinanceTab = 'overview' | 'receipts' | 'subscriptions' | 'delinquency' | 'reports' | 'settings';

const tabs: { id: FinanceTab; label: string }[] = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'receipts', label: 'Recebimentos' },
  { id: 'subscriptions', label: 'Assinaturas' },
  { id: 'delinquency', label: 'Inadimplência' },
  { id: 'reports', label: 'Relatórios' },
  { id: 'settings', label: 'Configurações' },
];

/** Downloads a CSV from a finance endpoint (cookie-authenticated, not through httpClient since the response isn't JSON). */
async function downloadCsv(path: string, filename: string) {
  const response = await fetch(`${environment.apiUrl}${path}`, { credentials: 'include' });
  if (!response.ok) throw new Error('Não foi possível gerar a exportação.');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function FinanceModule() {
  const [tab, setTab] = useState<FinanceTab>('overview');
  return (
    <section>
      <PageHeader title="Financeiro" description="Receita recorrente, recebimentos e inadimplência da plataforma." />
      <nav className="prospecting-tabs" aria-label="Seções do financeiro">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? 'is-active' : undefined}
            onClick={() => {
              setTab(item.id);
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {tab === 'overview' ? (
        <FinanceOverviewTab onSeeReceipts={() => setTab('receipts')} />
      ) : tab === 'receipts' ? (
        <FinanceReceiptsTab />
      ) : tab === 'subscriptions' ? (
        <FinanceSubscriptionsTab />
      ) : tab === 'delinquency' ? (
        <FinanceDelinquencyTab />
      ) : tab === 'reports' ? (
        <FinanceReportsTab />
      ) : (
        <FinanceSettingsTab />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Visão geral                                                          */
/* ------------------------------------------------------------------ */

function FinanceOverviewTab({ onSeeReceipts }: { onSeeReceipts: () => void }) {
  const query = useQuery({
    queryKey: ['platform', 'finance', 'overview'],
    queryFn: () =>
      httpClient.request('/platform/finance/overview', { schema: PlatformFinanceDashboardSchema }),
    retry: false,
  });

  if (query.isPending) {
    return (
      <div className="platform-table-skeleton">
        <i className="platform-skeleton" />
        <i className="platform-skeleton" />
        <i className="platform-skeleton" />
      </div>
    );
  }
  if (query.error instanceof Error) {
    return <ErrorState message={query.error.message} retry={() => void query.refetch()} />;
  }
  const data = query.data;
  if (!data) return null;

  const changeTone = data.monthOverMonthChangePercent === null ? 'muted' : data.monthOverMonthChangePercent >= 0 ? 'success' : 'danger';
  const changeLabel =
    data.monthOverMonthChangePercent === null
      ? 'Sem base de comparação'
      : `${data.monthOverMonthChangePercent >= 0 ? '+' : ''}${data.monthOverMonthChangePercent.toFixed(1)}% vs. mês anterior`;

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <div className="platform-metrics-grid">
        <article className="ds-stat-card">
          <span className="ds-eyebrow">Recebido este mês</span>
          <strong>{formatMoney(data.receivedThisMonthCents, data.currency)}</strong>
          <small className={`finance-trend finance-trend--${changeTone}`}>{changeLabel}</small>
        </article>
        <article className="ds-stat-card">
          <span className="ds-eyebrow">Recebido mês anterior</span>
          <strong>{formatMoney(data.receivedLastMonthCents, data.currency)}</strong>
        </article>
        <article className="ds-stat-card">
          <span className="ds-eyebrow">MRR contratado</span>
          <strong>{formatMoney(data.mrrContractedCents, data.currency)}</strong>
          <small>Receita recorrente contratual — não é recebimento. Inclui trial, ativas, em atraso e suspensas.</small>
          {data.mrrAtRiskCents !== '0' ? (
            <small className="finance-trend finance-trend--danger">
              {formatMoney(data.mrrAtRiskCents, data.currency)} em risco (atraso/suspensas)
            </small>
          ) : null}
        </article>
        <article className="ds-stat-card">
          <span className="ds-eyebrow">Ticket médio recebido</span>
          <strong>{data.averageTicketCents ? formatMoney(data.averageTicketCents, data.currency) : '—'}</strong>
        </article>
        <article className="ds-stat-card">
          <span className="ds-eyebrow">Pagamentos recebidos no mês</span>
          <strong>{data.paymentsReceivedThisMonth}</strong>
        </article>
        <article className="ds-stat-card ds-stat-card--warning">
          <span className="ds-eyebrow">Assinaturas em atraso</span>
          <strong>{data.pastDueSubscriptions}</strong>
        </article>
        <article className="ds-stat-card ds-stat-card--danger">
          <span className="ds-eyebrow">Assinaturas suspensas</span>
          <strong>{data.suspendedSubscriptions}</strong>
        </article>
        <article className="ds-stat-card ds-stat-card--success">
          <span className="ds-eyebrow">Novos assinantes no mês</span>
          <strong>{data.newSubscribersThisMonth}</strong>
        </article>
        <article className="ds-stat-card">
          <span className="ds-eyebrow">Cancelamentos no mês</span>
          <strong>{data.cancellationsThisMonth}</strong>
        </article>
      </div>

      <article className="platform-panel">
        <header>
          <h3>Recebimentos — últimos 12 meses</h3>
        </header>
        <MonthlyReceiptsChart data={data.monthlyReceipts} currency={data.currency} />
        <p className="finance-disclaimer">{data.disclaimer}</p>
      </article>

      <article className="platform-panel">
        <header>
          <h3>Receita por plano</h3>
        </header>
        <div className="platform-table-wrap">
          <table className="platform-table">
            <thead>
              <tr>
                <th>Plano</th>
                <th>Assinaturas ativas</th>
                <th>MRR contratado</th>
                <th>Recebido no mês</th>
              </tr>
            </thead>
            <tbody>
              {data.byPlan.map((plan) => (
                <tr key={plan.planPublicId}>
                  <td>
                    <strong>{plan.planName}</strong>
                  </td>
                  <td>{plan.activeSubscriptions}</td>
                  <td>{formatMoney(plan.mrrContractedCents, data.currency)}</td>
                  <td>{formatMoney(plan.receivedThisMonthCents, data.currency)}</td>
                </tr>
              ))}
              {data.byPlan.length === 0 ? (
                <tr>
                  <td colSpan={4}>Nenhum plano com assinatura vigente.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>

      <article className="platform-panel">
        <header>
          <h3>Recebimentos recentes</h3>
          <button type="button" onClick={onSeeReceipts}>
            Ver todos
          </button>
        </header>
        <div className="platform-table-wrap">
          <table className="platform-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Estabelecimento</th>
                <th>Plano</th>
                <th>Valor</th>
                <th>Provider</th>
                <th>Status</th>
                <th>Pago em</th>
              </tr>
            </thead>
            <tbody>
              {data.recentReceipts.map((receipt) => (
                <tr key={receipt.publicId}>
                  <td>{formatDate(receipt.createdAt, true)}</td>
                  <td>{receipt.tenantDisplayName}</td>
                  <td>{receipt.planName}</td>
                  <td>{formatMoney(receipt.amountCents, receipt.currency)}</td>
                  <td>{receipt.provider === 'pix-local' ? 'PIX' : 'Mercado Pago'}</td>
                  <td>
                    <FinanceChargeStatusBadge status={receipt.status} />
                  </td>
                  <td>{receipt.paidAt ? formatDate(receipt.paidAt, true) : '—'}</td>
                </tr>
              ))}
              {data.recentReceipts.length === 0 ? (
                <tr>
                  <td colSpan={7}>Nenhum recebimento registrado ainda.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  );
}

function MonthlyReceiptsChart({ data, currency }: { data: { month: string; amountCents: string }[]; currency: string }) {
  const max = Math.max(1, ...data.map((entry) => Number(entry.amountCents)));
  return (
    <div className="finance-chart">
      {data.map((entry) => {
        const value = Number(entry.amountCents);
        const heightPercent = Math.max(2, Math.round((value / max) * 100));
        const [year, month] = entry.month.split('-');
        return (
          <div className="finance-chart-bar" key={entry.month} title={`${entry.month}: ${formatMoney(entry.amountCents, currency)}`}>
            <div className="finance-chart-bar-track">
              <div className="finance-chart-bar-fill" style={{ height: `${String(heightPercent)}%` }} />
            </div>
            <span className="finance-chart-bar-label">
              {['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].includes(month)
                ? ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(month) - 1]
                : month}
              <small>{year.slice(2)}</small>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function FinanceChargeStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'muted' }> = {
    PAID: { label: 'Pago', tone: 'success' },
    PENDING: { label: 'Pendente', tone: 'warning' },
    PROCESSING: { label: 'Processando', tone: 'warning' },
    FAILED: { label: 'Falhou', tone: 'danger' },
    CANCELED: { label: 'Cancelado', tone: 'muted' },
    EXPIRED: { label: 'Expirado', tone: 'muted' },
    REFUNDED: { label: 'Reembolsado', tone: 'muted' },
  };
  const entry = map[status] ?? { label: status, tone: 'muted' as const };
  return <span className={`ds-badge ds-badge--${entry.tone}`}>{entry.label}</span>;
}

/* ------------------------------------------------------------------ */
/* Recebimentos                                                        */
/* ------------------------------------------------------------------ */

function FinanceReceiptsTab() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [provider, setProvider] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const limit = 20;

  const buildParams = () => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) params.set('status', status);
    if (provider) params.set('provider', provider);
    if (from) params.set('from', new Date(`${from}T00:00:00`).toISOString());
    if (to) params.set('to', new Date(`${to}T23:59:59.999`).toISOString());
    return params;
  };

  const query = useQuery({
    queryKey: ['platform', 'finance', 'receipts', { page, status, provider, from, to }],
    queryFn: () =>
      httpClient.request(`/platform/finance/receipts?${buildParams().toString()}`, {
        schema: PlatformFinanceReceiptsResponseSchema,
      }),
    retry: false,
  });

  const [exporting, setExporting] = useState(false);
  const handleExport = () => {
    setExporting(true);
    const params = buildParams();
    params.set('format', 'csv');
    void downloadCsv(`/platform/finance/receipts?${params.toString()}`, 'recebimentos.csv').finally(() => {
      setExporting(false);
    });
  };

  return (
    <section>
      <div className="platform-filter-bar">
        <label>
          Status
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Todos</option>
            <option value="PAID">Pago</option>
            <option value="PENDING">Pendente</option>
            <option value="PROCESSING">Processando</option>
            <option value="FAILED">Falhou</option>
            <option value="CANCELED">Cancelado</option>
            <option value="EXPIRED">Expirado</option>
            <option value="REFUNDED">Reembolsado</option>
          </select>
        </label>
        <label>
          Provider
          <select value={provider} onChange={(e) => { setProvider(e.target.value); setPage(1); }}>
            <option value="">Todos</option>
            <option value="pix-local">PIX</option>
            <option value="mercadopago">Mercado Pago</option>
          </select>
        </label>
        <label>
          De
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        </label>
        <label>
          Até
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </label>
        <button type="button" onClick={handleExport} disabled={exporting}>
          {exporting ? 'Exportando…' : 'Exportar CSV'}
        </button>
      </div>

      {query.isPending ? (
        <div className="platform-table-skeleton">
          <i className="platform-skeleton" />
          <i className="platform-skeleton" />
        </div>
      ) : query.error instanceof Error ? (
        <ErrorState message={query.error.message} retry={() => void query.refetch()} />
      ) : !query.data || query.data.items.length === 0 ? (
        <div className="platform-empty">
          <h3>Nenhum recebimento encontrado</h3>
          <p>Ajuste os filtros ou aguarde novas cobranças serem pagas.</p>
        </div>
      ) : (
        <>
          <div className="platform-table-wrap">
            <table className="platform-table">
              <thead>
                <tr>
                  <th>Criação</th>
                  <th>Estabelecimento</th>
                  <th>Plano</th>
                  <th>Valor</th>
                  <th>Provider</th>
                  <th>Status</th>
                  <th>Pago em</th>
                  <th>External ID</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((item) => (
                  <tr key={item.publicId}>
                    <td>{formatDate(item.createdAt, true)}</td>
                    <td>{item.tenantDisplayName}</td>
                    <td>{item.planName ?? '—'}</td>
                    <td>{formatMoney(item.amountCents, item.currency)}</td>
                    <td>{item.provider === 'pix-local' ? 'PIX' : 'Mercado Pago'}</td>
                    <td>
                      <FinanceChargeStatusBadge status={item.status} />
                    </td>
                    <td>{item.paidAt ? formatDate(item.paidAt, true) : '—'}</td>
                    <td className="finance-external-id">{item.externalId ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            totalPages={query.data.page.totalPages}
            total={query.data.page.total}
            limit={query.data.page.limit}
            onPage={setPage}
          />
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Assinaturas (analítica — não duplica /platform/subscriptions)       */
/* ------------------------------------------------------------------ */

function FinanceSubscriptionsTab() {
  const query = useQuery({
    queryKey: ['platform', 'finance', 'subscriptions'],
    queryFn: () =>
      httpClient.request('/platform/finance/subscriptions', {
        schema: PlatformFinanceSubscriptionsResponseSchema,
      }),
    retry: false,
  });

  if (query.isPending) {
    return (
      <div className="platform-table-skeleton">
        <i className="platform-skeleton" />
      </div>
    );
  }
  if (query.error instanceof Error) {
    return <ErrorState message={query.error.message} retry={() => void query.refetch()} />;
  }
  const data = query.data;
  if (!data) return null;

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <div className="platform-metrics-grid">
        <article className="ds-stat-card ds-stat-card--success">
          <span className="ds-eyebrow">Ativas</span>
          <strong>{data.active}</strong>
        </article>
        <article className="ds-stat-card">
          <span className="ds-eyebrow">Em trial</span>
          <strong>{data.trialing}</strong>
        </article>
        <article className="ds-stat-card">
          <span className="ds-eyebrow">Novas no mês</span>
          <strong>{data.newThisMonth}</strong>
        </article>
        <article className="ds-stat-card">
          <span className="ds-eyebrow">Canceladas no mês</span>
          <strong>{data.canceledThisMonth}</strong>
        </article>
        <article className="ds-stat-card">
          <span className="ds-eyebrow">MRR contratado</span>
          <strong>{formatMoney(data.mrrContractedCents, data.currency)}</strong>
        </article>
      </div>
      <article className="platform-panel">
        <header>
          <h3>Distribuição por plano</h3>
        </header>
        <div className="platform-table-wrap">
          <table className="platform-table">
            <thead>
              <tr>
                <th>Plano</th>
                <th>Assinaturas ativas</th>
                <th>MRR contratado</th>
              </tr>
            </thead>
            <tbody>
              {data.byPlan.map((plan) => (
                <tr key={plan.planPublicId}>
                  <td>
                    <strong>{plan.planName}</strong>
                  </td>
                  <td>{plan.activeSubscriptions}</td>
                  <td>{formatMoney(plan.mrrContractedCents, data.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inadimplência                                                        */
/* ------------------------------------------------------------------ */

function FinanceDelinquencyTab() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'' | 'PAST_DUE' | 'SUSPENDED'>('');
  const [bucket, setBucket] = useState<'' | '1-7' | '8-15' | '16-30' | '30+'>('');
  const limit = 20;

  const buildParams = () => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) params.set('status', status);
    if (bucket) params.set('bucket', bucket);
    return params;
  };

  const query = useQuery({
    queryKey: ['platform', 'finance', 'delinquency', { page, status, bucket }],
    queryFn: () =>
      httpClient.request(`/platform/finance/delinquency?${buildParams().toString()}`, {
        schema: PlatformFinanceDelinquencyResponseSchema,
      }),
    retry: false,
  });

  const [exporting, setExporting] = useState(false);
  const handleExport = () => {
    setExporting(true);
    const params = buildParams();
    params.set('format', 'csv');
    void downloadCsv(`/platform/finance/delinquency?${params.toString()}`, 'inadimplencia.csv').finally(() => {
      setExporting(false);
    });
  };

  if (query.isPending) {
    return (
      <div className="platform-table-skeleton">
        <i className="platform-skeleton" />
      </div>
    );
  }
  if (query.error instanceof Error) {
    return <ErrorState message={query.error.message} retry={() => void query.refetch()} />;
  }
  const data = query.data;
  if (!data) return null;

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <div className="platform-metrics-grid">
        <article className="ds-stat-card ds-stat-card--warning">
          <span className="ds-eyebrow">Assinaturas em atraso</span>
          <strong>{data.summary.pastDueCount}</strong>
          <small>{formatMoney(data.summary.pastDueContractedCents, data.currency)} em valor contratual</small>
        </article>
        <article className="ds-stat-card ds-stat-card--danger">
          <span className="ds-eyebrow">Assinaturas suspensas</span>
          <strong>{data.summary.suspendedCount}</strong>
          <small>{formatMoney(data.summary.suspendedContractedCents, data.currency)} em valor contratual</small>
        </article>
        <article className="ds-stat-card">
          <span className="ds-eyebrow">1–7 dias</span>
          <strong>{data.summary.buckets.d1_7}</strong>
        </article>
        <article className="ds-stat-card">
          <span className="ds-eyebrow">8–15 dias</span>
          <strong>{data.summary.buckets.d8_15}</strong>
        </article>
        <article className="ds-stat-card">
          <span className="ds-eyebrow">16–30 dias</span>
          <strong>{data.summary.buckets.d16_30}</strong>
        </article>
        <article className="ds-stat-card ds-stat-card--danger">
          <span className="ds-eyebrow">+30 dias</span>
          <strong>{data.summary.buckets.d30Plus}</strong>
        </article>
      </div>

      <div className="platform-filter-bar">
        <label>
          Status
          <select value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1); }}>
            <option value="">Todos</option>
            <option value="PAST_DUE">Em atraso</option>
            <option value="SUSPENDED">Suspensas</option>
          </select>
        </label>
        <label>
          Faixa
          <select value={bucket} onChange={(e) => { setBucket(e.target.value as typeof bucket); setPage(1); }}>
            <option value="">Todas</option>
            <option value="1-7">1–7 dias</option>
            <option value="8-15">8–15 dias</option>
            <option value="16-30">16–30 dias</option>
            <option value="30+">+30 dias</option>
          </select>
        </label>
        <button type="button" onClick={handleExport} disabled={exporting}>
          {exporting ? 'Exportando…' : 'Exportar CSV'}
        </button>
      </div>

      {data.items.length === 0 ? (
        <div className="platform-empty">
          <h3>Nenhuma assinatura em atraso ou suspensa</h3>
          <p>Tudo em dia com os filtros atuais.</p>
        </div>
      ) : (
        <>
          <div className="platform-table-wrap">
            <table className="platform-table">
              <thead>
                <tr>
                  <th>Estabelecimento</th>
                  <th>Plano</th>
                  <th>Valor contratual</th>
                  <th>Fim do período</th>
                  <th>Dias</th>
                  <th>Carência até</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.publicId}>
                    <td>{item.tenantDisplayName}</td>
                    <td>{item.planName}</td>
                    <td>{formatMoney(item.priceCents, item.currency)}</td>
                    <td>{formatDate(item.currentPeriodEndsAt)}</td>
                    <td>{item.daysSincePeriodEnd}</td>
                    <td>{item.graceEndsAt ? formatDate(item.graceEndsAt) : '—'}</td>
                    <td>
                      <StatusBadge value={item.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            totalPages={data.page.totalPages}
            total={data.page.total}
            limit={data.page.limit}
            onPage={setPage}
          />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Relatórios                                                           */
/* ------------------------------------------------------------------ */

function FinanceReportsTab() {
  const [exportingId, setExportingId] = useState<string | null>(null);
  const run = (id: string, path: string, filename: string) => {
    setExportingId(id);
    void downloadCsv(path, filename).finally(() => {
      setExportingId(null);
    });
  };
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const reports = [
    {
      id: 'receipts',
      title: 'Recebimentos por período',
      description: 'Todas as cobranças (qualquer status) no período selecionado.',
      run: () => { run('receipts', '/platform/finance/receipts?format=csv&limit=100', 'recebimentos.csv'); },
    },
    {
      id: 'new',
      title: 'Novos assinantes no mês',
      description: 'Assinaturas criadas a partir do início do mês atual.',
      run: () => {
        run('new', `/platform/finance/subscriptions?segment=new&from=${monthStart}&format=csv&limit=100`, 'novos-assinantes.csv');
      },
    },
    {
      id: 'canceled',
      title: 'Cancelamentos no mês',
      description: 'Assinaturas canceladas a partir do início do mês atual.',
      run: () => {
        run('canceled', `/platform/finance/subscriptions?segment=canceled&from=${monthStart}&format=csv&limit=100`, 'cancelamentos.csv');
      },
    },
    {
      id: 'delinquency',
      title: 'Inadimplência',
      description: 'Assinaturas em atraso ou suspensas, com dias desde o fim do período.',
      run: () => { run('delinquency', '/platform/finance/delinquency?format=csv&limit=100', 'inadimplencia.csv'); },
    },
  ];

  return (
    <div className="finance-reports-grid">
      {reports.map((report) => (
        <article className="platform-panel" key={report.id}>
          <header>
            <h3>{report.title}</h3>
          </header>
          <p>{report.description}</p>
          <button type="button" onClick={report.run} disabled={exportingId === report.id}>
            {exportingId === report.id ? 'Exportando…' : 'Baixar CSV'}
          </button>
        </article>
      ))}
      <p className="finance-disclaimer">
        Receita por plano pode ser exportada diretamente na aba Visão geral. Exportação em PDF não está disponível
        nesta fase.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Configurações (conteúdo original do FinanceModule, movido para cá)  */
/* ------------------------------------------------------------------ */

type Provider = 'pix-local' | 'mercadopago';

function FinanceSettingsTab() {
  const client = useQueryClient();
  const [open, setOpen] = useState<Provider | null>(null);
  const [active, setActive] = useState(false);
  const [gatewayEnvironment, setGatewayEnvironment] = useState<'SANDBOX' | 'PRODUCTION'>('SANDBOX');
  const [fields, setFields] = useState<Record<string, string>>({});
  const query = useQuery({
    queryKey: ['platform', 'finance'],
    queryFn: () =>
      httpClient.request('/platform/finance', { schema: PlatformFinanceOverviewSchema }),
    retry: false,
  });
  const save = useMutation({
    mutationFn: (provider: Provider) =>
      httpClient.request(`/platform/finance/providers/${provider}`, {
        method: 'PUT',
        body: {
          provider,
          active,
          environment: gatewayEnvironment,
          ...(Object.values(fields).some(Boolean) ? { credentials: fields } : {}),
        },
        schema: PlatformFinanceOverviewSchema,
      }),
    onSuccess: async () => {
      setOpen(null);
      setFields({});
      await client.invalidateQueries({ queryKey: ['platform', 'finance'] });
    },
  });
  const manual = useMutation({
    mutationFn: (value: boolean) =>
      httpClient.request('/platform/finance/manual-activation', {
        method: 'PUT',
        body: { active: value },
        schema: PlatformFinanceOverviewSchema,
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['platform', 'finance'] });
    },
  });
  const configure = (provider: Provider) => {
    const current = query.data?.configs.find((c) => c.provider === provider);
    setOpen(provider);
    setActive(current?.active ?? false);
    setGatewayEnvironment(current?.environment ?? 'SANDBOX');
    setFields({});
  };
  return (
    <section>
      {query.isPending ? (
        <div className="platform-table-skeleton">
          <i className="platform-skeleton" />
          <i className="platform-skeleton" />
        </div>
      ) : query.error instanceof Error ? (
        <ErrorState
          message={query.error.message}
          retry={() => {
            void query.refetch();
          }}
        />
      ) : (
        <div className="platform-finance-grid">
          {query.data?.configs.map((config) => (
            <article className="platform-panel" key={config.provider}>
              <header>
                <h3>{config.provider === 'pix-local' ? 'PIX' : 'Mercado Pago'}</h3>
                <StatusBadge value={config.active ? 'ACTIVE' : 'INACTIVE'} />
              </header>
              <p>
                {config.provider === 'pix-local'
                  ? 'PIX próprio com confirmação administrativa.'
                  : 'Pagamento processado e confirmado pelo Mercado Pago.'}
              </p>
              <dl className="platform-details">
                <div>
                  <dt>Credenciais</dt>
                  <dd>{config.hasCredentials ? 'Configuradas' : 'Não configuradas'}</dd>
                </div>
                <div>
                  <dt>Ambiente</dt>
                  <dd>{config.environment === 'PRODUCTION' ? 'Produção' : 'Sandbox'}</dd>
                </div>
              </dl>
              <button
                onClick={() => {
                  configure(config.provider);
                }}
                type="button"
              >
                Configurar
              </button>
            </article>
          ))}
          <article className="platform-panel">
            <header>
              <h3>Ativação manual</h3>
              <StatusBadge value={query.data?.manualActivationEnabled ? 'ACTIVE' : 'INACTIVE'} />
            </header>
            <p>Permite ativar uma assinatura manualmente sem gerar pagamento online.</p>
            <button
              onClick={() => {
                void manual.mutateAsync(!(query.data?.manualActivationEnabled ?? false));
              }}
              type="button"
            >
              {query.data?.manualActivationEnabled ? 'Desativar' : 'Ativar'}
            </button>
          </article>
        </div>
      )}
      {open ? (
        <>
          <button
            className="platform-backdrop"
            aria-label="Fechar"
            onClick={() => {
              setOpen(null);
            }}
            type="button"
          />
          <aside className="platform-drawer">
            <button
              className="platform-drawer-close"
              onClick={() => {
                setOpen(null);
              }}
              type="button"
            >
              ×
            </button>
            <h3>{open === 'pix-local' ? 'Configurar PIX' : 'Configurar Mercado Pago'}</h3>
            <div className="platform-form">
              <label>
                <input
                  checked={active}
                  onChange={(e) => {
                    setActive(e.target.checked);
                  }}
                  type="checkbox"
                />{' '}
                Método ativo
              </label>
              <label>
                Ambiente
                <select
                  value={gatewayEnvironment}
                  onChange={(e) => {
                    setGatewayEnvironment(e.target.value as typeof gatewayEnvironment);
                  }}
                >
                  <option value="SANDBOX">Sandbox</option>
                  <option value="PRODUCTION">Produção</option>
                </select>
              </label>
              {open === 'pix-local' ? (
                <>
                  <label>
                    Tipo da chave
                    <input
                      value={fields.keyType ?? ''}
                      onChange={(e) => {
                        setFields({ ...fields, keyType: e.target.value });
                      }}
                    />
                  </label>
                  <label>
                    Chave PIX
                    <input
                      value={fields.key ?? ''}
                      onChange={(e) => {
                        setFields({ ...fields, key: e.target.value });
                      }}
                    />
                  </label>
                  <label>
                    Nome do recebedor
                    <input
                      value={fields.receiverName ?? ''}
                      onChange={(e) => {
                        setFields({ ...fields, receiverName: e.target.value });
                      }}
                    />
                  </label>
                  <label>
                    Cidade
                    <input
                      value={fields.city ?? ''}
                      onChange={(e) => {
                        setFields({ ...fields, city: e.target.value });
                      }}
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Access token
                    <input
                      autoComplete="new-password"
                      type="password"
                      value={fields.accessToken ?? ''}
                      onChange={(e) => {
                        setFields({ ...fields, accessToken: e.target.value });
                      }}
                      placeholder="Vazio mantém o atual"
                    />
                  </label>
                  <label>
                    Segredo do webhook
                    <input
                      autoComplete="new-password"
                      type="password"
                      value={fields.webhookSecret ?? ''}
                      onChange={(e) => {
                        setFields({ ...fields, webhookSecret: e.target.value });
                      }}
                      placeholder="Vazio mantém o atual"
                    />
                  </label>
                </>
              )}
              <button
                disabled={save.isPending}
                onClick={() => {
                  void save.mutateAsync(open);
                }}
                type="button"
              >
                Salvar alterações
              </button>
              {save.error instanceof Error ? (
                <p className="form-error">{save.error.message}</p>
              ) : null}
            </div>
          </aside>
        </>
      ) : null}
    </section>
  );
}
