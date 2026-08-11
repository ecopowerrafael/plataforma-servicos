import { TenantDashboardResponseSchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';

import { httpClient } from '../../lib/http.js';

const statusLabels: Record<string, string> = {
  PENDING: 'Pendentes',
  CONFIRMED: 'Confirmados',
  IN_PROGRESS: 'Em atendimento',
  COMPLETED: 'Concluídos',
  CANCELED: 'Cancelados',
  NO_SHOW: 'Faltas',
};

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

  return (
    <>
      <section className="platform-form dashboard-module" aria-label="Resumo do dia">
        <div className="module-header">
          <div>
            <p className="eyebrow">Visão geral</p>
            <h2>Seu dia em resumo</h2>
            <p>Acompanhe os atendimentos e mantenha a operação fluindo.</p>
          </div>
        </div>
        {dashboard.isPending ? <p>Carregando…</p> : null}
        {dashboard.error instanceof Error ? (
          <p className="form-error">Não foi possível carregar o dashboard.</p>
        ) : null}
        {dashboard.data !== undefined && (
          <>
            <p className="dashboard-date">Hoje, {new Date(`${dashboard.data.date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
            <div className="dashboard-metrics">
              <article className="info-card metric-card">
                <span>Atendimentos de hoje</span>
                <strong>{dashboard.data.today.total}</strong>
              </article>
              <article className="info-card metric-card">
                <span>Próximos atendimentos</span>
                <strong>{dashboard.data.today.upcoming}</strong>
              </article>
              <article className="info-card metric-card">
                <span>Check-ins</span>
                <strong>{dashboard.data.today.checkedIn}</strong>
              </article>
              <article className="info-card metric-card">
                <span>Encaixes</span>
                <strong>{dashboard.data.today.fitIn}</strong>
              </article>
            </div>
            <div className="dashboard-breakdown">
            <h3>Atendimentos por status</h3>
            <ul className="status-summary-list">
              {Object.entries(dashboard.data.today.byStatus).map(([status, count]) => (
                <li key={status}>
                  {statusLabels[status] ?? status}: {count}
                </li>
              ))}
            </ul>
            </div>
            {dashboard.data.today.byProfessional.length > 0 && (
              <>
                <h4>Por profissional</h4>
                <ul>
                  {dashboard.data.today.byProfessional.map((entry) => (
                    <li key={entry.professionalPublicId}>
                      {entry.professionalName}: {entry.total}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {dashboard.data.today.byUnit.length > 0 && (
              <>
                <h4>Por unidade</h4>
                <ul>
                  {dashboard.data.today.byUnit.map((entry) => (
                    <li key={entry.unitPublicId ?? 'sem-unidade'}>
                      {entry.unitName}: {entry.total}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </section>
    </>
  );
}
