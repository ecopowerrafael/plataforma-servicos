import { TenantDashboardResponseSchema, TenantReportResponseSchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';

const statusLabels: Record<string, string> = {
  PENDING: 'Pendentes',
  CONFIRMED: 'Confirmados',
  IN_PROGRESS: 'Em atendimento',
  COMPLETED: 'Concluídos',
  CANCELED: 'Cancelados',
  NO_SHOW: 'Faltas',
};

const today = () => new Date().toISOString().slice(0, 10);

const startOfDayIso = (date: string) => `${date}T00:00:00.000Z`;
const endOfDayIso = (date: string) => `${date}T23:59:59.999Z`;

export function OperationsDashboardModule({ tenantPublicId }: { tenantPublicId: string }) {
  const [reportFrom, setReportFrom] = useState(() =>
    startOfDayIso(new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10)),
  );
  const [reportTo, setReportTo] = useState(() => endOfDayIso(today()));

  const dashboard = useQuery({
    queryKey: ['tenant', tenantPublicId, 'dashboard'],
    queryFn: () =>
      httpClient.request('/tenant/dashboard', {
        schema: TenantDashboardResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  const report = useQuery({
    queryKey: ['tenant', tenantPublicId, 'reports', reportFrom, reportTo],
    queryFn: () =>
      httpClient.request(
        `/tenant/reports?${new URLSearchParams({ from: reportFrom, to: reportTo }).toString()}`,
        { schema: TenantReportResponseSchema, tenantPublicId },
      ),
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

      <section className="platform-form" aria-label="Relatórios">
        <h3>Relatórios</h3>
        <div className="form-row">
          <label>
            De
            <input
              type="date"
              value={reportFrom.slice(0, 10)}
              onChange={(event) => {
                setReportFrom(startOfDayIso(event.target.value));
              }}
            />
          </label>
          <label>
            Até
            <input
              type="date"
              value={reportTo.slice(0, 10)}
              onChange={(event) => {
                setReportTo(endOfDayIso(event.target.value));
              }}
            />
          </label>
        </div>
        {report.isPending ? <p>Carregando…</p> : null}
        {report.error instanceof Error ? (
          <p className="form-error">Não foi possível carregar o relatório.</p>
        ) : null}
        {report.data !== undefined && (
          <>
            <p>
              <strong>Total no período:</strong> {report.data.total}
            </p>
            <p>
              <strong>Novos clientes:</strong> {report.data.newCustomers}
            </p>
            <p>
              <strong>Taxa de cancelamento:</strong>{' '}
              {(report.data.cancellationRate * 100).toFixed(1)}%
            </p>
            <p>
              <strong>Taxa de falta:</strong> {(report.data.noShowRate * 100).toFixed(1)}%
            </p>

            <h4>Por status</h4>
            <ul>
              {Object.entries(report.data.byStatus).map(([status, count]) => (
                <li key={status}>
                  {statusLabels[status] ?? status}: {count}
                </li>
              ))}
            </ul>

            {report.data.byProfessional.length > 0 && (
              <>
                <h4>Por profissional</h4>
                <ul>
                  {report.data.byProfessional.map((entry) => (
                    <li key={entry.professionalPublicId}>
                      {entry.professionalName}: {entry.total}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {report.data.byService.length > 0 && (
              <>
                <h4>Por serviço</h4>
                <ul>
                  {report.data.byService.map((entry) => (
                    <li key={entry.servicePublicId}>
                      {entry.serviceName}: {entry.total}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {report.data.byUnit.length > 0 && (
              <>
                <h4>Por unidade</h4>
                <ul>
                  {report.data.byUnit.map((entry) => (
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
