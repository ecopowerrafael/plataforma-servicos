import { type ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';

export type PlatformSection =
  'dashboard' | 'tenants' | 'plans' | 'subscriptions' | 'finance' | 'commercial-policy' | 'audit' | 'directory' | 'settings';
const items: { id: PlatformSection; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Visao geral', icon: '⌂' },
  { id: 'tenants', label: 'Estabelecimentos', icon: '▦' },
  { id: 'plans', label: 'Planos', icon: '◇' },
  { id: 'subscriptions', label: 'Assinaturas', icon: '≡' },
  { id: 'finance', label: 'Financeiro', icon: '$' },
  { id: 'commercial-policy', label: 'Politica comercial', icon: '⚙' },
  { id: 'audit', label: 'Auditoria', icon: '◷' },
  { id: 'directory', label: 'Diretório', icon: '⌕' },
  { id: 'settings', label: 'Configuracoes', icon: '🔧' },
];
export function PlatformShell({
  email,
  section,
  onSection,
  children,
}: {
  email: string;
  section: PlatformSection;
  onSection: (section: PlatformSection) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <main className="app-shell platform-app">
      <aside className={open ? 'platform-sidebar is-open' : 'platform-sidebar'}>
        <div className="platform-brand">
          <strong>Agendei</strong>
          <span>Platform</span>
        </div>
        <nav aria-label="Modulos globais">
          {items.map((item) => (
            <button
              className={section === item.id ? 'nav-active' : ''}
              key={item.id}
              onClick={() => {
                onSection(item.id);
                setOpen(false);
              }}
              type="button"
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <div className="platform-main">
        <header className="platform-topbar">
          <button
            className="platform-menu-button"
            aria-label="Abrir menu"
            onClick={() => {
              setOpen(!open);
            }}
            type="button"
          >
            ☰
          </button>
          <div>
            <strong>Administracao global</strong>
            <span>{email}</span>
          </div>
          <Link className="secondary-button" to="/">
            Area do estabelecimento
          </Link>
        </header>
        <div className="platform-page">{children}</div>
      </div>
      {open ? (
        <button
          className="platform-backdrop"
          aria-label="Fechar menu"
          onClick={() => {
            setOpen(false);
          }}
          type="button"
        />
      ) : null}
    </main>
  );
}
