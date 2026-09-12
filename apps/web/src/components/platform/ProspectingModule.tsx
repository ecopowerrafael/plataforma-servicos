import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';
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
import { CampaignForm } from './CampaignForm.js';
import { ProspectingCampaignCreatePage } from './ProspectingCampaignCreatePage.js';
import { ProspectingLeadsView } from './ProspectingLeadsView.js';
import { ProspectingConversationsView } from './ProspectingConversationsView.js';
import { ProspectingTemplatesView } from './ProspectingTemplatesView.js';
import { ProspectingObjectionsView } from './ProspectingObjectionsView.js';
import { ProspectingFlowsView } from './ProspectingFlowsView.js';

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
  publicId: string;
  name: string;
  status: string;
  dailyLimit: number;
  sendingStartMinutes: number;
  sendingEndMinutes: number;
  createdAt: string;
}

interface CampaignDetail extends Campaign {
  followUpEnabled: boolean;
  pauseOnReply: boolean;
  pauseOnInterest: boolean;
  autoReplyEnabled: boolean;
}

const statsSchema = z.object({
  leads: z.number(),
  sent: z.number(),
  delivered: z.number(),
  read: z.number(),
  responded: z.number(),
  interested: z.number(),
  followUp: z.number(),
  optOut: z.number(),
  deliveryRate: z.number(),
  readRate: z.number(),
  responseRate: z.number(),
  interestRate: z.number(),
});

const statusSchema = z.object({
  workerEnabled: z.boolean(),
  dryRun: z.boolean(),
  whatsappConfigured: z.boolean(),
  whatsappActive: z.boolean(),
});

const campaignSchema = z.object({
  publicId: z.string(),
  name: z.string(),
  status: z.string(),
  dailyLimit: z.number(),
  sendingStartMinutes: z.number(),
  sendingEndMinutes: z.number(),
  createdAt: z.string(),
});

const campaignDetailSchema = campaignSchema.extend({
  followUpEnabled: z.boolean(),
  pauseOnReply: z.boolean(),
  pauseOnInterest: z.boolean(),
  autoReplyEnabled: z.boolean(),
});

const campaignsResponseSchema = z.object({
  items: z.array(campaignSchema),
});

const prospectingConfigSchema = z.object({
  configured: z.boolean(),
  publicId: z.string().optional(),
  instanceId: z.string().optional(),
  phoneNumber: z.string().optional(),
  instanceName: z.string().optional(),
  isActive: z.boolean().optional(),
  lastConnectionStatus: z.string().optional(),
  lastCheckedAt: z.string().optional(),
  tokenMasked: z.string().optional(),
});

const testConnectionSchema = z.object({
  success: z.boolean(),
  connected: z.boolean(),
  phoneNumber: z.string().optional(),
  instanceName: z.string().optional(),
  message: z.string(),
});

// Placeholder schemas for views without backend implementation yet
const templatesResponseSchema = z.object({
  items: z.array(z.object({
    publicId: z.string(),
    name: z.string(),
    stepNumber: z.number(),
    body: z.string(),
    isDefault: z.boolean(),
    variants: z.array(z.object({ variantIndex: z.number(), body: z.string() })),
    updatedAt: z.string(),
  })),
});

const conversationsResponseSchema = z.object({
  items: z.array(z.object({
    publicId: z.string(),
    nameSnapshot: z.string(),
    phoneSnapshot: z.string(),
    status: z.string(),
    campaign: z.object({ publicId: z.string(), name: z.string() }).optional(),
    humanLockType: z.string().optional(),
    lastInboundAt: z.string().optional(),
    updatedAt: z.string(),
  })),
  pagination: z.object({
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

const objectionsResponseSchema = z.object({
  items: z.array(z.object({
    publicId: z.string(),
    code: z.string().optional(),
    name: z.string(),
    description: z.string().optional(),
    suggestedResponse: z.string().optional(),
    autoReplyAllowed: z.boolean(),
    isActive: z.boolean(),
    patterns: z.array(z.object({
      id: z.number(),
      text: z.string(),
      type: z.string(),
      priority: z.number(),
      isActive: z.boolean(),
    })),
    createdAt: z.string(),
  })),
});

const leadsResponseSchema = z.object({
  items: z.array(z.object({
    publicId: z.string(),
    nameSnapshot: z.string(),
    phoneSnapshot: z.string(),
    status: z.string(),
    campaign: z.object({ publicId: z.string(), name: z.string() }).optional(),
    lastOutboundAt: z.string().optional(),
    lastInboundAt: z.string().optional(),
    respondedAt: z.string().optional(),
    currentStep: z.number().optional(),
    followUpCount: z.number().optional(),
  })),
  pagination: z.object({
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

const progressSchema = z.object({
  totalLeads: z.number(),
  pending: z.number(),
  scheduled: z.number(),
  contacted: z.number(),
  responded: z.number(),
  interested: z.number(),
  failed: z.number(),
  suppressed: z.number(),
  sent: z.number(),
  delivered: z.number(),
  read: z.number(),
  dailySent: z.number(),
  dailyLimit: z.number(),
  progressPercent: z.number(),
  waitReason: z.string().nullable(),
});

const deleteResponseSchema = z.object({
  success: z.boolean(),
});

export function ProspectingModule({
  campaignPublicId,
}: {
  campaignPublicId?: string;
}) {
  const [view, setView] = useState<'dashboard' | 'campaigns' | 'detail' | 'leads' | 'conversations' | 'flows' | 'templates' | 'objections' | 'settings' | 'create'>(
    campaignPublicId ? 'detail' : 'campaigns'
  );
  const [page, setPage] = useState(1);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(
    campaignPublicId ?? null
  );
  const [filterCampaign, setFilterCampaign] = useState<string>('all');
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [materializeResult, setMaterializeResult] = useState<{
    created: number;
    ignored: number;
  } | null>(null);
  const queryClient = useQueryClient();

  const stats = useQuery({
    queryKey: ['prospecting', 'stats', filterCampaign],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterCampaign !== 'all') params.set('campaignId', filterCampaign);
      return httpClient.request(`/platform/prospecting/stats?${params.toString()}`, {
        schema: statsSchema,
      });
    },
  });

  const status = useQuery({
    queryKey: ['prospecting', 'status'],
    queryFn: () =>
      httpClient.request('/platform/prospecting/status', {
        schema: statusSchema,
      }),
  });

  const campaigns = useQuery({
    queryKey: ['prospecting', 'campaigns'],
    queryFn: () =>
      httpClient.request('/platform/prospecting/campaigns', {
        schema: campaignsResponseSchema,
      }),
  });

  const detail = useQuery({
    queryKey: ['prospecting', 'campaign', selectedCampaign],
    queryFn: () =>
      httpClient.request(`/platform/prospecting/campaigns/${selectedCampaign ?? ''}`, {
        schema: campaignDetailSchema,
      }),
    enabled: selectedCampaign !== null,
  });

  const progress = useQuery({
    queryKey: ['prospecting', 'campaign-progress', selectedCampaign],
    queryFn: () =>
      httpClient.request(`/platform/prospecting/campaigns/${selectedCampaign ?? ''}/progress`, {
        schema: progressSchema,
      }),
    enabled: selectedCampaign !== null,
    refetchInterval: detail.data?.status === 'RUNNING' ? 10_000 : false,
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

  const resumeMutation = useMutation({
    mutationFn: (id: string) =>
      httpClient.request(`/platform/prospecting/campaigns/${id}/resume`, { method: 'POST' }),
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

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      httpClient.request(`/platform/prospecting/campaigns/${id}`, {
        method: 'DELETE',
        schema: deleteResponseSchema,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prospecting'] });
      setSelectedCampaign(null);
      setView('campaigns');
      setConfirmation(null);
    },
  });

  const materializeMutation = useMutation({
    mutationFn: (id: string) =>
      httpClient.request(`/platform/prospecting/campaigns/${id}/materialize`, {
        method: 'POST',
        body: {}
      }) as Promise<{ materialized: number }>,
    onSuccess: (data) => {
      setMaterializeResult({ created: data.materialized, ignored: 0 });
      void queryClient.invalidateQueries({ queryKey: ['prospecting'] });
    },
  });

  const config = useQuery({
    queryKey: ['prospecting', 'config'],
    queryFn: () =>
      httpClient.request('/platform/prospecting/whatsapp', {
        schema: prospectingConfigSchema,
      }),
  });

  const updateConfigMutation = useMutation({
    mutationFn: (data: { instanceId: string; token?: string; phoneNumber?: string; instanceName?: string; isActive?: boolean }) =>
      httpClient.request('/platform/prospecting/whatsapp', {
        method: 'PUT',
        schema: prospectingConfigSchema,
        body: data,
      }),
    onSuccess: () => {
      void config.refetch();
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: () =>
      httpClient.request('/platform/prospecting/whatsapp/test', {
        method: 'POST',
        schema: testConnectionSchema,
      }),
  });

  const handleCancel = (id: string) => {
    setConfirmation({
      title: 'Cancelar campanha?',
      description: 'Esta ação interromperá novos envios. A campanha poderá ser excluída posteriormente.',
      confirmLabel: 'Cancelar campanha',
      requiresReason: false,
      variant: 'danger',
      onConfirm: async () => {
        await cancelMutation.mutateAsync(id);
      },
    });
  };

  const handleDelete = (id: string) => {
    setConfirmation({
      title: 'Excluir campanha?',
      description: 'Esta ação excluirá permanentemente a campanha e seus dados relacionados.',
      confirmLabel: 'Excluir definitivamente',
      requiresReason: false,
      variant: 'danger',
      onConfirm: async () => {
        await deleteMutation.mutateAsync(id);
      },
    });
  };

  const navItems = [
    { id: 'dashboard', label: 'Visão geral' },
    { id: 'campaigns', label: 'Campanhas' },
    { id: 'flows', label: 'Fluxos' },
    { id: 'leads', label: 'Leads' },
    { id: 'conversations', label: 'Conversas' },
    { id: 'templates', label: 'Templates' },
    { id: 'objections', label: 'Respostas e Objeções' },
    { id: 'settings', label: 'Configurações' },
  ];

  return (
    <div className="prospecting-module">
      <nav className="prospecting-tabs">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setView(item.id as any)}
            className={view === item.id ? 'is-active' : undefined}
          >
            {item.label}
          </button>
        ))}
      </nav>

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
          }}
          onViewDashboard={() => setView('dashboard')}
          onNewCampaign={() => setView('create')}
        />
      ) : view === 'flows' ? (
        <ProspectingFlowsView />
      ) : view === 'leads' ? (
        <ProspectingLeadsView
          campaigns={campaigns.data?.items ?? []}
          onLeadSelect={() => {}}
        />
      ) : view === 'conversations' ? (
        <ProspectingConversationsView />
      ) : view === 'templates' ? (
        <ProspectingTemplatesView
          campaigns={campaigns.data?.items ?? []}
          onNewCampaign={() => setView('create')}
        />
      ) : view === 'objections' ? (
        <ProspectingObjectionsView />
      ) : view === 'settings' ? (
        <SettingsView
          config={config.data}
          status={status.data}
          isLoadingConfig={config.isPending}
          isUpdatingConfig={updateConfigMutation.isPending}
          isTestingConnection={testConnectionMutation.isPending}
          onUpdateConfig={updateConfigMutation.mutateAsync}
          onTestConnection={() => testConnectionMutation.mutateAsync()}
          onNavigate={setView}
        />
      ) : view === 'create' ? (
        <ProspectingCampaignCreatePage
          onClose={() => setView('campaigns')}
          onSuccess={() => {
            void campaigns.refetch();
            void detail.refetch();
          }}
        />
      ) : (
        <DetailView
          campaign={detail.data as CampaignDetail | undefined}
          progress={progress.data}
          status={status.data}
          isLoading={detail.isPending || progress.isPending}
          progressError={progress.error instanceof Error ? progress.error.message : null}
          error={detail.error instanceof Error ? detail.error.message : null}
          onBack={() => setView('campaigns')}
          onEdit={() => setFormOpen(true)}
          onStart={() => void startMutation.mutateAsync(selectedCampaign!)}
          onPause={() => void pauseMutation.mutateAsync(selectedCampaign!)}
          onResume={() => void resumeMutation.mutateAsync(selectedCampaign!)}
          onCancel={() => handleCancel(selectedCampaign!)}
          onDelete={() => handleDelete(selectedCampaign!)}
          onMaterialize={() => void materializeMutation.mutateAsync(selectedCampaign!)}
          startLoading={startMutation.isPending}
          pauseLoading={pauseMutation.isPending}
          resumeLoading={resumeMutation.isPending}
          cancelLoading={cancelMutation.isPending}
          deleteLoading={deleteMutation.isPending}
          materializeLoading={materializeMutation.isPending}
          materializeResult={materializeResult}
          onClearResult={() => setMaterializeResult(null)}
        />
      )}
      {confirmation && (
        <ConfirmationDialog
          request={confirmation}
          onClose={() => setConfirmation(null)}
        />
      )}
      {formOpen && (
        <div className="prospecting-form-backdrop" onClick={() => setFormOpen(false)}>
          <div className="prospecting-form-drawer" onClick={(e) => e.stopPropagation()}>
            <CampaignForm
              initial={undefined}
              onClose={() => setFormOpen(false)}
              onSuccess={() => {
                void campaigns.refetch();
                void detail.refetch();
                setFormOpen(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
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
  onNewCampaign,
}: {
  campaigns: Campaign[];
  isLoading: boolean;
  error?: string | null;
  onDetail: (id: string) => void;
  onViewDashboard: () => void;
  onNewCampaign?: () => void;
}) {
  if (isLoading) {
    return (
      <section>
        <PageHeader
          title="Campanhas"
          description="Gerencie campanhas de prospecção."
          action={
            <button className="primary-button" onClick={onNewCampaign} type="button">
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
          <button className="primary-button" onClick={onNewCampaign} type="button">
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
          <button className="primary-button" onClick={onNewCampaign} type="button">
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
                <td>—</td>
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

const minutesToTime = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const translateWaitReason = (reason: string | null): string => {
  const translations: Record<string, string> = {
    WORKER_DISABLED: 'Worker de prospecção desativado.',
    DRY_RUN: 'Modo de teste ativo. Nenhuma mensagem real será enviada.',
    WHATSAPP_NOT_CONFIGURED: 'WhatsApp da prospecção não está configurado ou ativo.',
    OUTSIDE_WINDOW: 'Fora da janela de envio.',
    WEEKDAY_NOT_ALLOWED: 'Hoje não é um dia permitido para esta campanha.',
    DAILY_LIMIT_REACHED: 'Limite diário de envios atingido.',
    NO_ELIGIBLE_LEADS: 'Não há leads elegíveis para envio.',
  };
  if (!reason) return 'Aguardando próximo ciclo do worker.';
  return translations[reason] || reason;
};

function DetailView({
  campaign,
  progress,
  status,
  isLoading,
  progressError,
  error,
  onBack,
  onStart,
  onPause,
  onResume,
  onCancel,
  onDelete,
  onEdit,
  onMaterialize,
  startLoading,
  pauseLoading,
  resumeLoading,
  cancelLoading,
  deleteLoading,
  materializeLoading,
  materializeResult,
  onClearResult,
}: {
  campaign?: CampaignDetail;
  progress?: z.infer<typeof progressSchema>;
  status?: ProspectingStatus;
  isLoading: boolean;
  progressError?: string | null;
  error?: string | null;
  onBack: () => void;
  onStart: () => void;
  onPause: () => void;
  onResume?: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onMaterialize?: () => void;
  startLoading: boolean;
  pauseLoading: boolean;
  resumeLoading?: boolean;
  cancelLoading: boolean;
  deleteLoading?: boolean;
  materializeLoading?: boolean;
  materializeResult?: { created: number; ignored: number } | null;
  onClearResult?: () => void;
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
  const canResume = campaign.status === 'PAUSED';
  const canCancel = ['DRAFT', 'RUNNING', 'PAUSED'].includes(campaign.status);
  const canDelete = ['DRAFT', 'CANCELED'].includes(campaign.status);

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
          <button
            className="secondary-button"
            onClick={() => {
              const params = new URLSearchParams({ campaignPublicId: campaign.publicId });
              window.history.pushState({}, '', `?${params.toString()}`);
            }}
            type="button"
          >
            Ver Leads
          </button>
          {onEdit && (
            <button
              className="secondary-button"
              onClick={onEdit}
              type="button"
            >
              Editar
            </button>
          )}
          {campaign.status === 'DRAFT' && onMaterialize && (
            <button
              className="secondary-button"
              onClick={onMaterialize}
              disabled={materializeLoading}
              type="button"
            >
              {materializeLoading ? 'Preparando...' : 'Preparar Leads'}
            </button>
          )}
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
          {canResume && onResume && (
            <button
              className="primary-button"
              onClick={onResume}
              disabled={resumeLoading}
              type="button"
            >
              {resumeLoading ? 'Continuando...' : 'Continuar'}
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
          {canDelete && onDelete && (
            <button
              className="danger-button"
              onClick={onDelete}
              disabled={deleteLoading}
              type="button"
            >
              {deleteLoading ? 'Excluindo...' : 'Excluir campanha'}
            </button>
          )}
        </div>
      </div>

      {materializeResult && (
        <div className="materialize-result">
          <p>✓ Operação concluída!</p>
          <p>{materializeResult.created} leads adicionados</p>
          {materializeResult.ignored > 0 && (
            <p>{materializeResult.ignored} ignorados</p>
          )}
          <button
            className="secondary-button"
            onClick={onClearResult}
            type="button"
          >
            Fechar
          </button>
        </div>
      )}

      {status && campaign.status === 'RUNNING' && (
        <div className="platform-status-bar">
          <div>
            <strong>Worker:</strong>{' '}
            <span className={status.workerEnabled ? 'badge-success' : 'badge-muted'}>
              {status.workerEnabled ? 'Ativo' : 'Desativado'}
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
          </div>
        </div>
      )}

      {progress && (
        <article className="platform-panel">
          <h2>Progresso da campanha</h2>
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span>{progress.progressPercent}%</span>
            </div>
            <div style={{
              width: '100%',
              height: '24px',
              backgroundColor: 'var(--ds-background-tertiary)',
              borderRadius: '4px',
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${Math.min(progress.progressPercent, 100)}%`,
                height: '100%',
                backgroundColor: 'var(--ds-text-success)',
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>

          <div className="platform-metrics-grid">
            <MetricCard label="Total" value={progress.totalLeads.toString()} />
            <MetricCard label="Pendentes" value={progress.pending.toString()} />
            <MetricCard label="Agendados" value={progress.scheduled.toString()} />
            <MetricCard label="Contatados" value={progress.contacted.toString()} />
            <MetricCard label="Respondidos" value={progress.responded.toString()} />
            <MetricCard label="Interessados" value={progress.interested.toString()} />
            <MetricCard label="Falhas" value={progress.failed.toString()} />
            <MetricCard label="Suprimidos" value={progress.suppressed.toString()} />
          </div>

          <div style={{ marginTop: '1rem' }}>
            <strong>Mensagens:</strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '0.5rem' }}>
              <div>
                <p style={{ fontSize: '0.9rem', color: 'var(--ds-text-secondary)' }}>Enviadas</p>
                <p style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{progress.sent}</p>
              </div>
              <div>
                <p style={{ fontSize: '0.9rem', color: 'var(--ds-text-secondary)' }}>Entregues</p>
                <p style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{progress.delivered}</p>
              </div>
              <div>
                <p style={{ fontSize: '0.9rem', color: 'var(--ds-text-secondary)' }}>Lidas</p>
                <p style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{progress.read}</p>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: 'var(--ds-background-tertiary)', borderRadius: '4px' }}>
            <strong>Envios hoje:</strong> <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{progress.dailySent} / {progress.dailyLimit}</span>
            {progress.dailySent >= progress.dailyLimit && (
              <p style={{ marginTop: '0.5rem', color: 'var(--ds-text-danger)' }}>⚠ Limite diário atingido</p>
            )}
          </div>

          {campaign.status === 'RUNNING' && progress.waitReason && (
            <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: 'var(--ds-background-secondary)', borderRadius: '4px', borderLeft: '4px solid var(--ds-text-warning)' }}>
              <p style={{ margin: 0 }}>{translateWaitReason(progress.waitReason)}</p>
            </div>
          )}
        </article>
      )}

      {progressError && (
        <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: 'var(--ds-background-danger)', borderRadius: '4px', color: 'var(--ds-text-danger)' }}>
          Não foi possível carregar o progresso da campanha.
        </div>
      )}

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
              <dd>{minutesToTime(campaign.sendingStartMinutes)}</dd>
            </div>
            <div>
              <dt>Horário de fim</dt>
              <dd>{minutesToTime(campaign.sendingEndMinutes)}</dd>
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

function SettingsView({
  config,
  status,
  isLoadingConfig,
  isUpdatingConfig,
  isTestingConnection,
  onUpdateConfig,
  onTestConnection,
  onNavigate,
}: {
  config?: z.infer<typeof prospectingConfigSchema>;
  status?: ProspectingStatus;
  isLoadingConfig: boolean;
  isUpdatingConfig: boolean;
  isTestingConnection: boolean;
  onUpdateConfig: (data: { instanceId: string; token?: string; phoneNumber?: string; instanceName?: string; isActive?: boolean }) => Promise<unknown>;
  onTestConnection: () => Promise<unknown>;
  onNavigate: (view: string) => void;
}) {
  const [formData, setFormData] = useState({
    instanceId: config?.instanceId ?? '',
    token: '',
    phoneNumber: config?.phoneNumber ?? '',
    instanceName: config?.instanceName ?? '',
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testResult, setTestResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      const payload: { instanceId: string; token?: string; phoneNumber?: string; instanceName?: string } = {
        instanceId: formData.instanceId,
        phoneNumber: formData.phoneNumber,
        instanceName: formData.instanceName,
      };
      if (formData.token) {
        payload.token = formData.token;
      }
      await onUpdateConfig(payload);
      setFormData({ ...formData, token: '' });
      setMessage({ type: 'success', text: 'Configuração salva com sucesso.' });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Erro ao salvar configuração.',
      });
    }
  };

  const handleTestConnection = async () => {
    setTestResult(null);
    try {
      await onTestConnection();
      setTestResult({ type: 'success', text: 'Conexão testada com sucesso!' });
    } catch (error) {
      setTestResult({
        type: 'error',
        text: error instanceof Error ? error.message : 'Erro ao testar conexão.',
      });
    }
  };

  return (
    <section>
      <PageHeader
        title="Configurações da Prospecção"
        description="Gerencie a instância WhatsApp dedicada para envios de prospecção."
        action={
          <button
            className="secondary-button"
            onClick={() => onNavigate('campaigns')}
            type="button"
          >
            Voltar
          </button>
        }
      />

      <div style={{ maxWidth: '800px', marginTop: '2rem' }}>
        {/* WhatsApp Config Section */}
        <section className="config-section">
          <h2>WhatsApp da Prospecção</h2>
          {isLoadingConfig ? (
            <div className="platform-skeleton" style={{ height: '200px' }} />
          ) : (
            <form onSubmit={handleSaveConfig}>
              {message && (
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    borderRadius: '4px',
                    marginBottom: '1rem',
                    backgroundColor: message.type === 'success' ? '#d1fae5' : '#fee',
                    color: message.type === 'success' ? '#065f46' : '#c33',
                    border: `1px solid ${message.type === 'success' ? '#86efac' : '#fcc'}`,
                  }}
                >
                  {message.text}
                </div>
              )}

              <div className="config-section" style={{ marginBottom: '1.5rem' }}>
                <label>
                  <strong>Instance ID</strong>
                  <input
                    type="text"
                    value={formData.instanceId}
                    onChange={(e) => setFormData({ ...formData, instanceId: e.target.value })}
                    placeholder="ex: inst_1234567890"
                    required
                    style={{
                      marginTop: '0.5rem',
                      display: 'block',
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid var(--ds-border-neutral)',
                      borderRadius: '4px',
                      fontFamily: 'inherit',
                    }}
                  />
                </label>
              </div>

              <div className="config-section" style={{ marginBottom: '1.5rem' }}>
                <label>
                  <strong>Token da Instância</strong>
                  {config?.configured && !formData.token && (
                    <div style={{ fontSize: '0.9rem', color: 'var(--ds-text-secondary)', marginTop: '0.5rem' }}>
                      Token configurado. Deixe em branco para manter o token existente.
                    </div>
                  )}
                  <input
                    type="password"
                    value={formData.token}
                    onChange={(e) => setFormData({ ...formData, token: e.target.value })}
                    placeholder={config?.configured ? 'Deixe em branco para manter' : 'Cole seu token aqui'}
                    required={!config?.configured}
                    style={{
                      marginTop: '0.5rem',
                      display: 'block',
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid var(--ds-border-neutral)',
                      borderRadius: '4px',
                      fontFamily: 'inherit',
                    }}
                  />
                </label>
              </div>

              <div className="config-section" style={{ marginBottom: '1.5rem' }}>
                <label>
                  <strong>Número de Telefone (opcional)</strong>
                  <input
                    type="text"
                    value={formData.phoneNumber}
                    onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                    placeholder="ex: +55 11 98765-4321"
                    style={{
                      marginTop: '0.5rem',
                      display: 'block',
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid var(--ds-border-neutral)',
                      borderRadius: '4px',
                      fontFamily: 'inherit',
                    }}
                  />
                </label>
              </div>

              <div className="config-section" style={{ marginBottom: '1.5rem' }}>
                <label>
                  <strong>Nome da Instância (opcional)</strong>
                  <input
                    type="text"
                    value={formData.instanceName}
                    onChange={(e) => setFormData({ ...formData, instanceName: e.target.value })}
                    placeholder="ex: Prospecção - Empresa XYZ"
                    style={{
                      marginTop: '0.5rem',
                      display: 'block',
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid var(--ds-border-neutral)',
                      borderRadius: '4px',
                      fontFamily: 'inherit',
                    }}
                  />
                </label>
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={isUpdatingConfig}
                >
                  {isUpdatingConfig ? 'Salvando...' : 'Salvar Configuração'}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleTestConnection}
                  disabled={isTestingConnection || !config?.configured}
                >
                  {isTestingConnection ? 'Testando...' : 'Testar Conexão'}
                </button>
              </div>

              {testResult && (
                <div
                  style={{
                    marginTop: '1rem',
                    padding: '0.75rem 1rem',
                    borderRadius: '4px',
                    backgroundColor: testResult.type === 'success' ? '#d1fae5' : '#fee',
                    color: testResult.type === 'success' ? '#065f46' : '#c33',
                    border: `1px solid ${testResult.type === 'success' ? '#86efac' : '#fcc'}`,
                  }}
                >
                  {testResult.text}
                </div>
              )}
            </form>
          )}
        </section>

        {/* Status Section */}
        <section
          className="config-section"
          style={{ marginTop: '2rem', backgroundColor: 'var(--ds-background-secondary)', opacity: 0.8 }}
        >
          <h2>Status Operacional</h2>
          <dl style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <dt style={{ fontWeight: 600 }}>Worker</dt>
              <dd>{status?.workerEnabled ? 'Ativo' : 'Desativado'}</dd>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <dt style={{ fontWeight: 600 }}>Dry-run</dt>
              <dd>{status?.dryRun ? 'Ativo' : 'Desativado'}</dd>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <dt style={{ fontWeight: 600 }}>W-API</dt>
              <dd>{config?.configured ? 'Configurada' : 'Não configurada'}</dd>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <dt style={{ fontWeight: 600 }}>Instância</dt>
              <dd>{config?.isActive ? 'Ativa' : 'Inativa'}</dd>
            </div>
            {config?.lastConnectionStatus && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <dt style={{ fontWeight: 600 }}>Último Status</dt>
                <dd>{config.lastConnectionStatus}</dd>
              </div>
            )}
            {config?.lastCheckedAt && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <dt style={{ fontWeight: 600 }}>Último Teste</dt>
                <dd>{formatDate(new Date(config.lastCheckedAt))}</dd>
              </div>
            )}
          </dl>
        </section>
      </div>
    </section>
  );
}
