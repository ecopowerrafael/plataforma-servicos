import { FinancialReportResponseSchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { environment } from '../../config/environment.js';
import { httpClient } from '../../lib/http.js';

const formatMoney = (cents: string) => `R$ ${(Number(cents) / 100).toFixed(2)}`;
const today = () => new Date().toISOString().slice(0, 10);
const startOfDayIso = (date: string) => `${date}T00:00:00.000Z`;
const endOfDayIso = (date: string) => `${date}T23:59:59.999Z`;

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
        {
          headers: { 'X-Tenant-Id': tenantPublicId },
          credentials: 'include',
        },
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

  return (
    <section className="platform-form" aria-label="Relatórios financeiros">
      <h3>Relatórios financeiros</h3>
      <div className="form-actions">
        <input
          type="date"
          value={from.slice(0, 10)}
          onChange={(event) => {
            setFrom(startOfDayIso(event.target.value));
          }}
        />
        <input
          type="date"
          value={to.slice(0, 10)}
          onChange={(event) => {
            setTo(endOfDayIso(event.target.value));
          }}
        />
        <label>
          <input
            type="checkbox"
            checked={compare}
            onChange={(event) => {
              setCompare(event.target.checked);
            }}
          />
          Comparar com período anterior
        </label>
        <button
          type="button"
          onClick={() => {
            void exportCsv();
          }}
        >
          Exportar CSV
        </button>
      </div>
      {exportError !== null && <p className="form-error">{exportError}</p>}

      {report.isPending ? <p>Carregando…</p> : null}
      {report.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar o relatório.</p>
      ) : null}
      {report.data !== undefined && (
        <>
          <h4>Resumo</h4>
          <ul>
            <li>{`Receita bruta: ${formatMoney(report.data.summary.grossRevenueCents)}`}</li>
            <li>{`Receita líquida: ${formatMoney(report.data.summary.netRevenueCents)}`}</li>
            <li>
              {`Pagamentos recebidos: ${formatMoney(report.data.summary.paymentsReceivedCents)} (${String(report.data.summary.paymentsReceivedCount)})`}
            </li>
            <li>
              {`Pagamentos cancelados/estornados: ${formatMoney(report.data.summary.paymentsCanceledCents)} (${String(report.data.summary.paymentsCanceledCount)})`}
            </li>
            <li>
              {`Sinais: ${formatMoney(report.data.summary.depositsCents)} (${String(report.data.summary.depositsCount)})`}
            </li>
            <li>
              {`Saldo pendente / inadimplência: ${formatMoney(report.data.summary.pendingBalanceCents)} (${String(report.data.summary.pendingBalanceCount)} agendamentos)`}
            </li>
            <li>{`Entradas manuais de caixa: ${formatMoney(report.data.summary.cashManualInCents)}`}</li>
            <li>{`Saídas manuais de caixa: ${formatMoney(report.data.summary.cashManualOutCents)}`}</li>
            <li>
              {`Movimentação líquida de caixa: ${formatMoney(report.data.summary.cashMovementsNetCents)}`}
            </li>
            <li>
              {`Comissões geradas: ${formatMoney(report.data.summary.commissionsCents)} (${String(report.data.summary.commissionsCount)})`}
            </li>
            <li>
              {`Cancelamentos: ${String(report.data.summary.canceledAppointmentsCount)} — receita perdida: ${formatMoney(report.data.summary.canceledAppointmentsLostRevenueCents)}`}
            </li>
            <li>
              {`Faltas: ${String(report.data.summary.noShowAppointmentsCount)} — receita perdida: ${formatMoney(report.data.summary.noShowAppointmentsLostRevenueCents)}`}
            </li>
          </ul>

          {report.data.comparison !== null && (
            <>
              <h4>Comparação com período anterior</h4>
              <ul>
                <li>
                  {`Receita bruta anterior: ${formatMoney(report.data.comparison.previous.grossRevenueCents)}`}
                </li>
                <li>
                  {`Variação: ${formatMoney(report.data.comparison.deltaGrossRevenueCents)} (${
                    report.data.comparison.deltaGrossRevenuePercent === null
                      ? 'N/D'
                      : `${report.data.comparison.deltaGrossRevenuePercent.toFixed(1)}%`
                  })`}
                </li>
              </ul>
            </>
          )}

          <h4>Receita por forma de pagamento</h4>
          <ul>
            {report.data.byPaymentMethod.map((item) => (
              <li
                key={item.key}
              >{`${item.label}: ${formatMoney(item.totalCents)} (${String(item.count)})`}</li>
            ))}
            {report.data.byPaymentMethod.length === 0 && <li>Sem dados no período.</li>}
          </ul>

          <h4>Receita por serviço</h4>
          <ul>
            {report.data.byService.map((item) => (
              <li
                key={item.key}
              >{`${item.label}: ${formatMoney(item.totalCents)} (${String(item.count)})`}</li>
            ))}
            {report.data.byService.length === 0 && <li>Sem dados no período.</li>}
          </ul>

          <h4>Receita por profissional</h4>
          <ul>
            {report.data.byProfessional.map((item) => (
              <li
                key={item.key}
              >{`${item.label}: ${formatMoney(item.totalCents)} (${String(item.count)})`}</li>
            ))}
            {report.data.byProfessional.length === 0 && <li>Sem dados no período.</li>}
          </ul>

          <h4>Receita por unidade</h4>
          <ul>
            {report.data.byUnit.map((item) => (
              <li
                key={item.key}
              >{`${item.label}: ${formatMoney(item.totalCents)} (${String(item.count)})`}</li>
            ))}
            {report.data.byUnit.length === 0 && <li>Sem dados no período.</li>}
          </ul>
        </>
      )}
    </section>
  );
}
