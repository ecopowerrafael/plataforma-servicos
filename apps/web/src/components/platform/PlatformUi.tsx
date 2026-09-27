import { type ReactNode } from 'react';

import {
  InlineAlert,
  PageHeader as AppPageHeader,
  Pagination as AppPagination,
  StatCard,
  StatusBadge as AppStatusBadge,
  type BadgeTone,
} from '../ui/AppUi.js';

const statusMap: Record<string, { label: string; tone: string }> = {
  ACTIVE: { label: 'Ativo', tone: 'success' },
  TRIALING: { label: 'Em teste', tone: 'info' },
  PAST_DUE: { label: 'Pagamento pendente', tone: 'warning' },
  SUSPENDED: { label: 'Suspenso', tone: 'danger' },
  INACTIVE: { label: 'Inativo', tone: 'neutral' },
  PENDING: { label: 'Pendente', tone: 'warning' },
  CANCELED: { label: 'Cancelado', tone: 'neutral' },
  EXPIRED: { label: 'Expirado', tone: 'neutral' },
};
const campaignStatusMap: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: 'Rascunho', tone: 'neutral' },
  RUNNING: { label: 'Em execução', tone: 'success' },
  PAUSED: { label: 'Pausada', tone: 'warning' },
  COMPLETED: { label: 'Concluída', tone: 'muted' },
  CANCELED: { label: 'Cancelada', tone: 'danger' },
};
const cycleMap: Record<string, string> = {
  MONTHLY: 'Mensal',
  QUARTERLY: 'Trimestral',
  SEMIANNUAL: 'Semestral',
  ANNUAL: 'Anual',
  CUSTOM: 'Personalizado',
};
export const formatStatus = (value: string) => statusMap[value]?.label ?? value;
export const formatCycle = (value: string) => cycleMap[value] ?? value;
export const formatMoney = (cents: string, currency = 'BRL') =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(Number(cents) / 100);
export const formatDate = (value: string, withTime = false) =>
  new Intl.DateTimeFormat(
    'pt-BR',
    withTime
      ? { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }
      : { dateStyle: 'short', timeZone: 'America/Sao_Paulo' },
  ).format(new Date(value));

export function StatusBadge({ value, campaignStatus }: { value: string; campaignStatus?: boolean }) {
  const map = campaignStatus ? campaignStatusMap : statusMap;
  const status = map[value] ?? { label: value, tone: 'neutral' };
  const tone: BadgeTone = status.tone === 'neutral' ? 'muted' : (status.tone as BadgeTone);
  return <AppStatusBadge tone={tone}>{status.label}</AppStatusBadge>;
}
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return <AppPageHeader title={title} description={description} actions={action} />;
}
export function MetricCard({
  label,
  value,
  hint,
  loading,
}: {
  label: string;
  value?: string | undefined;
  hint?: string | undefined;
  loading?: boolean | undefined;
}) {
  return loading ? (
    <article className="ds-stat-card">
      <i className="platform-skeleton" />
    </article>
  ) : (
      <StatCard label={label} value={value ?? '—'} {...(hint === undefined ? {} : { hint })} />
  );
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <InlineAlert
      tone="danger"
      action={
        retry ? (
          <button className="button button--secondary" type="button" onClick={retry}>
            Tentar novamente
          </button>
        ) : undefined
      }
    >
      {message}
    </InlineAlert>
  );
}
export function Pagination({
  page,
  totalPages,
  total,
  limit,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="platform-pagination">
      <span>{`Mostrando ${String(total === 0 ? 0 : (page - 1) * limit + 1)}–${String(Math.min(page * limit, total))} de ${String(total)}`}</span>
      <AppPagination
        page={page}
        totalPages={Math.max(totalPages, 1)}
        onPrevious={() => { onPage(page - 1); }}
        onNext={() => { onPage(page + 1); }}
      />
    </div>
  );
}
