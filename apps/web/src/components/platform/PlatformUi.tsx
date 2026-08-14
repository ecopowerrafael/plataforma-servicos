import { type ReactNode } from 'react';

const statusMap: Record<string, { label: string; tone: string }> = {
  ACTIVE: { label: 'Ativo', tone: 'success' }, TRIALING: { label: 'Em teste', tone: 'info' },
  PAST_DUE: { label: 'Pagamento pendente', tone: 'warning' }, SUSPENDED: { label: 'Suspenso', tone: 'danger' },
  INACTIVE: { label: 'Inativo', tone: 'neutral' }, PENDING: { label: 'Pendente', tone: 'warning' },
  CANCELED: { label: 'Cancelado', tone: 'neutral' }, EXPIRED: { label: 'Expirado', tone: 'neutral' },
};
const cycleMap: Record<string, string> = { MONTHLY: 'Mensal', QUARTERLY: 'Trimestral', SEMIANNUAL: 'Semestral', ANNUAL: 'Anual', CUSTOM: 'Personalizado' };
export const formatStatus = (value: string) => statusMap[value]?.label ?? value;
export const formatCycle = (value: string) => cycleMap[value] ?? value;
export const formatMoney = (cents: string, currency = 'BRL') => new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(Number(cents) / 100);
export const formatDate = (value: string, withTime = false) => new Intl.DateTimeFormat('pt-BR', withTime ? { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' } : { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value));

export function StatusBadge({ value }: { value: string }) {
  const status = statusMap[value] ?? { label: value, tone: 'neutral' };
  return <span className={`platform-badge platform-badge--${status.tone}`}>{status.label}</span>;
}
export function PageHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <header className="platform-page-header"><div><h2>{title}</h2><p>{description}</p></div>{action}</header>;
}
export function MetricCard({ label, value, hint, loading }: { label: string; value?: string | undefined; hint?: string | undefined; loading?: boolean | undefined }) {
  return <article className="platform-metric"><span>{label}</span>{loading ? <i className="platform-skeleton" /> : <strong>{value}</strong>}{hint ? <small>{hint}</small> : null}</article>;
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="platform-state platform-state--error" role="alert"><p>{message}</p>{retry ? <button type="button" onClick={retry}>Tentar novamente</button> : null}</div>;
}
export function Pagination({ page, totalPages, total, limit, onPage }: { page: number; totalPages: number; total: number; limit: number; onPage: (page: number) => void }) {
  const first = total === 0 ? 0 : (page - 1) * limit + 1; const last = Math.min(page * limit, total);
  return <nav className="platform-pagination" aria-label="Paginacao"><span>{`Mostrando ${String(first)}-${String(last)} de ${String(total)}`}</span><div><button aria-label="Pagina anterior" disabled={page <= 1} onClick={() => { onPage(page - 1); }} type="button">‹</button><strong>{page}</strong><span>de {Math.max(totalPages, 1)}</span><button aria-label="Proxima pagina" disabled={page >= totalPages} onClick={() => { onPage(page + 1); }} type="button">›</button></div></nav>;
}
