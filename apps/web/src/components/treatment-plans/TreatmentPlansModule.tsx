import { TreatmentPlanListResponseSchema, type TreatmentPlanPublic } from '@plataforma/shared';
import { IconChevronRight, IconPhone, IconSearch, IconEdit, IconCalendar } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { getTreatmentPlansLabels } from './treatment-plans-labels.js';
import { TreatmentPlanFollowUpSection } from './TreatmentPlanFollowUpSection.js';
import { TreatmentPlanCheckpointsSection } from './TreatmentPlanCheckpointsSection.js';
import { TreatmentPlanEditDialog } from './TreatmentPlanEditDialog.js';
import { TreatmentPlanScheduleSessionDialog } from './TreatmentPlanScheduleSessionDialog.js';
import { TreatmentPlansHeader, TreatmentPlanRow, TreatmentPlanCard } from './TreatmentPlansUIComponents.js';
import { formatMoneyCents, formatShortDate } from '../customers/customer-crm.js';
import { httpClient } from '../../lib/http.js';
import { EmptyState, ListSkeleton, PageHeader } from '../ui/AppUi.js';

type StatusFilter = 'all' | 'PENDING' | 'APPROVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Aguardando aprovação',
  APPROVED: 'Aprovado',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluído',
  CANCELED: 'Cancelado',
};

const STATUS_TONE: Record<string, string> = {
  PENDING: 'alert',
  APPROVED: 'success',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  CANCELED: 'neutral',
};

export function TreatmentPlansModule({
  tenantPublicId,
}: {
  tenantPublicId: string;
}) {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  const treatmentPlansLabels = getTreatmentPlansLabels();

  const plans = useQuery({
    queryKey: ['treatmentPlans', tenantPublicId],
    queryFn: () =>
      httpClient.request('/tenant/treatment-plans', {
        schema: TreatmentPlanListResponseSchema,
        tenantPublicId,
      }),
  });

  const selectedPlan = plans.data?.items?.find((p) => p.publicId === selectedPlanId) ?? null;

  const filteredPlans = (plans.data?.items ?? []).filter((plan) => {
    if (statusFilter !== 'all' && plan.status !== statusFilter) return false;
    if (search === '') return true;
    const searchLower = search.toLowerCase();
    return (
      plan.customerName.toLowerCase().includes(searchLower) ||
      plan.serviceName.toLowerCase().includes(searchLower) ||
      plan.professionalName.toLowerCase().includes(searchLower) ||
      plan.title.toLowerCase().includes(searchLower)
    );
  });

  const pendingCount = (plans.data?.items ?? []).filter((p) => p.status === 'PENDING').length;
  const approvedThisMonth = (plans.data?.items ?? []).filter((p) => p.status === 'APPROVED').length;
  const inProgressCount = (plans.data?.items ?? []).filter((p) => p.status === 'IN_PROGRESS').length;

  if (plans.isPending) return <ListSkeleton />;

  if (viewMode === 'detail' && selectedPlan) {
    return (
      <TreatmentPlanDetail
        plan={selectedPlan}
        onBack={() => {
          setViewMode('list');
          setSelectedPlanId(null);
        }}
      />
    );
  }

  return (
    <section className="treatment-plans-module">
      <PageHeader
        title={getTreatmentPlansLabels().moduleTitle}
        subtitle={`${filteredPlans.length} ${treatmentPlansLabels.plural.toLowerCase()}`}
      />

      <TreatmentPlansHeader
        onSearch={(value) => setSearch(value)}
        stats={
          <div className="treatment-plans-stats">
            <div className="stat-item">
              <div className="stat-value">{pendingCount}</div>
              <div className="stat-label">Aguardando</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{approvedThisMonth}</div>
              <div className="stat-label">Aprovados</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{inProgressCount}</div>
              <div className="stat-label">Em andamento</div>
            </div>
          </div>
        }
      />

      <div className="treatment-plans-status-filter">
        {(['all', 'PENDING', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED'] as const).map(
          (status) => (
            <button
              key={status}
              type="button"
              className={`filter-btn ${statusFilter === status ? 'active' : ''}`}
              onClick={() => setStatusFilter(status)}
            >
              {status === 'all' ? 'Todos' : STATUS_LABELS[status]}
            </button>
          ),
        )}
      </div>

      {filteredPlans.length === 0 ? (
        <EmptyState
          title="Nenhum orçamento encontrado"
          description={
            search || statusFilter !== 'all'
              ? 'Tente alterar os filtros de busca.'
              : `Você não tem ${treatmentPlansLabels.plural.toLowerCase()} ainda.`
          }
        />
      ) : (
        <>
          <div className="treatment-plans-list">
            {filteredPlans.map((plan) => (
              <TreatmentPlanRow
                key={plan.publicId}
                id={plan.publicId}
                title={plan.title}
                customer={plan.customerName}
                service={plan.serviceName}
                professional={plan.professionalName}
                value={formatMoneyCents(plan.amountCents)}
                sessions={`${plan.sessionsCompleted}/${plan.sessionsPlanned}`}
                status={
                  <span className={`status-badge status-${STATUS_TONE[plan.status]}`}>
                    {STATUS_LABELS[plan.status]}
                  </span>
                }
                onClick={() => {
                  setSelectedPlanId(plan.publicId);
                  setViewMode('detail');
                }}
              />
            ))}
          </div>

          <div className="treatment-plans-mobile-list">
            {filteredPlans.map((plan) => (
              <TreatmentPlanCard
                key={plan.publicId}
                title={plan.title}
                customer={plan.customerName}
                service={plan.serviceName}
                professional={plan.professionalName}
                value={formatMoneyCents(plan.amountCents)}
                sessions={`${plan.sessionsCompleted}/${plan.sessionsPlanned}`}
                status={
                  <span className={`status-badge status-${STATUS_TONE[plan.status]}`}>
                    {STATUS_LABELS[plan.status]}
                  </span>
                }
                onClick={() => {
                  setSelectedPlanId(plan.publicId);
                  setViewMode('detail');
                }}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

type EditableFields = ('title' | 'billingMode' | 'amount' | 'sessions' | 'interval' | 'notes')[];

function getEditableFields(plan: TreatmentPlanPublic): EditableFields {
  if (plan.status === 'PENDING') {
    return ['title', 'billingMode', 'amount', 'sessions', 'interval', 'notes'];
  }
  if (plan.status === 'APPROVED') {
    // APPROVED sem nenhuma sessão iniciada e sem pagamento
    const hasPayment = (plan.paidCents ?? 0) > 0;
    const hasSessionStarted = plan.sessions.some(s => s.status !== 'CANCELED');

    if (!hasPayment && !hasSessionStarted) {
      return ['title', 'billingMode', 'amount', 'sessions', 'interval', 'notes'];
    }
    // APPROVED com sessão futura mas nenhuma concluída - restringir
    return ['title', 'interval', 'notes'];
  }
  if (plan.status === 'IN_PROGRESS') {
    // IN_PROGRESS - apenas administrativo
    return ['title', 'interval', 'notes'];
  }
  return [];
}

function TreatmentPlanDetail({ plan, onBack }: { plan: TreatmentPlanPublic; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);

  const editableFields = getEditableFields(plan);
  const canEdit = editableFields.length > 0;
  const canScheduleSession =
    (plan.status === 'APPROVED' && plan.sessionsCompleted === 0) ||
    (plan.status === 'IN_PROGRESS' && plan.sessionsCompleted < plan.sessionsPlanned);

  const refetchPlan = () => {
    queryClient.invalidateQueries({ queryKey: ['treatmentPlans'] });
  };

  return (
    <section className="treatment-plan-detail">
      <button type="button" className="back-button" onClick={onBack}>
        ← Voltar
      </button>

      <header className="detail-header">
        <div>
          <h1>{plan.title}</h1>
          <p className="detail-subtitle">{plan.serviceName}</p>
        </div>
        <span className={`status-badge status-${STATUS_TONE[plan.status]}`}>
          {STATUS_LABELS[plan.status]}
        </span>
      </header>

      {(canEdit || canScheduleSession) && (
        <div className="detail-actions-top">
          {canEdit && (
            <button
              type="button"
              className="action-button primary"
              onClick={() => setShowEditDialog(true)}
            >
              <IconEdit size={18} />
              Editar orçamento
            </button>
          )}
          {canScheduleSession && (
            <button
              type="button"
              className="action-button primary"
              onClick={() => setShowScheduleDialog(true)}
            >
              <IconCalendar size={18} />
              {plan.sessionsCompleted === 0 ? 'Agendar primeira sessão' : 'Agendar próxima sessão'}
            </button>
          )}
        </div>
      )}

      <div className="detail-grid">
        <div className="detail-section">
          <h2>Cliente</h2>
          <div className="detail-field">
            <label>Nome</label>
            <p>{plan.customerName}</p>
          </div>
        </div>

        <div className="detail-section">
          <h2>Orçamento</h2>
          <div className="detail-field">
            <label>Título</label>
            <p>{plan.title}</p>
          </div>
          <div className="detail-field">
            <label>Serviço</label>
            <p>{plan.serviceName}</p>
          </div>
          <div className="detail-field">
            <label>Profissional</label>
            <p>{plan.professionalName}</p>
          </div>
          <div className="detail-field">
            <label>Valor por sessão</label>
            <p className="amount">{formatMoneyCents(plan.amountCents)}</p>
          </div>
          {plan.estimatedTotalCents && (
            <div className="detail-field">
              <label>Valor total estimado</label>
              <p className="amount">{formatMoneyCents(plan.estimatedTotalCents)}</p>
            </div>
          )}
        </div>

        <div className="detail-section">
          <h2>Sessões</h2>
          <div className="detail-field">
            <label>Planejadas</label>
            <p>{plan.sessionsPlanned}</p>
          </div>
          <div className="detail-field">
            <label>Realizadas</label>
            <p>{plan.sessionsCompleted}</p>
          </div>
          {plan.returnIntervalDays && (
            <div className="detail-field">
              <label>Intervalo entre sessões</label>
              <p>{plan.returnIntervalDays} dias</p>
            </div>
          )}
          {plan.recommendedNextDate && (
            <div className="detail-field">
              <label>Próxima sessão recomendada</label>
              <p>{formatShortDate(new Date(plan.recommendedNextDate))}</p>
            </div>
          )}
        </div>

        {plan.sessions.length > 0 && (
          <div className="detail-section full">
            <h2>Histórico de sessões</h2>
            <div className="sessions-list">
              {plan.sessions.map((session) => (
                <div key={session.appointmentPublicId} className="session-item">
                  <div className="session-info">
                    <strong>Sessão {session.sessionNumber}</strong>
                    <span className="session-date">{formatShortDate(new Date(session.startsAt))}</span>
                  </div>
                  <div className="session-status">
                    <span className="session-status-badge">{session.status}</span>
                    <span className="session-price">{formatMoneyCents(session.priceCents)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <TreatmentPlanCheckpointsSection plan={plan} />

      <TreatmentPlanFollowUpSection
        treatmentPlanPublicId={plan.publicId}
        canUpdate={plan.status === 'PENDING' || plan.status === 'APPROVED'}
      />

      <div className="detail-actions">
        <button
          type="button"
          className="action-button secondary"
          onClick={onBack}
        >
          ← Voltar
        </button>
      </div>

      {showEditDialog && (
        <TreatmentPlanEditDialog
          plan={plan}
          onClose={() => setShowEditDialog(false)}
          onSuccess={() => {
            setShowEditDialog(false);
            refetchPlan();
          }}
          allowedFields={editableFields}
        />
      )}

      {showScheduleDialog && (
        <TreatmentPlanScheduleSessionDialog
          plan={plan}
          onClose={() => setShowScheduleDialog(false)}
          onSuccess={() => {
            setShowScheduleDialog(false);
            refetchPlan();
          }}
        />
      )}
    </section>
  );
}
