type Props = { search: string; status: string; planPublicId: string; tenantPublicId: string; orderBy: string; direction: 'asc' | 'desc'; plans: Array<{ publicId: string; name: string }>; tenants: Array<{ publicId: string; displayName: string }>; onChange: (key: string, value: string) => void };

export function SubscriptionFilters({ search, status, planPublicId, tenantPublicId, orderBy, direction, plans, tenants, onChange }: Props) {
  return <div className="platform-subscription-filters">
    <label className="platform-subscription-filters__search">Buscar estabelecimento<input value={search} placeholder="Nome do estabelecimento" onChange={(event) => onChange('search', event.target.value)} /></label>
    <label>Estabelecimento<select value={tenantPublicId} onChange={(event) => onChange('tenantPublicId', event.target.value)}><option value="">Todos</option>{tenants.map((tenant) => <option key={tenant.publicId} value={tenant.publicId}>{tenant.displayName}</option>)}</select></label>
    <label>Status<select value={status} onChange={(event) => onChange('status', event.target.value)}><option value="">Todos</option><option value="ACTIVE">Ativo</option><option value="TRIALING">Em trial</option><option value="SUSPENDED">Suspenso</option><option value="CANCELED">Cancelado</option></select></label>
    <label>Plano<select value={planPublicId} onChange={(event) => onChange('planPublicId', event.target.value)}><option value="">Todos</option>{plans.map((plan) => <option key={plan.publicId} value={plan.publicId}>{plan.name}</option>)}</select></label>
    <label>Ordenar por<select value={orderBy} onChange={(event) => onChange('orderBy', event.target.value)}><option value="createdAt">Criação</option><option value="currentPeriodEndsAt">Fim do período</option><option value="trialEndsAt">Fim do trial</option></select></label>
    <label>Direção<select value={direction} onChange={(event) => onChange('direction', event.target.value)}><option value="desc">Mais recentes</option><option value="asc">Mais antigas</option></select></label>
  </div>;
}
