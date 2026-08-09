import { PlatformDashboardResponseSchema, PlatformMeResponseSchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { AuditModule } from '../components/platform/AuditModule.js';
import { CommercialPolicyModule } from '../components/platform/CommercialPolicyModule.js';
import { PlanModule } from '../components/platform/PlanModule.js';
import { SubscriptionModule } from '../components/platform/SubscriptionModule.js';
import { TenantModule } from '../components/platform/TenantModule.js';
import { HttpError, httpClient } from '../lib/http.js';

type PlatformSection =
  | 'dashboard'
  | 'tenants'
  | 'plans'
  | 'subscriptions'
  | 'commercial-policy'
  | 'audit';
const sectionLabels: Record<PlatformSection, string> = {
  dashboard: 'Vis\u00e3o geral',
  tenants: 'Estabelecimentos',
  plans: 'Planos',
  subscriptions: 'Assinaturas',
  'commercial-policy': 'Pol\u00edtica Comercial',
  audit: 'Auditoria',
};

function currency(cents: string, code: string): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: code }).format(
    Number(cents) / 100,
  );
}

export function PlatformPageRebuild() {
  const navigate = useNavigate();
  const [section, setSection] = useState<PlatformSection>('dashboard');
  const me = useQuery({
    queryKey: ['platform', 'me'],
    queryFn: () => httpClient.request('/platform/me', { schema: PlatformMeResponseSchema }),
    retry: false,
  });
  const dashboard = useQuery({
    queryKey: ['platform', 'dashboard'],
    queryFn: () =>
      httpClient.request('/platform/dashboard', { schema: PlatformDashboardResponseSchema }),
    enabled: section === 'dashboard',
    retry: false,
  });
  const deniedStatus = me.error instanceof HttpError ? me.error.status : undefined;
  const denied = deniedStatus === 401 || deniedStatus === 403;
  useEffect(() => {
    if (denied) void navigate(deniedStatus === 401 ? '/login' : '/access-denied');
  }, [denied, deniedStatus, navigate]);
  if (denied) return null;
  if (me.isPending)
    return (
      <main className="app-shell">
        <p>{'Carregando sess\u00e3o administrativa\u2026'}</p>
      </main>
    );
  if (me.error instanceof Error || me.data === undefined)
    return (
      <main className="app-shell">
        <h1>{'N\u00e3o foi poss\u00edvel carregar o painel'}</h1>
        <p>{'Atualize a p\u00e1gina ou entre novamente para continuar.'}</p>
        <Link className="action-button" to="/login">
          Ir para o acesso
        </Link>
      </main>
    );
  return (
    <main className="platform-shell">
      <header className="platform-header">
        <div>
          <p className="eyebrow">{'Administra\u00e7\u00e3o global'}</p>
          <h1>Plataforma</h1>
          <p className="muted">{me.data.administrator.user.email}</p>
        </div>
        <Link className="secondary-button" to="/">
          {'\u00c1rea do estabelecimento'}
        </Link>
      </header>
      <div className="platform-layout">
        <nav className="platform-nav" aria-label={'M\u00f3dulos globais'}>
          {(Object.keys(sectionLabels) as PlatformSection[]).map((item) => (
            <button
              className={section === item ? 'nav-active' : ''}
              key={item}
              onClick={() => {
                setSection(item);
              }}
              type="button"
            >
              {sectionLabels[item]}
            </button>
          ))}
        </nav>
        <section className="platform-content">
          {section === 'dashboard' ? (
            <Dashboard
              dashboard={dashboard.data}
              error={dashboard.error}
              loading={dashboard.isPending}
            />
          ) : section === 'tenants' ? (
            <TenantModule />
          ) : section === 'plans' ? (
            <PlanModule />
          ) : section === 'subscriptions' ? (
            <SubscriptionModule />
          ) : section === 'commercial-policy' ? (
            <CommercialPolicyModule />
          ) : (
            <AuditModule />
          )}
        </section>
      </div>
    </main>
  );
}

function Dashboard({
  dashboard,
  error,
  loading,
}: {
  dashboard: ReturnType<typeof PlatformDashboardResponseSchema.parse> | undefined;
  error: Error | null;
  loading: boolean;
}) {
  if (loading) return <p>{'Carregando indicadores da plataforma\u2026'}</p>;
  if (error !== null || dashboard === undefined)
    return <p className="form-error">{'N\u00e3o foi poss\u00edvel carregar os indicadores.'}</p>;
  return (
    <section aria-labelledby="platform-dashboard-title">
      <p className="eyebrow">{'Resumo do per\u00edodo'}</p>
      <h2 id="platform-dashboard-title">{'Vis\u00e3o geral'}</h2>
      <div className="metric-grid">
        <Metric label="Estabelecimentos ativos" value={String(dashboard.counts.activeTenants)} />
        <Metric label="Assinaturas ativas" value={String(dashboard.counts.activeSubscriptions)} />
        <Metric
          label="Receita mensal estimada"
          value={currency(dashboard.estimatedRevenue.mrrCents, dashboard.estimatedRevenue.currency)}
        />
        <Metric
          label="Assinaturas em teste"
          value={String(dashboard.counts.trialingSubscriptions)}
        />
      </div>
      <p className="muted">{dashboard.estimatedRevenue.disclaimer}</p>
      <h3>Estabelecimentos recentes</h3>
      {dashboard.recentTenants.length === 0 ? (
        <p>Nenhum estabelecimento criado no per\u00edodo.</p>
      ) : (
        <div className="data-list">
          {dashboard.recentTenants.map((tenant) => (
            <div className="data-row" key={tenant.publicId}>
              <span>{tenant.displayName}</span>
              <span>{tenant.status}</span>
              <span>{tenant.subscription?.plan.name ?? 'Sem assinatura'}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="info-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
