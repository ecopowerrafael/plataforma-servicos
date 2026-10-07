import { FinancialReportResponseSchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { environment } from '../../config/environment.js';
import { httpClient } from '../../lib/http.js';
import { EmptyState, ListSkeleton, PageHeader, PageToolbar } from '../ui/AppUi.js';

const money = (cents: string) => {
  const value = BigInt(cents);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, '0');
  return `${negative ? '- ' : ''}R$ ${new Intl.NumberFormat('pt-BR').format(whole)},${fraction}`;
};
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
    <section
      className="sessions-panel financial-report financial-report--redesigned"
      aria-label="Relatórios financeiros"
    >
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
          {summary.isUnitPartialView && (
            <div className="app-card" role="note">
              Este resultado considera apenas valores diretamente atribuídos à unidade.
              Mensalidades, repasses e outras movimentações globais não são rateados
              automaticamente.
            </div>
          )}
          <div className="report-metric-grid">
            <Metric label="Receita recebida" value={money(summary.receivedRevenueCents)} />
            <Metric label="Resultado operacional" value={money(summary.operatingResultCents)} />
            <Metric label="Resultado de caixa" value={money(summary.cashResultCents)} />
            <Metric label="Reembolsos" value={money(summary.membershipRefundsCents)} />
            <Metric label="Chargebacks" value={money(summary.membershipChargebacksCents)} />
            <Metric label="Comissões geradas" value={money(summary.traditionalCommissionsCents)} />
            <Metric label="Repasses líquidos" value={money(summary.professionalPayoutsCents)} />
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
          {summary.isUnitPartialView && (
            <article className="app-card">
              <p className="ds-eyebrow">Valores globais não atribuídos</p>
              <dl className="platform-details">
                <div>
                  <dt>Mensalidades globais</dt>
                  <dd>{money(summary.globalUnallocatedMembershipRevenueCents)}</dd>
                </div>
                <div>
                  <dt>Repasses globais</dt>
                  <dd>{money(summary.globalUnallocatedProfessionalPayoutsCents)}</dd>
                </div>
                <div>
                  <dt>Outras saídas globais</dt>
                  <dd>{money(summary.globalUnallocatedManualOutCents)}</dd>
                </div>
              </dl>
            </article>
          )}
          <div className="report-secondary-grid">
            <article className="app-card">
              <p className="ds-eyebrow">Movimentações e perdas</p>
              <dl className="platform-details">
                <div>
                  <dt>Receita por origem</dt>
                  <dd>
                    Atendimentos {money(summary.appointmentRevenueCents)} · Mensalidades{' '}
                    {money(summary.membershipRevenueCents)} · Dívidas{' '}
                    {money(summary.debtRevenueCents)}
                  </dd>
                </div>
                <div>
                  <dt>Comissões tradicionais</dt>
                  <dd>
                    {money(summary.traditionalCommissionsCents)} · {summary.commissionsCount}
                  </dd>
                </div>
                <div>
                  <dt>Repasses líquidos</dt>
                  <dd>{money(summary.professionalPayoutsCents)}</dd>
                </div>
                <div>
                  <dt>Reembolsos de Membership</dt>
                  <dd>{money(summary.membershipRefundsCents)}</dd>
                </div>
                <div>
                  <dt>Chargebacks de Membership</dt>
                  <dd>{money(summary.membershipChargebacksCents)}</dd>
                </div>
                <div>
                  <dt>Outras saídas manuais</dt>
                  <dd>{money(summary.otherManualOutCents)}</dd>
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
