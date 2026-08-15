import { FinanceOverviewResponseSchema } from '@plataforma/shared';
import {
  IconArrowRight,
  IconCashRegister,
  IconChartBar,
  IconReceipt2,
  IconUsers,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import {
  formatCompactMoney,
  formatDate,
  formatDateTime,
  formatDay,
  formatMoneyCents,
  formatVariation,
  initials,
  localDate,
  percentOf,
  periodRange,
  PERIOD_OPTIONS,
  seriesGeometry,
  variation,
  variationTone,
  type FinanceOverview,
  type FinancePeriod,
} from './finance-overview.js';
import { httpClient } from '../../lib/http.js';
import { UnitSelect } from '../tenants/UnitSelect.js';
import { EmptyState, ListSkeleton, PageHeader, SectionCard } from '../ui/AppUi.js';

function Kpi({
  label,
  value,
  hint,
  delta,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: number | null;
  tone?: 'success' | 'warning' | 'danger';
}) {
  const direction = variationTone(delta ?? null);
  return (
    <article className={`finance-kpi${tone === undefined ? '' : ` finance-kpi--${tone}`}`}>
      <small>{label}</small>
      <strong>{value}</strong>
      <div className="finance-kpi-foot">
        {delta === null || delta === undefined ? (
          hint === undefined ? null : (
            <small>{hint}</small>
          )
        ) : (
          <span className={`finance-delta finance-delta--${direction}`}>
            {formatVariation(delta)}
            <small>vs. período anterior</small>
          </span>
        )}
        {delta !== null && delta !== undefined && hint !== undefined && <small>{hint}</small>}
      </div>
    </article>
  );
}

/** Gráfico em SVG: o projeto não usa biblioteca de charts e não vale adicionar uma. */
function RevenueChart({ series }: { series: FinanceOverview['series'] }) {
  const { max, points } = useMemo(() => seriesGeometry(series), [series]);
  if (points.length === 0 || max === 0)
    return (
      <EmptyState
        title="Ainda não há movimentação neste período."
        description="Assim que houver atendimentos concluídos ou recebimentos, o gráfico aparece aqui."
      />
    );
  return (
    <div className="finance-chart">
      <div className="finance-chart-scale">
        <span>{formatCompactMoney(max)}</span>
        <span>{formatCompactMoney(max / 2)}</span>
        <span>R$ 0</span>
      </div>
      <ol className="finance-chart-plot">
        {points.map((point) => (
          <li key={point.key}>
            <span className="finance-chart-bars">
              <span
                className="finance-bar finance-bar--billed"
                style={{ height: `${String(point.billedRatio * 100)}%` }}
              />
              <span
                className="finance-bar finance-bar--received"
                style={{ height: `${String(point.receivedRatio * 100)}%` }}
              />
              <span className="finance-chart-tooltip" role="note">
                <strong>{point.label}</strong>
                <span>Faturado: {formatMoneyCents(point.billedCents)}</span>
                <span>Recebido: {formatMoneyCents(point.receivedCents)}</span>
              </span>
            </span>
            <small>{point.label}</small>
          </li>
        ))}
      </ol>
      <div className="finance-chart-legend">
        <span>
          <i className="finance-swatch finance-swatch--billed" /> Faturado
        </span>
        <span>
          <i className="finance-swatch finance-swatch--received" /> Recebido
        </span>
      </div>
    </div>
  );
}

export function FinanceOverviewModule({
  tenantPublicId,
  canReadCash = false,
  canReadCommissions = false,
  canManagePayments = false,
  canReadCustomers = false,
  canReadFinancialReports = false,
}: {
  tenantPublicId: string;
  canReadCash?: boolean;
  canReadCommissions?: boolean;
  canManagePayments?: boolean;
  canReadCustomers?: boolean;
  canReadFinancialReports?: boolean;
}) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const period = (
    PERIOD_OPTIONS.some((option) => option.value === params.get('periodo'))
      ? params.get('periodo')
      : '30d'
  ) as FinancePeriod;
  const unitPublicId = params.get('unidade') ?? '';
  const [custom, setCustom] = useState(() => {
    const today = localDate(new Date());
    return { from: `${today.slice(0, 7)}-01`, to: today };
  });

  const range = useMemo(() => periodRange(period, custom), [period, custom]);

  const setRouteState = (next: { periodo?: FinancePeriod; unidade?: string }) => {
    const updated = new URLSearchParams(params);
    if (next.periodo !== undefined) updated.set('periodo', next.periodo);
    if (next.unidade !== undefined) {
      if (next.unidade === '') updated.delete('unidade');
      else updated.set('unidade', next.unidade);
    }
    setParams(updated);
  };

  const overview = useQuery({
    queryKey: ['tenant', tenantPublicId, 'finance-overview', range, unitPublicId],
    queryFn: () => {
      const query = new URLSearchParams({ fromDate: range.fromDate, toDate: range.toDate });
      if (unitPublicId !== '') query.set('unitPublicId', unitPublicId);
      return httpClient.request(`/tenant/finance/overview?${query.toString()}`, {
        schema: FinanceOverviewResponseSchema,
        tenantPublicId,
      });
    },
    retry: false,
  });

  const data = overview.data;
  const receivedDelta = variation(
    data?.totals.receivedCents ?? '0',
    data?.previousTotals?.receivedCents,
  );
  const billedDelta = variation(
    data?.totals.billedCents ?? '0',
    data?.previousTotals?.billedCents,
  );
  const ticketDelta = variation(
    data?.totals.ticketAverageCents ?? '0',
    data?.previousTotals?.ticketAverageCents,
  );

  const openAppointments = (payment: string) => {
    void navigate(`/app/agenda/agendamentos?pagamento=${payment}`);
  };

  return (
    <div className="ds-stack finance-page" aria-label="Visão financeira">
      <PageHeader
        eyebrow="Financeiro"
        title="Visão geral"
        description="Acompanhe receitas, recebimentos e a saúde financeira do negócio."
        actions={
          <div className="finance-filters">
            <div className="segmented-control finance-period">
              {PERIOD_OPTIONS.filter((option) => option.value !== 'custom').map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={period === option.value ? 'active' : ''}
                  aria-pressed={period === option.value}
                  onClick={() => {
                    setRouteState({ periodo: option.value });
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <label className="finance-unit">
              <span className="sr-only">Unidade</span>
              <UnitSelect
                tenantPublicId={tenantPublicId}
                value={unitPublicId}
                onChange={(value) => {
                  setRouteState({ unidade: value });
                }}
              />
            </label>
          </div>
        }
      />

      <div className="finance-subfilters">
        <button
          type="button"
          className={`finance-chip${period === 'custom' ? ' is-active' : ''}`}
          onClick={() => {
            setRouteState({ periodo: 'custom' });
          }}
        >
          Personalizado
        </button>
        {period === 'custom' && (
          <>
            <label>
              De
              <input
                type="date"
                value={custom.from}
                onChange={(event) => {
                  setCustom({ ...custom, from: event.target.value });
                }}
              />
            </label>
            <label>
              Até
              <input
                type="date"
                value={custom.to}
                onChange={(event) => {
                  setCustom({ ...custom, to: event.target.value });
                }}
              />
            </label>
          </>
        )}
        <span className="finance-period-label">
          {formatDay(range.fromDate)} — {formatDay(range.toDate)}
          {data === undefined ? '' : ` · ${data.timezone}`}
        </span>
        <div className="finance-shortcuts">
          {canManagePayments && (
            <button
              className="secondary-button button--sm"
              type="button"
              onClick={() => {
                openAppointments('ON_SITE');
              }}
            >
              <IconReceipt2 size={15} aria-hidden="true" /> Registrar recebimento
            </button>
          )}
          {canReadCash && (
            <button
              className="secondary-button button--sm"
              type="button"
              onClick={() => {
                void navigate('/app/financeiro/caixa');
              }}
            >
              <IconCashRegister size={15} aria-hidden="true" /> Caixa
            </button>
          )}
          {canReadCommissions && (
            <button
              className="secondary-button button--sm"
              type="button"
              onClick={() => {
                void navigate('/app/equipe/comissoes');
              }}
            >
              <IconUsers size={15} aria-hidden="true" /> Comissões
            </button>
          )}
          {canReadFinancialReports && (
            <button
              className="secondary-button button--sm"
              type="button"
              onClick={() => {
                void navigate('/app/financeiro/relatorios');
              }}
            >
              <IconChartBar size={15} aria-hidden="true" /> Relatórios
            </button>
          )}
        </div>
      </div>

      {overview.isPending ? (
        <ListSkeleton rows={5} />
      ) : overview.error instanceof Error || data === undefined ? (
        <div className="ds-inline-alert ds-inline-alert--danger">
          <div>
            <strong>Não foi possível carregar o financeiro.</strong>
          </div>
          <button
            className="secondary-button button--sm"
            type="button"
            onClick={() => {
              void overview.refetch();
            }}
          >
            Tentar novamente
          </button>
        </div>
      ) : (
        <>
          <div className="finance-kpis">
            <Kpi
              label="Faturado"
              value={formatMoneyCents(data.totals.billedCents)}
              hint={`${String(data.totals.completedAppointments)} atendimento(s) concluído(s)`}
              delta={billedDelta}
            />
            <Kpi
              label="Recebido"
              value={formatMoneyCents(data.totals.receivedCents)}
              hint="Pagamentos confirmados"
              delta={receivedDelta}
              tone="success"
            />
            <Kpi
              label="A receber"
              value={formatMoneyCents(data.receivables.totalCents)}
              hint={`${String(data.receivables.count)} atendimento(s) em aberto`}
              tone="warning"
            />
            <Kpi
              label="Ticket médio"
              value={formatMoneyCents(data.totals.ticketAverageCents)}
              hint="Faturado por atendimento"
              delta={ticketDelta}
            />
            {data.commissions !== null && (
              <Kpi
                label="Comissões geradas"
                value={formatMoneyCents(data.commissions.generatedCents)}
                hint={`${String(data.commissions.generatedCount)} lançamento(s)`}
              />
            )}

          </div>

          <div className="finance-grid">
            <SectionCard
              className="finance-chart-card"
              title="Receita e recebimentos"
              description="Faturado é o serviço concluído; recebido é o pagamento confirmado."
            >
              <RevenueChart series={data.series} />
            </SectionCard>

            <SectionCard title="Como você recebe" description="Somente pagamentos confirmados.">
              {data.paymentMethods.length === 0 ? (
                <p className="ds-form-hint">Ainda não há recebimentos neste período.</p>
              ) : (
                <ul className="finance-methods">
                  {data.paymentMethods.map((method) => (
                    <li key={method.publicId}>
                      <div>
                        <strong>{method.name}</strong>
                        <small>{method.count} pagamento(s)</small>
                      </div>
                      <span className="ds-usage">
                        <span
                          style={{
                            width: percentOf(method.totalCents, data.totals.receivedCents),
                          }}
                        />
                      </span>
                      <span className="finance-method-value">
                        {formatMoneyCents(method.totalCents)}
                        <small>{percentOf(method.totalCents, data.totals.receivedCents)}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard
              title="A receber"
              description="Saldo em aberto dos atendimentos: previsto, não vencido."
              actions={
                <button
                  className="secondary-button button--sm"
                  type="button"
                  onClick={() => {
                    void navigate('/app/financeiro/pendencias');
                  }}
                >
                  Ver todos <IconArrowRight size={14} aria-hidden="true" />
                </button>
              }
            >
              <div className="finance-receivables">
                <div>
                  <small>Saldo pendente</small>
                  <strong>{formatMoneyCents(data.receivables.totalCents)}</strong>
                </div>
                <div>
                  <small>Online aguardando confirmação</small>
                  <strong>{formatMoneyCents(data.receivables.onlinePendingCents)}</strong>
                </div>
                <div>
                  <small>Cobrança falhou ou expirou</small>
                  <strong>{formatMoneyCents(data.receivables.onlineFailedCents)}</strong>
                </div>
                <div>
                  <small>Pagamento no local</small>
                  <strong>{formatMoneyCents(data.receivables.onSiteCents)}</strong>
                </div>
              </div>
              {data.receivables.top.length === 0 ? (
                <p className="ds-form-hint">Nenhum saldo em aberto. Tudo recebido por aqui.</p>
              ) : (
                <ul className="finance-receivable-list">
                  {data.receivables.top.map((item) => (
                    <li key={item.appointmentPublicId}>
                      <div>
                        {canReadCustomers ? (
                          <button
                            className="text-button"
                            type="button"
                            onClick={() => {
                              void navigate(`/app/clientes/${item.customerPublicId}`);
                            }}
                          >
                            {item.customerName}
                          </button>
                        ) : (
                          <strong>{item.customerName}</strong>
                        )}
                        <small>
                          {item.protocol} · {formatDate(item.startsAt)}
                        </small>
                      </div>
                      <span
                        className={`ds-badge ds-badge--${item.state === 'ONLINE_FAILED' ? 'danger' : item.state === 'ONLINE_PENDING' ? 'info' : 'warning'}`}
                      >
                        {item.state === 'ONLINE_FAILED'
                          ? 'Falhou/expirou'
                          : item.state === 'ONLINE_PENDING'
                            ? 'Aguardando online'
                            : 'No local'}
                      </span>
                      <strong>{formatMoneyCents(item.balanceCents)}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard
              className="finance-professionals-card"
              title="Desempenho por profissional"
              description="Faturado, atendimentos concluídos e ticket médio no período."
              actions={
                canReadCommissions ? (
                  <button
                    className="secondary-button button--sm"
                    type="button"
                    onClick={() => {
                      void navigate('/app/equipe/comissoes');
                    }}
                  >
                    Ver comissões
                  </button>
                ) : undefined
              }
            >
              {data.professionals.length === 0 ? (
                <p className="ds-form-hint">Sem atendimentos concluídos neste período.</p>
              ) : (
                <ul className="finance-professionals">
                  {data.professionals.map((professional) => (
                    <li key={professional.publicId}>
                      <span className="finance-avatar" aria-hidden="true">
                        {initials(professional.name)}
                      </span>
                      <div>
                        <strong>{professional.name}</strong>
                        <small>
                          {professional.completedAppointments} atendimento(s) · ticket{' '}
                          {formatMoneyCents(professional.ticketAverageCents)}
                        </small>
                      </div>
                      <div className="finance-professional-values">
                        <strong>{formatMoneyCents(professional.billedCents)}</strong>
                        {professional.commissionsCents !== null && (
                          <small>
                            comissão {formatMoneyCents(professional.commissionsCents)}
                          </small>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            {data.cash !== null && (
              <SectionCard
                title="Caixa"
                description="Movimento do caixa. Não é receita adicional: os recebimentos abaixo já estão em Recebido."
                actions={
                  <button
                    className="secondary-button button--sm"
                    type="button"
                    onClick={() => {
                      void navigate('/app/financeiro/caixa');
                    }}
                  >
                    Abrir caixa
                  </button>
                }
              >
                <dl className="finance-facts">
                  <div>
                    <dt>Entradas</dt>
                    <dd>{formatMoneyCents(data.cash.inCents)}</dd>
                  </div>
                  <div>
                    <dt>Das quais recebimentos</dt>
                    <dd>{formatMoneyCents(data.cash.paymentInCents)}</dd>
                  </div>
                  <div>
                    <dt>Saídas</dt>
                    <dd>{formatMoneyCents(data.cash.outCents)}</dd>
                  </div>
                  <div>
                    <dt>Saldo do período</dt>
                    <dd>
                      {data.cash.netCents.startsWith('-') ? '−' : ''}
                      {formatMoneyCents(data.cash.netCents.replace('-', ''))}
                    </dd>
                  </div>
                  <div>
                    <dt>Caixa aberto</dt>
                    <dd>
                      {data.cash.openRegisterBalanceCents === null
                        ? 'Nenhum'
                        : formatMoneyCents(data.cash.openRegisterBalanceCents)}
                    </dd>
                  </div>
                </dl>
              </SectionCard>
            )}

            {data.commissions !== null && (
              <SectionCard
                title="Comissões"
                description="Lançamentos gerados pelos pagamentos do período."
                actions={
                  <button
                    className="secondary-button button--sm"
                    type="button"
                    onClick={() => {
                      void navigate('/app/equipe/comissoes');
                    }}
                  >
                    Ver comissões
                  </button>
                }
              >
                <dl className="finance-facts">
                  <div>
                    <dt>Geradas</dt>
                    <dd>{formatMoneyCents(data.commissions.generatedCents)}</dd>
                  </div>
                  <div>
                    <dt>Lançamentos</dt>
                    <dd>{data.commissions.generatedCount}</dd>
                  </div>
                  <div>
                    <dt>Canceladas</dt>
                    <dd>{formatMoneyCents(data.commissions.canceledCents)}</dd>
                  </div>
                </dl>
              </SectionCard>
            )}

            <SectionCard
              className="finance-activity-card"
              title="Atividade recente"
              description="Movimentos financeiros já registrados."
            >
              {data.recentActivity.length === 0 ? (
                <p className="ds-form-hint">Sem movimentação financeira neste período.</p>
              ) : (
                <ul className="finance-activity">
                  {data.recentActivity.map((entry, index) => (
                    <li key={`${entry.at}-${String(index)}`}>
                      <div>
                        <strong>{entry.title}</strong>
                        <small>
                          {formatDateTime(entry.at)}
                          {entry.description === null ? '' : ` · ${entry.description}`}
                        </small>
                      </div>
                      <span
                        className={`finance-activity-value finance-activity-value--${entry.direction.toLowerCase()}`}
                      >
                        {entry.direction === 'IN' ? '+' : '−'}
                        {formatMoneyCents(entry.amountCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}
