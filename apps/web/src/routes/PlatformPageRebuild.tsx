import {
  PlatformDashboardResponseSchema,
  PlatformMeResponseSchema,
  PlatformTenantListResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

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
import { DirectoryModule } from '../components/platform/DirectoryModule.js';
import { ProspectingModule } from '../components/platform/ProspectingModule.js';
import { HttpError, httpClient } from '../lib/http.js';

export function PlatformPageRebuild() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const pathSection = location.pathname.split('/')[2];
  const routeSection = pathSection === 'financeiro' ? 'finance' : pathSection;
  const section: PlatformSection | 'settings' = [
    'dashboard',
    'tenants',
    'plans',
    'subscriptions',
    'finance',
    'commercial-policy',
    'audit',
    'directory',
    'prospecting',
    'settings',
  ].includes(routeSection ?? '')
    ? (routeSection as PlatformSection | 'settings')
    : 'dashboard';
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
        void navigate(next === 'finance' ? '/platform/financeiro' : `/platform/${next}`);
      }}
    >
      {section === 'dashboard' ? (
        <Overview
          onTenants={() => {
            void navigate('/platform/tenants');
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
      ) : section === 'directory' ? (
        <DirectoryModule />
      ) : section === 'prospecting' ? (
        <ProspectingModule
          campaignPublicId={params.resourceId}
          onOpen={(id) => {
            void navigate(`/platform/prospecting/${id}`);
          }}
        />
      ) : section === 'settings' ? (
        <WapiConfigModule />
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

function WapiConfigModule() {
  const [key, setKey] = useState('');
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');

  const { data: config, isPending, error, refetch } = useQuery({
    queryKey: ['platform', 'wapi-config'],
    queryFn: () =>
      httpClient.request('/platform/settings/wapi', {
        schema: z.object({
          configured: z.boolean(),
          source: z.enum(['none', 'environment', 'database']),
          active: z.boolean().optional(),
          updatedAt: z.string().optional(),
        }),
      }),
    retry: false,
  });
  const saveMutation = useMutation({
    mutationFn: async (masterApiKey: string) =>
      httpClient.request('/platform/settings/wapi', {
        method: 'PUT',
        body: { masterApiKey },
      }),
    onSuccess: () => {
      setKey('');
      setEditing(false);
      setMessage('Configuração W-API salva com sucesso.');
      void refetch();
      setTimeout(() => setMessage(''), 3000);
    },
    onError: (err) => {
      let errorMsg = 'Erro ao salvar configuração.';
      if (err instanceof Error) {
        // Extrair mensagem segura sem expor secrets
        const msg = err.message.toLowerCase();
        if (msg.includes('encryption')) {
          errorMsg = 'Erro: Sistema de encriptação não está configurado corretamente.';
        } else if (msg.includes('401') || msg.includes('403')) {
          errorMsg = 'Erro: Permissão negada. Verifique suas credenciais.';
        } else if (msg.includes('400')) {
          errorMsg = 'Erro: Dados inválidos. Verifique a chave informada.';
        } else if (msg.includes('500') || msg.includes('internal')) {
          errorMsg = 'Erro interno do servidor. Tente novamente em alguns momentos.';
        } else {
          errorMsg = 'Erro ao salvar: ' + (err.message.split('\n')[0] || 'operação falhou');
        }
      }
      setMessage(errorMsg);
      setTimeout(() => setMessage(''), 5000);
    },
  });

  const testMutation = useMutation({
    mutationFn: async () =>
      httpClient.request('/platform/settings/wapi/test', {
        method: 'POST',
      }),
    onSuccess: () => {
      setMessage('Configuração W-API válida.');
      setTimeout(() => setMessage(''), 3000);
    },
    onError: () => {
      setMessage('Não foi possível validar a configuração W-API.');
      setTimeout(() => setMessage(''), 3000);
    },
  });

  return (
    <section>
      <PageHeader title="Configurações" description="Gerenciar integrações da plataforma." />
      <article className="platform-panel">
        <header>
          <h3>WhatsApp / W-API</h3>
        </header>
        {isPending ? (
          <i className="platform-skeleton" />
        ) : error instanceof Error ? (
          <ErrorState message={error.message} retry={() => void refetch()} />
        ) : config ? (
          <div>
            {config.source === 'none' ? (
              <div>
                <p>A Master API Key da W-API ainda não foi configurada.</p>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="action-button"
                >
                  Configurar
                </button>
              </div>
            ) : config.source === 'environment' ? (
              <div>
                <p>A aplicação está usando WAPI_MASTER_API_KEY do servidor.</p>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="action-button"
                  >
                    Configurar no painel
                  </button>
                  <button
                    type="button"
                    onClick={() => void testMutation.mutate()}
                    className="action-button"
                    disabled={testMutation.isPending}
                  >
                    Testar configuração
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p>
                  Configurada pelo painel
                  {config.updatedAt ? ` • Última atualização: ${formatDate(config.updatedAt, true)}` : ''}
                </p>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="action-button"
                  >
                    Substituir chave
                  </button>
                  <button
                    type="button"
                    onClick={() => void testMutation.mutate()}
                    className="action-button"
                    disabled={testMutation.isPending}
                  >
                    Testar configuração
                  </button>
                </div>
              </div>
            )}
            {editing ? (
              <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid #ccc' }}>
                <input
                  type="password"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="Master API Key"
                  style={{ width: '100%', padding: '0.5rem', marginBottom: '1rem' }}
                  minLength={8}
                />
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    type="button"
                    onClick={() => void saveMutation.mutate(key)}
                    className="action-button"
                    disabled={saveMutation.isPending || key.length < 8}
                  >
                    Salvar chave
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setKey('');
                      setEditing(false);
                    }}
                    className="action-button"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : null}
            {message ? <p style={{ color: 'green', marginTop: '1rem' }}>{message}</p> : null}
          </div>
        ) : null}
      </article>
    </section>
  );
}
