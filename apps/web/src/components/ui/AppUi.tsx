import { type PropsWithChildren, type ReactNode } from 'react';

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
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="ds-empty-state" role="status">
      <span aria-hidden="true">◇</span>
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function StatusBadge({ active, children }: PropsWithChildren<{ active: boolean }>) {
  return (
    <span className={`ds-badge ${active ? 'ds-badge--success' : 'ds-badge--muted'}`}>
      {children}
    </span>
  );
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
