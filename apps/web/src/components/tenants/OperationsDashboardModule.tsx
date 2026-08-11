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
      <section className="platform-form" aria-label="Dashboard operacional">
        <h3>Dashboard operacional</h3>
        {dashboard.isPending ? <p>Carregando…</p> : null}
        {dashboard.error instanceof Error ? (
          <p className="form-error">Não foi possível carregar o dashboard.</p>
        ) : null}
        {dashboard.data !== undefined && (
          <>
            <p>
              <strong>Data:</strong> {dashboard.data.date}
            </p>
            <div className="session-grid">
              <article className="info-card">
                <span>Atendimentos de hoje</span>
                <strong>{dashboard.data.today.total}</strong>
              </article>
              <article className="info-card">
                <span>Próximos atendimentos</span>
                <strong>{dashboard.data.today.upcoming}</strong>
              </article>
              <article className="info-card">
                <span>Check-ins</span>
                <strong>{dashboard.data.today.checkedIn}</strong>
              </article>
              <article className="info-card">
                <span>Encaixes</span>
                <strong>{dashboard.data.today.fitIn}</strong>
              </article>
            </div>
            <h4>Por status</h4>
            <ul>
              {Object.entries(dashboard.data.today.byStatus).map(([status, count]) => (
                <li key={status}>
                  {statusLabels[status] ?? status}: {count}
                </li>
              ))}
            </ul>
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
