import {
  IconAdjustments,
  IconBuildingStore,
  IconChartBar,
  IconFileAnalytics,
  IconFolder,
  IconHome,
  IconMapPin,
  IconSearch,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';

export type DirectoryTab =
  'overview' | 'businesses' | 'categories' | 'imports' | 'seo' | 'metrics' | 'geo' | 'settings';

const tabs: Array<{
  id: DirectoryTab;
  label: string;
  icon: typeof IconHome;
}> = [
  { id: 'overview', label: 'Visão geral', icon: IconHome },
  { id: 'businesses', label: 'Estabelecimentos', icon: IconBuildingStore },
  { id: 'categories', label: 'Categorias', icon: IconFolder },
  { id: 'imports', label: 'Importações', icon: IconFileAnalytics },
  { id: 'seo', label: 'SEO', icon: IconSearch },
  { id: 'metrics', label: 'Métricas', icon: IconChartBar },
  { id: 'geo', label: 'Geolocalização', icon: IconMapPin },
  { id: 'settings', label: 'Configurações', icon: IconAdjustments },
];

export function DirectoryTabs({
  active,
  onChange,
}: {
  active: DirectoryTab;
  onChange: (tab: DirectoryTab) => void;
}) {
  return (
    <nav className="directory-tabs" aria-label="Seções do diretório">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          className={active === id ? 'is-active' : undefined}
          onClick={() => onChange(id)}
        >
          <Icon size={18} stroke={1.8} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

export function DirectoryStatCard({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone: 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'gold';
  icon: ReactNode;
}) {
  return (
    <article className={`directory-stat directory-stat--${tone}`}>
      <span className="directory-stat__icon">{icon}</span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {hint ? <small>{hint}</small> : null}
      </div>
    </article>
  );
}

export function DirectorySectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="directory-section-heading">
      <div>
        {eyebrow ? <span>{eyebrow}</span> : null}
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action ? <div className="directory-section-heading__action">{action}</div> : null}
    </header>
  );
}

export function DirectoryPagination({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (page: number) => void;
}) {
  return (
    <footer className="directory-pagination">
      <span>{total.toLocaleString('pt-BR')} registros</span>
      <div>
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Anterior
        </button>
        <strong>
          {page} / {Math.max(totalPages, 1)}
        </strong>
        <button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Próxima
        </button>
      </div>
    </footer>
  );
}

export function DirectoryBadge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info';
}) {
  return <span className={`directory-badge directory-badge--${tone}`}>{children}</span>;
}
