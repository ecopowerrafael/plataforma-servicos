import {
  ProfessionalCommissionCycleListResponseSchema,
  ProfessionalCommissionCycleSchema,
  ProfessionalPayoutSettlementSchema,
  TenantContextResponseSchema,
} from '@plataforma/shared';
import { IconCoin } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';

import { HttpError, httpClient } from '../../lib/http.js';
import { EmptyState, InlineAlert, ListSkeleton, SectionCard, StatCard, StatGrid, StatusBadge } from '../ui/AppUi.js';

const money = (cents: string) => {
  const value = BigInt(cents);
  const units = value / 100n;
  const remainder = value % 100n;
  return `R$ ${units.toLocaleString('pt-BR')},${remainder.toString().padStart(2, '0')}`;
};

const date = (value: string | null, timezone: string) => value === null ? '—' : new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, dateStyle: 'medium' }).format(new Date(value));
const period = (start: string, end: string, timezone: string) => `${date(start, timezone)} — ${date(end, timezone)}`;

const statusLabel = (status: 'OPEN' | 'CLOSED', readyToClose: boolean) => status === 'CLOSED' ? 'Fechado' : readyToClose ? 'Aguardando fechamento' : 'Em andamento';

export function MyCommissionCyclesModule({ tenantPublicId }: { tenantPublicId: string }) {
  const context = useQuery({ queryKey: ['tenant', tenantPublicId, 'context'], queryFn: () => httpClient.request('/tenant/context', { schema: TenantContextResponseSchema, tenantPublicId }), retry: false });
  const current = useQuery({ queryKey: ['tenant', tenantPublicId, 'professionals', 'me', 'commission-cycles', 'current'], queryFn: () => httpClient.request('/tenant/professionals/me/commission-cycles/current', { schema: ProfessionalCommissionCycleSchema, tenantPublicId }), retry: false });
  const history = useQuery({ queryKey: ['tenant', tenantPublicId, 'professionals', 'me', 'commission-cycles'], queryFn: () => httpClient.request('/tenant/professionals/me/commission-cycles', { schema: ProfessionalCommissionCycleListResponseSchema, tenantPublicId }), retry: false });
  const timezone = context.data?.tenant.timezone ?? 'UTC';
  const cycle = current.data;
  const payouts = useQuery({ queryKey: ['tenant', tenantPublicId, 'professionals', 'me', 'commission-cycle-payouts', cycle?.publicId], queryFn: () => httpClient.request(`/tenant/professionals/me/commission-cycles/${cycle?.publicId}/payouts`, { schema: ProfessionalPayoutSettlementSchema, tenantPublicId }), enabled: cycle?.status === 'CLOSED' });

  if (current.isPending) return <ListSkeleton rows={3} />;
  if (current.error instanceof HttpError && current.error.code === 'COMMISSION_CYCLE_NOT_CONFIGURED') return <EmptyState icon={<IconCoin size={22} aria-hidden="true" />} title="Rateio de assinaturas ainda não está disponível." description="O estabelecimento ainda não configurou este benefício." />;
  if (current.error instanceof HttpError && current.error.code === 'COMMISSION_CYCLE_NOT_STARTED') return <EmptyState icon={<IconCoin size={22} aria-hidden="true" />} title="Ainda não há um ciclo de rateio disponível." description="O rateio aparecerá quando o período configurado começar." />;
  if (current.error instanceof Error) return <InlineAlert tone="danger" title="Não foi possível carregar seu rateio de assinaturas">Verifique sua conexão e tente novamente.</InlineAlert>;
  if (cycle === undefined) return null;
  const amount = cycle.status === 'CLOSED' ? (cycle.myFinalAmountCents ?? '0') : cycle.myEstimatedAmountCents;
  return <div className="ds-stack my-commission-cycles" aria-label="Meu rateio de assinaturas">
    <SectionCard title="Rateio de assinaturas" description={cycle.status === 'CLOSED' ? 'Valor final do ciclo fechado.' : 'Estimativa atual; o valor pode mudar até o fechamento conforme novos atendimentos e pagamentos de assinaturas.'}>
      <div className="commission-cycle-period"><strong>{period(cycle.periodStart, cycle.periodEnd, timezone)}</strong><StatusBadge active={cycle.status === 'CLOSED'}>{statusLabel(cycle.status, cycle.readyToClose)}</StatusBadge></div>
      {cycle.myPoints === 0 ? <EmptyState icon={<IconCoin size={22} aria-hidden="true" />} title="Você ainda não possui atendimentos elegíveis neste ciclo." description="Seus pontos aparecerão conforme houver atendimentos elegíveis." /> : cycle.poolCents === '0' ? <InlineAlert tone="info" title="Ainda não há valor disponível para rateio.">Você possui pontos neste ciclo, mas o pool ainda está zerado.</InlineAlert> : null}
      <StatGrid><StatCard label="Meus pontos" value={String(cycle.myPoints)} /><StatCard label="Minha participação" value={`${(cycle.myShareBps / 100).toFixed(2).replace('.', ',')}%`} /><StatCard label={cycle.status === 'CLOSED' ? 'Valor final' : 'Valor estimado'} value={money(amount)} tone="success" /></StatGrid>
      {cycle.status === 'CLOSED' && payouts.data && <><StatGrid><StatCard label="Valor apurado" value={money(payouts.data.dueCents)} /><StatCard label="Valor pago" value={money(payouts.data.paidCents)} /><StatCard label="Saldo a receber" value={money(payouts.data.outstandingCents)} /><StatCard label="Status" value={payouts.data.paymentStatus === 'PAID' ? 'Pago' : payouts.data.paymentStatus === 'PARTIALLY_PAID' ? 'Pago parcialmente' : 'Pendente'} /></StatGrid><SectionCard title="Histórico de pagamentos"><div className="ds-table-scroll"><table className="ds-table"><thead><tr><th>Data</th><th>Valor</th><th>Método</th><th>Status</th></tr></thead><tbody>{payouts.data.payouts.map((payout) => <tr key={payout.publicId}><td>{date(payout.paidAt, timezone)}</td><td>{money(payout.amountCents)}</td><td>{payout.method}</td><td>{payout.status === 'ACTIVE' ? 'Ativo' : 'Cancelado'}</td></tr>)}</tbody></table></div></SectionCard></>}
      {cycle.status === 'OPEN' && cycle.readyToClose ? <InlineAlert tone="info" title="Aguardando fechamento">A estimativa continua disponível até o fechamento do ciclo.</InlineAlert> : null}
    </SectionCard>
    <SectionCard title="Histórico de ciclos" description="Somente seus ciclos fechados, do mais recente para o mais antigo.">
      {history.isPending ? <ListSkeleton rows={3} /> : history.error instanceof Error ? <InlineAlert tone="danger" title="Não foi possível carregar o histórico">Verifique sua conexão e tente novamente.</InlineAlert> : (history.data?.items.filter((item) => item.status === 'CLOSED').length ?? 0) === 0 ? <EmptyState icon={<IconCoin size={22} aria-hidden="true" />} title="Nenhum ciclo fechado ainda." description="Seu histórico aparecerá após o primeiro fechamento." /> : <div className="ds-table-scroll"><table className="ds-table"><thead><tr><th>Período</th><th>Meus pontos</th><th>Participação</th><th>Valor final</th><th>Fechado em</th></tr></thead><tbody>{history.data?.items.filter((item) => item.status === 'CLOSED').map((item) => <tr key={item.publicId}><td data-label="Período">{period(item.periodStart, item.periodEnd, timezone)}</td><td data-label="Meus pontos">{item.myPoints}</td><td data-label="Participação">{(item.myShareBps / 100).toFixed(2).replace('.', ',')}%</td><td data-label="Valor final"><strong>{money(item.myFinalAmountCents ?? '0')}</strong></td><td data-label="Fechado em">{date(item.closedAt, timezone)}</td></tr>)}</tbody></table></div>}
    </SectionCard>
  </div>;
}
