import { TreatmentPlanListResponseSchema, type TreatmentPlanPublic } from '@plataforma/shared';
import { IconChevronRight, IconPhone, IconSearch } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { treatmentPlansLabels } from './treatment-plans-labels.js';
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

  const plans = useQuery({
    queryKey: ['treatmentPlans', tenantPublicId],
    queryFn: () =>
      httpClient.request('/tenant/treatment-plans', {
        schema: TreatmentPlanListResponseSchema,
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
        title={treatmentPlansLabels.moduleTitle}
        subtitle={`${filteredPlans.length} ${treatmentPlansLabels.plural.toLowerCase()}`}
      />

      <div className="treatment-plans-dashboard">
        <div className="dashboard-card">
          <div className="dashboard-card-value">{pendingCount}</div>
          <div className="dashboard-card-label">Aguardando aprovação</div>
          <button
            className="dashboard-card-link"
            type="button"
            onClick={() => {
              setStatusFilter('PENDING');
              setSearch('');
            }}
          >
            Ver todos →
          </button>
        </div>
        <div className="dashboard-card">
          <div className="dashboard-card-value">{approvedThisMonth}</div>
          <div className="dashboard-card-label">Aprovados este mês</div>
        </div>
        <div className="dashboard-card">
          <div className="dashboard-card-value">{inProgressCount}</div>
          <div className="dashboard-card-label">Em andamento</div>
          <button
            className="dashboard-card-link"
            type="button"
            onClick={() => {
              setStatusFilter('IN_PROGRESS');
              setSearch('');
            }}
          >
            Ver todos →
          </button>
        </div>
      </div>

      <div className="treatment-plans-filters">
        <div className="filter-search">
          <IconSearch size={18} />
          <input
            type="text"
            placeholder="Buscar por cliente, serviço, profissional..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="filter-status">
          {(['all', 'PENDING', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED'] as const).map(
            (status) => (
              <button
                key={status}
                type="button"
                className={statusFilter === status ? 'active' : ''}
                onClick={() => setStatusFilter(status)}
              >
                {status === 'all' ? 'Todos' : STATUS_LABELS[status]}
              </button>
            ),
          )}
        </div>
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
          <div className="treatment-plans-desktop">
            <table className="treatment-plans-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Orçamento</th>
                  <th>Serviço</th>
                  <th>Profissional</th>
                  <th>Valor</th>
                  <th>Sessões</th>
                  <th>Status</th>
                  <th>Criado em</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredPlans.map((plan) => (
                  <tr key={plan.publicId}>
                    <td>{plan.customerName}</td>
                    <td>{plan.title}</td>
                    <td>{plan.serviceName}</td>
                    <td>{plan.professionalName}</td>
                    <td>{formatMoneyCents(plan.amountCents)}</td>
                    <td>
                      {plan.sessionsCompleted}/{plan.sessionsPlanned}
                    </td>
                    <td>
                      <span className={`status-badge status-${STATUS_TONE[plan.status]}`}>
                        {STATUS_LABELS[plan.status]}
                      </span>
                    </td>
                    <td>{formatShortDate(new Date(plan.createdAt))}</td>
                    <td>
                      <button
                        type="button"
                        className="action-button"
                        onClick={() => {
                          setSelectedPlanId(plan.publicId);
                          setViewMode('detail');
                        }}
                      >
                        <IconChevronRight size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="treatment-plans-mobile">
            {filteredPlans.map((plan) => (
              <div
                key={plan.publicId}
                className="treatment-plan-card"
                onClick={() => {
                  setSelectedPlanId(plan.publicId);
                  setViewMode('detail');
                }}
              >
                <div className="card-header">
                  <div>
                    <h3>{plan.title}</h3>
                    <p className="card-customer">{plan.customerName}</p>
                  </div>
                  <span className={`status-badge status-${STATUS_TONE[plan.status]}`}>
                    {STATUS_LABELS[plan.status]}
                  </span>
                </div>
                <div className="card-body">
                  <div className="card-row">
                    <span className="card-label">Serviço</span>
                    <span className="card-value">{plan.serviceName}</span>
                  </div>
                  <div className="card-row">
                    <span className="card-label">Profissional</span>
                    <span className="card-value">{plan.professionalName}</span>
                  </div>
                  <div className="card-row">
                    <span className="card-label">Valor</span>
                    <span className="card-value">{formatMoneyCents(plan.amountCents)}</span>
                  </div>
                  <div className="card-row">
                    <span className="card-label">Sessões</span>
                    <span className="card-value">
                      {plan.sessionsCompleted}/{plan.sessionsPlanned}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function TreatmentPlanDetail({ plan, onBack }: { plan: TreatmentPlanPublic; onBack: () => void }) {
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

      <div className="detail-actions">
        <button
          type="button"
          className="action-button secondary"
          onClick={onBack}
        >
          Voltar
        </button>
      </div>
    </section>
  );
}
