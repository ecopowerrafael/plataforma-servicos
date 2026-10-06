import { CommissionCycleListResponseSchema, CommissionCycleSchema, TenantSettingsResponseSchema, type CommissionCycle } from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { httpClient } from '../../lib/http.js';
import { ConfirmationDialog } from '../ConfirmationDialog.js';
import { DataTable, InlineAlert, ListSkeleton, PageHeader, SectionCard, StatCard, StatGrid } from '../ui/AppUi.js';

export const formatCommissionMoney = (cents: string) => {
  const value = BigInt(cents);
  const units = value / 100n;
  const remainder = (value % 100n).toString().padStart(2, '0');
  return `R$ ${new Intl.NumberFormat('pt-BR').format(units)},${remainder}`;
};
export const formatCommissionPercent = (bps: number) => `${(bps / 100).toFixed(2).replace('.', ',')}%`;
export const commissionParticipation = (points: number, totalPoints: number) => totalPoints === 0 ? 0 : (points / totalPoints) * 100;
const money = formatCommissionMoney;
const percent = formatCommissionPercent;
const dateTime = (value: string, timezone: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: timezone }).format(new Date(value));
const dateOnly = (value: string, timezone: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: timezone }).format(new Date(value));

type Props = { tenantPublicId: string; timezone: string; canManage: boolean; canUpdate: boolean };

export function CommissionCycleModule({ tenantPublicId, timezone, canManage, canUpdate }: Props) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<CommissionCycle | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const settings = useQuery({ queryKey: ['tenant', tenantPublicId, 'settings'], queryFn: () => httpClient.request('/tenant/settings', { schema: TenantSettingsResponseSchema, tenantPublicId }), retry: false });
  const current = useQuery({ queryKey: ['tenant', tenantPublicId, 'commission-cycle', 'current'], queryFn: () => httpClient.request('/tenant/commission-cycles/current', { schema: CommissionCycleSchema, tenantPublicId }), retry: false });
  const history = useQuery({ queryKey: ['tenant', tenantPublicId, 'commission-cycles'], queryFn: () => httpClient.request('/tenant/commission-cycles', { schema: CommissionCycleListResponseSchema, tenantPublicId }), retry: false });
  const [teamPercent, setTeamPercent] = useState('');
  const [closingDay, setClosingDay] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');

  useEffect(() => {
    const value = settings.data?.settings;
    if (value === undefined) return;
    setTeamPercent(value.commissionTeamPercentBps == null ? '' : String(value.commissionTeamPercentBps / 100));
    setClosingDay(value.commissionClosingDay == null ? '' : String(value.commissionClosingDay));
    setEffectiveFrom(value.commissionEffectiveFrom == null ? '' : new Date(value.commissionEffectiveFrom).toISOString().slice(0, 10));
  }, [settings.data]);

  const saveSettings = useMutation({
    mutationFn: () => httpClient.request('/tenant/settings', { method: 'PATCH', tenantPublicId, body: { commissionTeamPercentBps: teamPercent === '' ? null : Math.round(Number(teamPercent) * 100), commissionClosingDay: closingDay === '' ? null : Number(closingDay), commissionEffectiveFrom: effectiveFrom === '' ? null : new Date(`${effectiveFrom}T00:00:00.000Z`).toISOString() }, schema: TenantSettingsResponseSchema }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId] }); },
  });
  const close = useMutation({
    mutationFn: (publicId: string) => httpClient.request(`/tenant/commission-cycles/${publicId}/close`, { method: 'POST', tenantPublicId, schema: CommissionCycleSchema }),
    onSuccess: async (cycle) => { setConfirmClose(false); setSelected(cycle); await queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'commission-cycle'] }); await queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'commission-cycles'] }); },
    onError: async (error) => {
      if ((error as { status?: number }).status === 409) {
        await queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'commission-cycle'] });
        await queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'commission-cycles'] });
      }
    },
  });
  const cycle = current.data;
  const isConfigured = settings.data?.settings.commissionTeamPercentBps !== null && settings.data?.settings.commissionClosingDay !== null && settings.data?.settings.commissionEffectiveFrom !== null;
  const allocationRows = useMemo(() => cycle?.allocations ?? [], [cycle]);
  const statusLabel = cycle?.status === 'CLOSED' ? 'Fechado' : cycle?.readyToClose ? 'Pronto para fechar' : 'Em andamento';

  if (current.error && (current.error as { status?: number }).status === 409 && !isConfigured) {
    return <div className="ds-stack commission-cycle-page"><PageHeader eyebrow="Financeiro" title="Rateio de Assinaturas" description="Distribua a receita de assinaturas conforme os atendimentos elegíveis." /><SectionCard title="Configure o rateio para começar"><p>Defina o percentual da equipe, o dia de fechamento e a data de início.</p><CommissionSettings {...{ teamPercent, setTeamPercent, closingDay, setClosingDay, effectiveFrom, setEffectiveFrom, canUpdate, saving: saveSettings.isPending, onSave: () => saveSettings.mutate() }} /></SectionCard></div>;
  }
  if (current.isPending || settings.isPending) return <div className="ds-stack commission-cycle-page"><PageHeader eyebrow="Financeiro" title="Rateio de Assinaturas" description="Distribua a receita de assinaturas conforme os atendimentos elegíveis." /><ListSkeleton rows={5} /></div>;
  if (current.error || settings.error || cycle === undefined) return <div className="ds-stack commission-cycle-page"><PageHeader eyebrow="Financeiro" title="Rateio de Assinaturas" description="Distribua a receita de assinaturas conforme os atendimentos elegíveis." /><InlineAlert tone="danger" title="Não foi possível carregar o rateio.">Tente novamente ou verifique sua permissão de leitura.</InlineAlert></div>;

  return <div className="ds-stack commission-cycle-page">
    <PageHeader eyebrow="Financeiro · Assinaturas" title="Rateio de Assinaturas" description="Acompanhe a receita de assinaturas e o valor destinado à equipe." actions={canManage && cycle.status === 'OPEN' && cycle.readyToClose ? <button className="primary-button" type="button" onClick={() => setConfirmClose(true)} disabled={close.isPending}>Fechar ciclo</button> : undefined} />
    <div className="commission-cycle-period"><strong>{dateOnly(cycle.periodStart, timezone)} — {dateOnly(cycle.periodEnd, timezone)}</strong><span className={`ds-badge ds-badge--${cycle.status === 'CLOSED' ? 'muted' : cycle.readyToClose ? 'warning' : 'success'}`}>{statusLabel}</span></div>
    {cycle.status === 'OPEN' && <InlineAlert>Os valores exibidos são estimativas até o fechamento. Alterações no percentual e no dia de fechamento serão aplicadas ao próximo ciclo.</InlineAlert>}
    {close.isError && <InlineAlert tone="danger" title="Não foi possível fechar o ciclo.">O ciclo pode ter sido fechado por outra sessão. Recarregue os dados antes de tentar novamente.</InlineAlert>}
    {cycle.effectiveFrom === null && <InlineAlert tone="warning">Configure a data de início: o rateio considera apenas pagamentos e atendimentos a partir dessa data.</InlineAlert>}
    {cycle.poolCents !== '0' && cycle.totalPoints === 0 && <InlineAlert tone="warning">Há receita no ciclo, mas nenhum atendimento elegível foi concluído.</InlineAlert>}
    {cycle.poolCents === '0' && cycle.totalPoints > 0 && <InlineAlert tone="warning">Há atendimentos pontuados, mas ainda não há receita elegível de assinaturas neste ciclo.</InlineAlert>}
    <StatGrid><StatCard label="Receita de assinaturas" value={money(cycle.eligibleRevenueCents)} /><StatCard label="Percentual da equipe" value={percent(cycle.teamPercentBps)} /><StatCard label="Pool dos profissionais" value={money(cycle.poolCents)} /><StatCard label="Atendimentos pontuados" value={`${cycle.totalPoints} pontos`} /><StatCard label={cycle.status === 'CLOSED' ? 'Distribuído' : 'Estimativa'} value={money(cycle.distributedCents)} /></StatGrid>
    <SectionCard title="Rateio por profissional" description="Cada atendimento concluído incluído ou com desconto da assinatura vale 1 ponto."><DataTable label="Rateio por profissional" headers={['Profissional', 'Pontos', 'Participação', cycle.status === 'CLOSED' ? 'Valor final' : 'Estimativa']} >{allocationRows.map((allocation) => <tr key={allocation.professionalPublicId}><td>{allocation.professionalName}</td><td>{allocation.points}</td><td>{cycle.totalPoints === 0 ? '0%' : `${((allocation.points / cycle.totalPoints) * 100).toFixed(2).replace('.', ',')}%`}</td><td><strong>{money(allocation.amountCents)}</strong></td></tr>)}</DataTable>{allocationRows.length === 0 && <p className="ds-form-hint">Ainda não há profissionais com pontos neste ciclo.</p>}</SectionCard>
    <SectionCard title="Configuração do rateio" description="Percentual da receita recebida das assinaturas que será dividido entre os profissionais conforme os atendimentos elegíveis concluídos no ciclo."><CommissionSettings {...{ teamPercent, setTeamPercent, closingDay, setClosingDay, effectiveFrom, setEffectiveFrom, canUpdate, saving: saveSettings.isPending, onSave: () => saveSettings.mutate() }} /></SectionCard>
    <SectionCard title="Histórico de ciclos"><DataTable label="Histórico de ciclos" headers={['Período', 'Status', 'Receita', 'Pool', 'Pontos', 'Distribuído', 'Fechado em', 'Detalhe']}>{(history.data?.items ?? []).filter((item) => item.publicId !== cycle.publicId).map((item) => <tr key={item.publicId}><td>{dateOnly(item.periodStart, timezone)} — {dateOnly(item.periodEnd, timezone)}</td><td>{item.status === 'CLOSED' ? 'Fechado' : item.readyToClose ? 'Pronto para fechar' : 'Em andamento'}</td><td>{money(item.eligibleRevenueCents)}</td><td>{money(item.poolCents)}</td><td>{item.totalPoints}</td><td>{money(item.distributedCents)}</td><td>{item.closedAt ? dateTime(item.closedAt, timezone) : '—'}</td><td><button className="secondary-button button--sm" type="button" onClick={() => setSelected(item)}>Ver detalhe</button></td></tr>)}</DataTable></SectionCard>
    {selected && <SectionCard title="Detalhe do ciclo" description={`Período ${dateOnly(selected.periodStart, timezone)} — ${dateOnly(selected.periodEnd, timezone)} · ${selected.status === 'CLOSED' ? 'Valores finais persistidos' : 'Estimativa'}`} actions={<button className="secondary-button button--sm" type="button" onClick={() => setSelected(null)}>Fechar detalhe</button>}><DataTable label="Alocações do ciclo selecionado" headers={['Profissional', 'Pontos', 'Participação', 'Valor']} >{selected.allocations.map((allocation) => <tr key={allocation.professionalPublicId}><td>{allocation.professionalName}</td><td>{allocation.points}</td><td>{selected.totalPoints === 0 ? '0%' : `${((allocation.points / selected.totalPoints) * 100).toFixed(2).replace('.', ',')}%`}</td><td>{money(allocation.amountCents)}</td></tr>)}</DataTable></SectionCard>}
    {confirmClose && <ConfirmationDialog request={{ title: 'Fechar ciclo?', description: `Após o fechamento, os valores deste ciclo serão congelados e não serão recalculados automaticamente. Período: ${dateOnly(cycle.periodStart, timezone)} — ${dateOnly(cycle.periodEnd, timezone)} · Receita: ${money(cycle.eligibleRevenueCents)} · Pool: ${money(cycle.poolCents)} · Pontos: ${cycle.totalPoints} · Profissionais: ${cycle.allocations.length}`, confirmLabel: close.isPending ? 'Fechando…' : 'Confirmar fechamento', requiresReason: false, onConfirm: async () => { await close.mutateAsync(cycle.publicId); } }} onClose={() => setConfirmClose(false)} />}
  </div>;
}

function CommissionSettings({ teamPercent, setTeamPercent, closingDay, setClosingDay, effectiveFrom, setEffectiveFrom, canUpdate, saving, onSave }: { teamPercent: string; setTeamPercent: (v: string) => void; closingDay: string; setClosingDay: (v: string) => void; effectiveFrom: string; setEffectiveFrom: (v: string) => void; canUpdate: boolean; saving: boolean; onSave: () => void }) {
  return <form className="platform-form commission-settings-form" onSubmit={(event) => { event.preventDefault(); onSave(); }}><fieldset disabled={!canUpdate || saving}><label>Percentual destinado à equipe<input type="number" min="0" max="100" step="0.01" value={teamPercent} onChange={(event) => setTeamPercent(event.target.value)} placeholder="Ex.: 40" /></label><label>Dia de fechamento<input type="number" min="1" max="31" step="1" value={closingDay} onChange={(event) => setClosingDay(event.target.value)} placeholder="1 a 31" /></label><label>Data de início do rateio<input type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></label><p className="ds-form-hint">O rateio considera apenas pagamentos e atendimentos a partir desta data. Alterações serão aplicadas ao próximo ciclo.</p><button className="primary-button" type="submit">{saving ? 'Salvando…' : 'Salvar configuração'}</button></fieldset></form>;
}
