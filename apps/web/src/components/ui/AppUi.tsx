import { type PropsWithChildren, type ReactNode } from 'react';

export type BadgeTone = 'success' | 'muted' | 'warning' | 'danger' | 'info';

/** Cartão de seção: título, descrição e ação, com o corpo em fluxo vertical. */
export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
}: PropsWithChildren<{
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}>) {
  return (
    <section
      className={`app-card ds-section-card${className === undefined ? '' : ` ${className}`}`}
    >
      <header className="ds-section-card-header">
        <div>
          <h3>{title}</h3>
          {description === undefined ? null : <p>{description}</p>}
        </div>
        {actions === undefined ? null : <div className="ds-section-card-actions">{actions}</div>}
      </header>
      <div className="ds-section-card-body">{children}</div>
    </section>
  );
}

/** Indicador numérico curto para as faixas de resumo. */
export function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: BadgeTone;
}) {
  return (
    <article className={`ds-stat-card${tone === undefined ? '' : ` ds-stat-card--${tone}`}`}>
      <p className="ds-eyebrow">{label}</p>
      <strong>{value}</strong>
      {hint === undefined ? null : <small>{hint}</small>}
    </article>
  );
}

export function StatGrid({ children }: PropsWithChildren) {
  return <div className="ds-stat-grid">{children}</div>;
}

/** Bloco de campos de formulário com rótulo próprio, em grade responsiva. */
export function FormSection({
  legend,
  hint,
  columns = 2,
  children,
}: PropsWithChildren<{ legend?: string; hint?: string; columns?: 1 | 2 | 3 }>) {
  return (
    <fieldset className={`ds-form-section ds-form-section--${String(columns)}`}>
      {legend === undefined ? null : <legend>{legend}</legend>}
      {hint === undefined ? null : <p className="ds-form-hint">{hint}</p>}
      {children}
    </fieldset>
  );
}

/** Tabela que vira lista de cartões no mobile (ver `ds-data-table` no CSS). */
/** Controle booleano compartilhado entre o painel do tenant e a plataforma. */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className="ds-switch-row">
      <span>
        <strong>{label}</strong>
        {description === undefined ? null : <small>{description}</small>}
      </span>
      <input
        aria-checked={checked}
        aria-label={label}
        checked={checked}
        className="ds-switch"
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
        role="switch"
        type="checkbox"
      />
    </label>
  );
}

export function DataTable({
  headers,
  children,
  label,
}: PropsWithChildren<{ headers: string[]; label: string }>) {
  return (
    <div className="ds-table-scroll">
      <table className="platform-table ds-data-table" aria-label={label}>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** Barra de consumo de um limite do plano. */
export function UsageProgress({
  used,
  total,
}: {
  used: number;
  /** `null` representa limite ilimitado — a barra some e sobra só o texto. */
  total: number | null;
}) {
  if (total === null || total <= 0) return null;
  const ratio = Math.min(1, used / total);
  const tone = ratio >= 1 ? 'danger' : ratio >= 0.8 ? 'warning' : 'ok';
  return (
    <div
      className={`ds-usage ds-usage--${tone}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={Math.min(used, total)}
    >
      <span style={{ width: `${String(Math.round(ratio * 100))}%` }} />
    </div>
  );
}

/** Aviso curto no fluxo da página (erro recuperável, atenção, informação). */
export function InlineAlert({
  tone = 'info',
  title,
  children,
  action,
}: PropsWithChildren<{
  tone?: 'info' | 'warning' | 'danger';
  title?: string;
  action?: ReactNode;
}>) {
  return (
    <div
      className={`ds-inline-alert ds-inline-alert--${tone}`}
      role={tone === 'info' ? 'status' : 'alert'}
    >
      <div>
        {title === undefined ? null : <strong>{title}</strong>}
        <p>{children}</p>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="ds-page-header">
      <div>
        {eyebrow === undefined ? null : <p className="ds-eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
        {description === undefined ? null : <p>{description}</p>}
      </div>
      {actions === undefined ? null : <div className="ds-page-actions">{actions}</div>}
    </header>
  );
}

export function PageToolbar({ children }: PropsWithChildren) {
  return (
    <details className="ds-toolbar-disclosure">
      <summary>Filtros</summary>
      <div className="ds-toolbar">{children}</div>
    </details>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="ds-empty-state" role="status">
      <span aria-hidden="true">{icon ?? '◇'}</span>
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function StatusBadge({
  active,
  tone,
  children,
}: PropsWithChildren<{ active?: boolean; tone?: BadgeTone }>) {
  const resolved = tone ?? (active === true ? 'success' : 'muted');
  return <span className={`ds-badge ds-badge--${resolved}`}>{children}</span>;
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="ds-list-skeleton" aria-label="Carregando conteúdo" aria-busy="true">
      {Array.from({ length: rows }, (_, index) => (
        <i key={index} />
      ))}
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  onPrevious,
  onNext,
}: {
  page: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <nav className="ds-pagination" aria-label="Paginação">
      <button
        className="button button--secondary button--sm"
        disabled={page <= 1}
        type="button"
        onClick={onPrevious}
      >
        Anterior
      </button>
      <span>{`${String(page)} de ${String(totalPages)}`}</span>
      <button
        className="button button--secondary button--sm"
        disabled={page >= totalPages}
        type="button"
        onClick={onNext}
      >
        Próxima
      </button>
    </nav>
  );
}
