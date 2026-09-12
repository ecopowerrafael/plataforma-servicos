import { TenantDashboardResponseSchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';
import { IconCalendar, IconClock, IconCheck, IconUser } from '@tabler/icons-react';

import { httpClient } from '../../lib/http.js';
import { PageHeader, Skeleton } from '../ui/DesignSystemComponents.js';
import { SectionCard, ListContainer, ListItem, Badge } from '../ui/DesignSystemComponents.js';

const statusLabels: Record<string, string> = {
  PENDING: 'Pendentes',
  CONFIRMED: 'Confirmados',
  IN_PROGRESS: 'Em atendimento',
  COMPLETED: 'Concluídos',
  CANCELED: 'Cancelados',
  NO_SHOW: 'Faltas',
};

const statusColors: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  PENDING: 'warning',
  CONFIRMED: 'info',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  CANCELED: 'neutral',
  NO_SHOW: 'danger',
};

function MetricCard({
  icon: Icon,
  label,
  value,
  unit,
}: {
  icon: React.ComponentType<{ size: number }>;
  label: string;
  value: number;
  unit?: string;
}) {
  return (
    <div className="metric-card-v2">
      <div className="metric-icon-wrapper">
        <Icon size={24} />
      </div>
      <div className="metric-content">
        <p className="metric-label">{label}</p>
        <div className="metric-value">
          {value}
          {unit && <span className="metric-unit">{unit}</span>}
        </div>
      </div>
    </div>
  );
}

export function OperationsDashboardModule({ tenantPublicId }: { tenantPublicId: string }) {
  const dashboard = useQuery({
    queryKey: ['tenant', tenantPublicId, 'dashboard'],
    queryFn: () =>
      httpClient.request('/tenant/dashboard', {
        schema: TenantDashboardResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  const todayDate = dashboard.data?.date
    ? new Date(`${dashboard.data.date}T12:00:00`).toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
      })
    : '';

  return (
    <div className="operations-dashboard">
      <PageHeader
        title="Seu dia em resumo"
        subtitle={todayDate ? `Hoje, ${todayDate}` : 'Visão geral'}
      />

      {dashboard.isPending && (
        <div className="metrics-grid">
          <Skeleton count={4} type="card" />
        </div>
      )}

      {dashboard.error instanceof Error && (
        <div className="alert alert-danger">
          <p>Não foi possível carregar o dashboard. Tente novamente.</p>
        </div>
      )}

      {dashboard.data !== undefined && (
        <>
          {/* Metrics Grid */}
          <div className="metrics-grid">
            <MetricCard
              icon={IconCalendar}
              label="Atendimentos de hoje"
              value={dashboard.data.today.total}
            />
            <MetricCard
              icon={IconClock}
              label="Próximos atendimentos"
              value={dashboard.data.today.upcoming}
            />
            <MetricCard
              icon={IconCheck}
              label="Check-ins"
              value={dashboard.data.today.checkedIn}
            />
            <MetricCard
              icon={IconUser}
              label="Encaixes"
              value={dashboard.data.today.fitIn}
            />
          </div>

          {/* Status Breakdown */}
          <SectionCard title="Atendimentos por status">
            <div className="status-grid">
              {Object.entries(dashboard.data.today.byStatus).map(([status, count]) => (
                <div key={status} className="status-item">
                  <div className="status-info">
                    <p className="status-name">{statusLabels[status] ?? status}</p>
                    <p className="status-count">{count}</p>
                  </div>
                  <Badge type={statusColors[status] ?? 'neutral'}>{count}</Badge>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* By Professional */}
          {dashboard.data.today.byProfessional.length > 0 && (
            <SectionCard title="Atendimentos por profissional">
              <ListContainer>
                {dashboard.data.today.byProfessional.map((entry) => (
                  <ListItem
                    key={entry.professionalPublicId}
                    title={entry.professionalName}
                    badge={<Badge type="primary">{entry.total}</Badge>}
                  />
                ))}
              </ListContainer>
            </SectionCard>
          )}

          {/* By Unit */}
          {dashboard.data.today.byUnit.length > 0 && (
            <SectionCard title="Atendimentos por unidade">
              <ListContainer>
                {dashboard.data.today.byUnit.map((entry) => (
                  <ListItem
                    key={entry.unitPublicId ?? 'sem-unidade'}
                    title={entry.unitName}
                    badge={<Badge type="primary">{entry.total}</Badge>}
                  />
                ))}
              </ListContainer>
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}
