import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { httpClient } from '../../lib/http.js';
import {
  ErrorState,
  formatDate,
  PageHeader,
  StatusBadge,
  MetricCard,
  Pagination,
} from './PlatformUi.js';
import { ConfirmationDialog, type ConfirmationRequest } from '../ConfirmationDialog.js';

interface ProspectingStats {
  leads: number;
  sent: number;
  delivered: number;
  read: number;
  responded: number;
  interested: number;
  followUp: number;
  optOut: number;
  deliveryRate: number;
  readRate: number;
  responseRate: number;
  interestRate: number;
}

interface ProspectingStatus {
  workerEnabled: boolean;
  dryRun: boolean;
  whatsappConfigured: boolean;
  whatsappActive: boolean;
}

interface Campaign {
  id: string;
  publicId: string;
  name: string;
  status: string;
  dailyLimit: number;
  sendingStartMinutes: number;
  sendingEndMinutes: number;
  createdAt: string;
  leads?: { id: string }[];
  _count?: { leads: number };
}

interface CampaignDetail extends Campaign {
  followUpEnabled: boolean;
  pauseOnReply: boolean;
  pauseOnInterest: boolean;
  autoReplyEnabled: boolean;
}

export function ProspectingModule({
  campaignPublicId,
  onOpen,
}: {
  campaignPublicId?: string;
  onOpen?: (id: string) => void;
}) {
  const [view, setView] = useState<'dashboard' | 'campaigns' | 'detail'>(
    campaignPublicId ? 'detail' : 'campaigns'
  );
  const [page, setPage] = useState(1);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(
    campaignPublicId ?? null
  );
  const [filterCampaign, setFilterCampaign] = useState<string>('all');
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const queryClient = useQueryClient();

  const stats = useQuery({
    queryKey: ['prospecting', 'stats', filterCampaign],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterCampaign !== 'all') params.set('campaignId', filterCampaign);
      return httpClient.request(`/platform/prospecting/stats?${params.toString()}`, {
        schema: null as any,
      });
    },
  });

  const status = useQuery({
    queryKey: ['prospecting', 'status'],
    queryFn: () =>
      httpClient.request('/platform/prospecting/status', {
        schema: null as any,
      }),
  });

  const campaigns = useQuery({
    queryKey: ['prospecting', 'campaigns'],
    queryFn: () =>
      httpClient.request('/platform/prospecting/campaigns', {
        schema: null as any,
      }),
  });

  const detail = useQuery({
    queryKey: ['prospecting', 'campaign', selectedCampaign],
    queryFn: () =>
      httpClient.request(`/platform/prospecting/campaigns/${selectedCampaign ?? ''}`, {
        schema: null as any,
      }),
    enabled: selectedCampaign !== null,
  });

  const startMutation = useMutation({
    mutationFn: (id: string) =>
      httpClient.request(`/platform/prospecting/campaigns/${id}/start`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prospecting'] });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: (id: string) =>
      httpClient.request(`/platform/prospecting/campaigns/${id}/pause`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prospecting'] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) =>
      httpClient.request(`/platform/prospecting/campaigns/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prospecting'] });
      setConfirmation(null);
    },
  });

  const handleCancel = (id: string) => {
    setConfirmation({
      title: 'Cancelar campanha?',
      message: 'Esta ação interromperá novos envios. Não é possível desfazer.',
      confirm: 'Cancelar',
      onConfirm: () => {
        void cancelMutation.mutateAsync(id);
      },
    });
  };

  return (
    <>
      {view === 'dashboard' ? (
        <DashboardView
          stats={stats.data as ProspectingStats | undefined}
          status={status.data as ProspectingStatus | undefined}
          campaigns={campaigns.data?.items ?? []}
          filterCampaign={filterCampaign}
          onFilterCampaign={setFilterCampaign}
          onViewCampaigns={() => setView('campaigns')}
          isLoading={stats.isPending || status.isPending}
        />
      ) : view === 'campaigns' ? (
        <CampaignsView
          campaigns={campaigns.data?.items ?? []}
          isLoading={campaigns.isPending}
          error={campaigns.error instanceof Error ? campaigns.error.message : null}
          onDetail={(id) => {
            setSelectedCampaign(id);
            setView('detail');
            onOpen?.(id);
          }}
          onViewDashboard={() => setView('dashboard')}
        />
      ) : (
        <DetailView
          campaign={detail.data as CampaignDetail | undefined}
          isLoading={detail.isPending}
          error={detail.error instanceof Error ? detail.error.message : null}
          onBack={() => setView('campaigns')}
          onStart={() => void startMutation.mutateAsync(selectedCampaign!)}
          onPause={() => void pauseMutation.mutateAsync(selectedCampaign!)}
          onCancel={() => handleCancel(selectedCampaign!)}
          startLoading={startMutation.isPending}
          pauseLoading={pauseMutation.isPending}
          cancelLoading={cancelMutation.isPending}
        />
      )}
      {confirmation && (
        <ConfirmationDialog
          title={confirmation.title}
          message={confirmation.message}
          confirm={confirmation.confirm}
          onConfirm={confirmation.onConfirm}
          onCancel={() => setConfirmation(null)}
        />
      )}
    </>
  );
}

function DashboardView({
  stats,
  status,
  campaigns,
  filterCampaign,
  onFilterCampaign,
  onViewCampaigns,
  isLoading,
}: {
  stats?: ProspectingStats;
  status?: ProspectingStatus;
  campaigns: Campaign[];
  filterCampaign: string;
  onFilterCampaign: (id: string) => void;
  onViewCampaigns: () => void;
  isLoading: boolean;
}) {
  return (
    <section>
      <PageHeader
        title="Prospeccao"
        description="Acompanhe campanhas de prospecção e envios."
        action={
          <button className="primary-button" onClick={onViewCampaigns} type="button">
            Ver campanhas
          </button>
        }
      />

      {status && (
        <div className="platform-status-bar">
          <div>
            <strong>Automação:</strong>{' '}
            <span className={status.workerEnabled ? 'badge-success' : 'badge-muted'}>
              {status.workerEnabled ? 'Ativa' : 'Desativada'}
            </span>
          </div>
          <div>
            <strong>Dry-run:</strong>{' '}
            <span className={status.dryRun ? 'badge-warning' : 'badge-muted'}>
              {status.dryRun ? 'Ativo' : 'Desativado'}
            </span>
          </div>
          <div>
            <strong>WhatsApp:</strong>{' '}
            <span className={status.whatsappConfigured ? 'badge-success' : 'badge-danger'}>
              {status.whatsappConfigured ? 'Configurado' : 'Não configurado'}
            </span>
            {status.whatsappConfigured && (
              <span className={status.whatsappActive ? 'badge-success' : 'badge-warning'}>
                {status.whatsappActive ? 'Ativo' : 'Inativo'}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="platform-filter-bar">
        <label>
          Campanha
          <select value={filterCampaign} onChange={(e) => onFilterCampaign(e.target.value)}>
            <option value="all">Todas</option>
            {campaigns.map((c) => (
              <option key={c.publicId} value={c.publicId}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="platform-metrics-grid">
        <MetricCard
          label="Leads"
          value={stats?.leads?.toString()}
          loading={isLoading}
        />
        <MetricCard
          label="Enviados"
          value={stats?.sent?.toString()}
          loading={isLoading}
        />
        <MetricCard
          label="Entregues"
          value={stats?.delivered?.toString()}
          loading={isLoading}
        />
        <MetricCard
          label="Lidos"
          value={stats?.read?.toString()}
          loading={isLoading}
        />
        <MetricCard
          label="Responderam"
          value={stats?.responded?.toString()}
          loading={isLoading}
        />
        <MetricCard
          label="Interessados"
          value={stats?.interested?.toString()}
          loading={isLoading}
        />
        <MetricCard
          label="Follow-up"
          value={stats?.followUp?.toString()}
          loading={isLoading}
        />
        <MetricCard
          label="Opt-out"
          value={stats?.optOut?.toString()}
          loading={isLoading}
        />
      </div>

      <div className="platform-rates-grid">
        <div className="rate-card">
          <h4>Taxa de Entrega</h4>
          <p>{!isNaN(stats?.deliveryRate ?? NaN) ? `${stats?.deliveryRate}%` : '—'}</p>
        </div>
        <div className="rate-card">
          <h4>Taxa de Leitura</h4>
          <p>{!isNaN(stats?.readRate ?? NaN) ? `${stats?.readRate}%` : '—'}</p>
        </div>
        <div className="rate-card">
          <h4>Taxa de Resposta</h4>
          <p>{!isNaN(stats?.responseRate ?? NaN) ? `${stats?.responseRate}%` : '—'}</p>
        </div>
        <div className="rate-card">
          <h4>Taxa de Interesse</h4>
          <p>{!isNaN(stats?.interestRate ?? NaN) ? `${stats?.interestRate}%` : '—'}</p>
        </div>
      </div>
    </section>
  );
}

function CampaignsView({
  campaigns,
  isLoading,
  error,
  onDetail,
  onViewDashboard,
}: {
  campaigns: Campaign[];
  isLoading: boolean;
  error?: string | null;
  onDetail: (id: string) => void;
  onViewDashboard: () => void;
}) {
  const [creating, setCreating] = useState(false);

  if (isLoading) {
    return (
      <section>
        <PageHeader
          title="Campanhas"
          description="Gerencie campanhas de prospecção."
          action={
            <button className="primary-button" onClick={() => setCreating(true)} type="button">
              Nova campanha
            </button>
          }
        />
        <div className="platform-table-skeleton">
          <i className="platform-skeleton" />
          <i className="platform-skeleton" />
          <i className="platform-skeleton" />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section>
        <PageHeader title="Campanhas" description="Gerencie campanhas de prospecção." />
        <ErrorState message={error} />
      </section>
    );
  }

  if (campaigns.length === 0) {
    return (
      <section>
        <PageHeader title="Campanhas" description="Gerencie campanhas de prospecção." />
        <div className="platform-empty">
          <h3>Nenhuma campanha encontrada</h3>
          <p>Crie sua primeira campanha de prospecção para começar.</p>
          <button className="primary-button" onClick={() => setCreating(true)} type="button">
            Nova campanha
          </button>
        </div>
      </section>
    );
  }

  return (
    <section>
      <PageHeader
        title="Campanhas"
        description="Gerencie campanhas de prospecção."
        action={
          <button className="primary-button" onClick={() => setCreating(true)} type="button">
            Nova campanha
          </button>
        }
      />
      <div className="platform-table-wrap">
        <table className="platform-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Status</th>
              <th>Leads</th>
              <th>Enviados</th>
              <th>Respondidos</th>
              <th>Limite diário</th>
              <th>Criada em</th>
              <th>
                <span className="sr-only">Acoes</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => (
              <tr key={campaign.publicId}>
                <td>{campaign.name}</td>
                <td>
                  <StatusBadge value={campaign.status} campaignStatus={true} />
                </td>
                <td>{campaign._count?.leads ?? 0}</td>
                <td>—</td>
                <td>—</td>
                <td>{campaign.dailyLimit}</td>
                <td>{formatDate(campaign.createdAt)}</td>
                <td>
                  <button
                    className="secondary-button"
                    onClick={() => onDetail(campaign.publicId)}
                    type="button"
                  >
                    Ver detalhe
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DetailView({
  campaign,
  isLoading,
  error,
  onBack,
  onStart,
  onPause,
  onCancel,
  startLoading,
  pauseLoading,
  cancelLoading,
}: {
  campaign?: CampaignDetail;
  isLoading: boolean;
  error?: string | null;
  onBack: () => void;
  onStart: () => void;
  onPause: () => void;
  onCancel: () => void;
  startLoading: boolean;
  pauseLoading: boolean;
  cancelLoading: boolean;
}) {
  if (isLoading) {
    return (
      <section>
        <button className="secondary-button" onClick={onBack} type="button">
          ← Voltar
        </button>
        <div className="platform-skeleton" style={{ height: '400px', marginTop: '1rem' }} />
      </section>
    );
  }

  if (error || !campaign) {
    return (
      <section>
        <button className="secondary-button" onClick={onBack} type="button">
          ← Voltar
        </button>
        <ErrorState message={error ?? 'Campanha não encontrada'} />
      </section>
    );
  }

  const canStart = campaign.status === 'DRAFT';
  const canPause = campaign.status === 'RUNNING';
  const canCancel = ['DRAFT', 'RUNNING', 'PAUSED'].includes(campaign.status);

  return (
    <section>
      <button className="secondary-button" onClick={onBack} type="button">
        ← Voltar
      </button>
      <div className="campaign-detail-header">
        <div>
          <h1>{campaign.name}</h1>
          <StatusBadge value={campaign.status} campaignStatus={true} />
        </div>
        <div className="campaign-actions">
          {canStart && (
            <button
              className="primary-button"
              onClick={onStart}
              disabled={startLoading}
              type="button"
            >
              {startLoading ? 'Iniciando...' : 'Iniciar'}
            </button>
          )}
          {canPause && (
            <button
              className="secondary-button"
              onClick={onPause}
              disabled={pauseLoading}
              type="button"
            >
              {pauseLoading ? 'Pausando...' : 'Pausar'}
            </button>
          )}
          {canCancel && (
            <button
              className="danger-button"
              onClick={onCancel}
              disabled={cancelLoading}
              type="button"
            >
              {cancelLoading ? 'Cancelando...' : 'Cancelar'}
            </button>
          )}
        </div>
      </div>

      <div className="campaign-config-sections">
        <section className="config-section">
          <h2>Envio</h2>
          <dl>
            <div>
              <dt>Limite diário</dt>
              <dd>{campaign.dailyLimit}</dd>
            </div>
            <div>
              <dt>Horário de início</dt>
              <dd>{String(campaign.sendingStartMinutes).padStart(2, '0')}:00</dd>
            </div>
            <div>
              <dt>Horário de fim</dt>
              <dd>{String(campaign.sendingEndMinutes).padStart(2, '0')}:00</dd>
            </div>
          </dl>
        </section>

        <section className="config-section">
          <h2>Follow-up</h2>
          <dl>
            <div>
              <dt>Ativado</dt>
              <dd>{campaign.followUpEnabled ? 'Sim' : 'Não'}</dd>
            </div>
          </dl>
        </section>

        <section className="config-section">
          <h2>Automação</h2>
          <dl>
            <div>
              <dt>Resposta automática</dt>
              <dd>{campaign.autoReplyEnabled ? 'Ativa' : 'Inativa'}</dd>
            </div>
          </dl>
        </section>
      </div>
    </section>
  );
}
