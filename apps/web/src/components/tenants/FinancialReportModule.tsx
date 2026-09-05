import { FinancialReportResponseSchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { environment } from '../../config/environment.js';
import { httpClient } from '../../lib/http.js';
import { EmptyState, ListSkeleton, PageHeader, PageToolbar } from '../ui/AppUi.js';

const money = (cents: string) =>
  (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const today = () => new Date().toISOString().slice(0, 10);
const startOfDayIso = (date: string) => `${date}T00:00:00.000Z`;
const endOfDayIso = (date: string) => `${date}T23:59:59.999Z`;

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
}) {
  return (
    <article className="app-card report-metric">
      <p className="ds-eyebrow">{label}</p>
      <strong>{value}</strong>
      {hint === undefined ? null : <small>{hint}</small>}
    </article>
  );
}

function BreakdownTable({
  title,
  items,
}: {
  title: string;
  items: { key: string; label: string; totalCents: string; count: number }[];
}) {
  return (
    <article className="app-card report-breakdown">
      <p className="ds-eyebrow">{title}</p>
      {items.length === 0 ? (
        <p className="muted">Sem dados no período.</p>
      ) : (
        <div className="report-table-scroll">
          <table className="platform-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Lançamentos</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.key}>
                  <td>{item.label}</td>
                  <td>{item.count}</td>
                  <td>{money(item.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

export function FinancialReportModule({ tenantPublicId }: { tenantPublicId: string }) {
  const [from, setFrom] = useState(() =>
    startOfDayIso(new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10)),
  );
  const [to, setTo] = useState(() => endOfDayIso(today()));
  const [compare, setCompare] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const query = new URLSearchParams({ from, to, compareWithPrevious: String(compare) });

  const report = useQuery({
    queryKey: ['tenant', tenantPublicId, 'financial-reports', from, to, compare],
    queryFn: () =>
      httpClient.request(`/tenant/financial-reports?${query.toString()}`, {
        schema: FinancialReportResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  const exportCsv = async () => {
    setExportError(null);
    try {
      const response = await fetch(
        `${environment.apiUrl}/tenant/financial-reports/export?${query.toString()}`,
        { headers: { 'X-Tenant-Id': tenantPublicId }, credentials: 'include' },
      );
      if (!response.ok) throw new Error('Não foi possível exportar o relatório.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'relatorio-financeiro.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError('Não foi possível exportar o relatório.');
    }
  };

  const data = report.data;
  const summary = data?.summary;
  const comparison = data?.comparison ?? null;
  return (
    <section className="sessions-panel financial-report" aria-label="Relatórios financeiros">
      <PageHeader
        eyebrow="Financeiro"
        title="Relatórios"
        description="Acompanhe receita, recebimentos e movimentações do período."
        actions={
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              void exportCsv();
            }}
          >
            Exportar CSV
          </button>
        }
      />
      <PageToolbar>
        <label>
          Período inicial
          <input
            type="date"
            value={from.slice(0, 10)}
            onChange={(event) => {
              setFrom(startOfDayIso(event.target.value));
            }}
          />
        </label>
        <label>
          Período final
          <input
            type="date"
            value={to.slice(0, 10)}
            onChange={(event) => {
              setTo(endOfDayIso(event.target.value));
            }}
          />
        </label>
        <label className="ds-switch-field">
          <input
            className="ds-switch"
            role="switch"
            type="checkbox"
            checked={compare}
            onChange={(event) => {
              setCompare(event.target.checked);
            }}
          />
          Comparar período anterior
        </label>
      </PageToolbar>
      {exportError !== null && (
        <p className="form-error" role="alert">
          {exportError}
        </p>
      )}
      {report.isPending ? (
        <ListSkeleton rows={4} />
      ) : report.error instanceof Error || summary === undefined || data === undefined ? (
        <EmptyState
          title="Não foi possível carregar o relatório."
          description="Ajuste o período ou tente novamente."
          action={<button onClick={() => void report.refetch()}>Tentar novamente</button>}
        />
      ) : (
        <>
          <div className="report-metric-grid">
            <Metric label="Receita bruta" value={money(summary.grossRevenueCents)} />
            <Metric label="Receita líquida" value={money(summary.netRevenueCents)} />
            <Metric
              label="Pagamentos recebidos"
              value={money(summary.paymentsReceivedCents)}
              hint={`${String(summary.paymentsReceivedCount)} pagamentos`}
            />
            <Metric
              label="Estornos e cancelamentos"
              value={money(summary.paymentsCanceledCents)}
              hint={`${String(summary.paymentsCanceledCount)} pagamentos`}
            />
            <Metric
              label="Sinais"
              value={money(summary.depositsCents)}
              hint={`${String(summary.depositsCount)} sinais`}
            />
            <Metric
              label="Saldo pendente"
              value={money(summary.pendingBalanceCents)}
              hint={`${String(summary.pendingBalanceCount)} agendamentos`}
            />
            <Metric label="Entradas manuais" value={money(summary.cashManualInCents)} />
            <Metric label="Saídas manuais" value={money(summary.cashManualOutCents)} />
          </div>
          <div className="report-secondary-grid">
            <article className="app-card">
              <p className="ds-eyebrow">Movimentações e perdas</p>
              <dl className="platform-details">
                <div>
                  <dt>Movimentação líquida de caixa</dt>
                  <dd>{money(summary.cashMovementsNetCents)}</dd>
                </div>
                <div>
                  <dt>Comissões geradas</dt>
                  <dd>
                    {money(summary.commissionsCents)} · {summary.commissionsCount}
                  </dd>
                </div>
                <div>
                  <dt>Cancelamentos</dt>
                  <dd>
                    {summary.canceledAppointmentsCount} ·{' '}
                    {money(summary.canceledAppointmentsLostRevenueCents)} perdidos
                  </dd>
                </div>
                <div>
                  <dt>Faltas</dt>
                  <dd>
                    {summary.noShowAppointmentsCount} ·{' '}
                    {money(summary.noShowAppointmentsLostRevenueCents)} perdidos
                  </dd>
                </div>
              </dl>
            </article>
            {comparison !== null && (
              <article className="app-card">
                <p className="ds-eyebrow">Comparação com o período anterior</p>
                <dl className="platform-details">
                  <div>
                    <dt>Receita bruta anterior</dt>
                    <dd>{money(comparison.previous.grossRevenueCents)}</dd>
                  </div>
                  <div>
                    <dt>Variação</dt>
                    <dd>
                      {money(comparison.deltaGrossRevenueCents)}
                      {comparison.deltaGrossRevenuePercent === null
                        ? ''
                        : ` (${comparison.deltaGrossRevenuePercent.toFixed(1).replace('.', ',')}%)`}
                    </dd>
                  </div>
                </dl>
              </article>
            )}
          </div>
          <div className="report-secondary-grid">
            <BreakdownTable title="Por forma de pagamento" items={data.byPaymentMethod} />
            <BreakdownTable title="Por serviço" items={data.byService} />
            <BreakdownTable title="Por profissional" items={data.byProfessional} />
            <BreakdownTable title="Por unidade" items={data.byUnit} />
          </div>
        </>
      )}
    </section>
  );
}
