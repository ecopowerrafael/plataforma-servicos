import {
  PlatformDashboardResponseSchema,
  PlatformMeResponseSchema,
  PlatformTenantListResponseSchema,
} from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { AuditModule } from '../components/platform/AuditModule.js';
import { CommercialPolicyModule } from '../components/platform/CommercialPolicyModule.js';
import { FinanceModule } from '../components/platform/FinanceModule.js';
import { PlanModule } from '../components/platform/PlanModule.js';
import { PlatformShell, type PlatformSection } from '../components/platform/PlatformShell.js';
import {
  ErrorState,
  formatDate,
  formatMoney,
  MetricCard,
  PageHeader,
  StatusBadge,
} from '../components/platform/PlatformUi.js';
import { SubscriptionModule } from '../components/platform/SubscriptionModule.js';
import { TenantModule } from '../components/platform/TenantModule.js';
import { HttpError, httpClient } from '../lib/http.js';

export function PlatformPageRebuild() {
  const navigate = useNavigate();
  const params = useParams();
  const routeSection = params.section === 'financeiro' ? 'finance' : params.section;
  const [section, setSection] = useState<PlatformSection>(
    (
      [
        'dashboard',
        'tenants',
        'plans',
        'subscriptions',
        'finance',
        'commercial-policy',
        'audit',
      ] as string[]
    ).includes(routeSection ?? '')
      ? (routeSection as PlatformSection)
      : 'dashboard',
  );
  const me = useQuery({
    queryKey: ['platform', 'me'],
    queryFn: () => httpClient.request('/platform/me', { schema: PlatformMeResponseSchema }),
    retry: false,
  });
  const deniedStatus = me.error instanceof HttpError ? me.error.status : undefined;
  useEffect(() => {
    if (deniedStatus === 401 || deniedStatus === 403)
      void navigate(deniedStatus === 401 ? '/login' : '/access-denied');
  }, [deniedStatus, navigate]);
  if (me.isPending)
    return (
      <main className="platform-session-loading">
        <i className="platform-skeleton" />
        <i className="platform-skeleton" />
      </main>
    );
  if (me.error instanceof Error || me.data === undefined)
    return (
      <main className="app-shell">
        <h1>Nao foi possivel carregar o painel</h1>
        <Link className="action-button" to="/login">
          Ir para o acesso
        </Link>
      </main>
    );
  return (
    <PlatformShell
      email={me.data.administrator.user.email}
      section={section}
      onSection={(next) => {
        setSection(next);
        void navigate(next === 'finance' ? '/platform/financeiro' : `/platform/${next}`);
      }}
    >
      {section === 'dashboard' ? (
        <Overview
          onTenants={() => {
            setSection('tenants');
          }}
        />
      ) : section === 'tenants' ? (
        <TenantModule />
      ) : section === 'plans' ? (
        <PlanModule
          planPublicId={params.resourceId}
          onOpen={(id) => {
            void navigate(`/platform/plans/${id}`);
          }}
        />
      ) : section === 'subscriptions' ? (
        <SubscriptionModule
          subscriptionPublicId={params.resourceId}
          onOpen={(id) => {
            void navigate(`/platform/subscriptions/${id}`);
          }}
        />
      ) : section === 'finance' ? (
        <FinanceModule />
      ) : section === 'commercial-policy' ? (
        <CommercialPolicyModule />
      ) : (
        <AuditModule />
      )}
    </PlatformShell>
  );
}

function Overview({ onTenants }: { onTenants: () => void }) {
  const dashboard = useQuery({
    queryKey: ['platform', 'dashboard'],
    queryFn: () =>
      httpClient.request('/platform/dashboard/metrics', {
        schema: PlatformDashboardResponseSchema,
      }),
    retry: false,
  });
  const recent = useQuery({
    queryKey: ['platform', 'overview', 'recent-tenants'],
    queryFn: () =>
      httpClient.request('/platform/tenants?page=1&limit=5&orderBy=createdAt&direction=desc', {
        schema: PlatformTenantListResponseSchema,
      }),
    retry: false,
  });
  const data = dashboard.data;
  const metric = (value: number | null | undefined) =>
    value === null ? 'Indisponível' : value === undefined ? undefined : String(value);
  return (
    <section>
      <PageHeader title="Visao geral" description="Acompanhe a operacao comercial da plataforma." />
      <div className="platform-metrics-grid">
        <MetricCard
          label="Estabelecimentos"
          value={metric(data?.counts.tenants)}
          hint={
            data?.counts.tenantsCreated == null
              ? undefined
              : `+${String(data.counts.tenantsCreated)} no período`
          }
          loading={dashboard.isPending}
        />
        <MetricCard
          label="Assinaturas ativas"
          value={metric(data?.counts.activeSubscriptions)}
          loading={dashboard.isPending}
        />
        <MetricCard
          label="Em periodo de teste"
          value={metric(data?.counts.trialingSubscriptions)}
          loading={dashboard.isPending}
        />
        <MetricCard
          label="Receita recorrente estimada"
          value={
            data?.estimatedRevenue
              ? formatMoney(data.estimatedRevenue.mrrCents, data.estimatedRevenue.currency)
              : data
                ? 'Indisponível'
                : undefined
          }
          hint={
            data?.estimatedRevenue
              ? 'Valor contratual, não recebimento'
              : 'Não foi possível calcular esta métrica.'
          }
          loading={dashboard.isPending}
        />
      </div>
      {dashboard.error instanceof Error ? (
        <ErrorState
          message={dashboard.error.message}
          retry={() => {
            void dashboard.refetch();
          }}
        />
      ) : null}
      <div className="platform-overview-grid">
        <article className="platform-panel">
          <header>
            <h3>Situacao das assinaturas</h3>
          </header>
          {data ? (
            <div className="platform-status-list">
              <span>
                <StatusBadge value="ACTIVE" />
                <strong>{data.counts.activeSubscriptions ?? 'Indisponível'}</strong>
              </span>
              <span>
                <StatusBadge value="TRIALING" />
                <strong>{data.counts.trialingSubscriptions ?? 'Indisponível'}</strong>
              </span>
              <span>
                <StatusBadge value="PAST_DUE" />
                <strong>{data.counts.pastDueSubscriptions ?? 'Indisponível'}</strong>
              </span>
              <span>
                <StatusBadge value="SUSPENDED" />
                <strong>{data.counts.suspendedSubscriptions ?? 'Indisponível'}</strong>
              </span>
            </div>
          ) : dashboard.isPending ? (
            <i className="platform-skeleton" />
          ) : (
            <p>Indicadores indisponiveis.</p>
          )}
        </article>
        <article className="platform-panel">
          <header>
            <h3>Estabelecimentos recentes</h3>
            <button type="button" onClick={onTenants}>
              Ver todos
            </button>
          </header>
          {recent.isPending ? (
            <i className="platform-skeleton" />
          ) : recent.error instanceof Error ? (
            <ErrorState
              message="Nao foi possivel carregar os estabelecimentos recentes."
              retry={() => {
                void recent.refetch();
              }}
            />
          ) : recent.data?.items.length === 0 ? (
            <p>Nenhum estabelecimento recente.</p>
          ) : (
            <ul className="platform-recent-list">
              {recent.data?.items.map((tenant) => (
                <li key={tenant.publicId}>
                  <div>
                    <strong>{tenant.displayName}</strong>
                    <span>{tenant.subscription?.plan.name ?? 'Sem assinatura'}</span>
                  </div>
                  <StatusBadge value={tenant.subscription?.status ?? tenant.status} />
                  <time>{formatDate(tenant.createdAt)}</time>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>
      {data?.recentAudit.length ? (
        <article className="platform-panel">
          <header>
            <h3>Atividade recente</h3>
          </header>
          <ul className="platform-activity-list">
            {data.recentAudit.slice(0, 5).map((event) => (
              <li key={event.publicId}>
                <span>{event.action.replaceAll('platform.', '').replaceAll('.', ' ')}</span>
                <time>{formatDate(event.createdAt, true)}</time>
              </li>
            ))}
          </ul>
        </article>
      ) : null}
    </section>
  );
}
