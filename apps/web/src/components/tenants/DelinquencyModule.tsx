import { DelinquencyResponseSchema, FinancialReportResponseSchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { httpClient } from '../../lib/http.js';
import { EmptyState, ListSkeleton, PageHeader, PageToolbar, StatusBadge } from '../ui/AppUi.js';

const money = (cents: string) =>
  (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const statusLabels: Record<string, string> = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmado',
  IN_PROGRESS: 'Em atendimento',
  COMPLETED: 'Concluído',
  NO_SHOW: 'Falta',
};

const dateTime = (value: string) =>
  new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const isoDaysAgo = (days: number) =>
  `${new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)}T00:00:00.000Z`;

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <article className="app-card report-metric">
      <p className="ds-eyebrow">{label}</p>
      <strong>{value}</strong>
      {hint === undefined ? null : <small>{hint}</small>}
    </article>
  );
}

/**
 * Visão geral do financeiro: indicadores reais do período e a inadimplência
 * como lista operacional. `showSummary` respeita a permissão de relatórios.
 */
export function DelinquencyModule({
  tenantPublicId,
  showSummary = false,
}: {
  tenantPublicId: string;
  showSummary?: boolean;
}) {
  const navigate = useNavigate();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');

  const query = new URLSearchParams();
  if (from !== '') query.set('from', `${from}T00:00:00.000Z`);
  if (to !== '') query.set('to', `${to}T23:59:59.999Z`);
  if (status !== '') query.set('status', status);

  const delinquency = useQuery({
    queryKey: ['tenant', tenantPublicId, 'delinquency', from, to, status],
    queryFn: () =>
      httpClient.request(`/tenant/delinquency?${query.toString()}`, {
        schema: DelinquencyResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const report = useQuery({
    queryKey: ['tenant', tenantPublicId, 'financial-overview'],
    queryFn: () => {
      const range = new URLSearchParams({
        from: isoDaysAgo(29),
        to: new Date().toISOString(),
        compareWithPrevious: 'false',
      });
      return httpClient.request(`/tenant/financial-reports?${range.toString()}`, {
        schema: FinancialReportResponseSchema,
        tenantPublicId,
      });
    },
    enabled: showSummary,
    retry: false,
  });

  const items = delinquency.data?.items ?? [];
  const summary = report.data?.summary;
  return (
    <section className="sessions-panel financial-overview" aria-label="Visão geral do financeiro">
      <PageHeader
        eyebrow="Financeiro"
        title="Visão geral"
        description="Acompanhe recebimentos e o que ainda está em aberto."
      />
      <div className="report-metric-grid">
        {summary !== undefined ? (
          <>
            <Metric
              label="Receita recebida"
              value={money(summary.paymentsReceivedCents)}
              hint="Últimos 30 dias"
            />
            <Metric
              label="Saldo pendente"
              value={money(summary.pendingBalanceCents)}
              hint={`${String(summary.pendingBalanceCount)} agendamentos`}
            />
          </>
        ) : null}
        <Metric
          label="Inadimplência"
          value={
            delinquency.data === undefined ? '—' : money(delinquency.data.totalBalanceCents)
          }
          hint={`${String(items.length)} agendamentos com saldo`}
        />
        {summary !== undefined ? (
          <>
            <Metric
              label="Caixa"
              value={money(summary.cashMovementsNetCents)}
              hint="Movimentação líquida"
            />
            <Metric
              label="Comissões geradas"
              value={money(summary.commissionsCents)}
              hint={`${String(summary.commissionsCount)} lançamentos`}
            />
          </>
        ) : null}
      </div>
      <PageToolbar>
        <label>
          De
          <input
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
            }}
          />
        </label>
        <label>
          Até
          <input
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
            }}
          />
        </label>
        <label>
          Status
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
            }}
          >
            <option value="">Todos os status</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </PageToolbar>
      <h3 className="financial-section-title">Inadimplência</h3>
      {delinquency.isPending ? (
        <ListSkeleton rows={4} />
      ) : delinquency.error instanceof Error ? (
        <EmptyState
          title="Não foi possível carregar a inadimplência."
          description="Tente novamente."
          action={<button onClick={() => void delinquency.refetch()}>Tentar novamente</button>}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="Nenhum saldo em aberto"
          description="Todos os agendamentos do período selecionado estão quitados."
        />
      ) : (
        <div className="delinquency-list">
          {items.map((item) => (
            <button
              key={item.appointmentPublicId}
              className="delinquency-row"
              type="button"
              title="Abrir o cliente para ver agendamentos e pagamentos"
              onClick={() => void navigate(`/app/clientes/${item.customerPublicId}`)}
            >
              <span className="delinquency-identity">
                <strong>{item.customerName}</strong>
                <small>
                  {item.protocol} · {dateTime(item.startsAt)}
                </small>
                <small>
                  {item.professionalName}
                  {item.unitName === null ? '' : ` · ${item.unitName}`}
                </small>
              </span>
              <span className="delinquency-amounts">
                <small>Total {money(item.priceCents)}</small>
                <small>Pago {money(item.paidCents)}</small>
                <strong>Saldo {money(item.balanceCents)}</strong>
              </span>
              <StatusBadge active={false}>{statusLabels[item.status] ?? item.status}</StatusBadge>
              <i aria-hidden="true">›</i>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
