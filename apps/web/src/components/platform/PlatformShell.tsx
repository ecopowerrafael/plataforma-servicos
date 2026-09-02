import {
  IconBuildingStore,
  IconChevronRight,
  IconCompass,
  IconExternalLink,
  IconLayoutDashboard,
  IconMenu2,
  IconReceipt2,
  IconScale,
  IconScript,
  IconSend2,
  IconSettings,
  IconShieldCheck,
  IconSparkles,
  IconStack2,
  IconUserCheck,
  IconWallet,
  IconX,
} from '@tabler/icons-react';
import { type ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';

export type PlatformSection =
  | 'dashboard'
  | 'tenants'
  | 'plans'
  | 'subscriptions'
  | 'finance'
  | 'commercial-policy'
  | 'audit'
  | 'directory'
  | 'prospecting'
  | 'settings';

const items: { id: PlatformSection; label: string; icon: typeof IconLayoutDashboard }[] = [
  { id: 'dashboard', label: 'Visão geral', icon: IconLayoutDashboard },
  { id: 'tenants', label: 'Estabelecimentos', icon: IconBuildingStore },
  { id: 'plans', label: 'Planos', icon: IconStack2 },
  { id: 'subscriptions', label: 'Assinaturas', icon: IconReceipt2 },
  { id: 'finance', label: 'Financeiro', icon: IconWallet },
  { id: 'commercial-policy', label: 'Política comercial', icon: IconScale },
  { id: 'audit', label: 'Auditoria', icon: IconScript },
  { id: 'directory', label: 'Diretório', icon: IconCompass },
  { id: 'prospecting', label: 'Prospecção', icon: IconSend2 },
  { id: 'settings', label: 'Configurações', icon: IconSettings },
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

  const handleSelect = (id: PlatformSection) => {
    onSection(id);
    setOpen(false);
  };

  const sidebarContent = (
    <nav aria-label="Módulos globais" className="platform-nav">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = section === item.id;
        return (
          <button
            className={isActive ? 'platform-nav-item is-active' : 'platform-nav-item'}
            key={item.id}
            onClick={() => {
              handleSelect(item.id);
            }}
            type="button"
          >
            <span className="platform-nav-item-icon" aria-hidden="true">
              <Icon size={17} stroke={1.75} />
            </span>
            <span className="platform-nav-item-label">{item.label}</span>
            {isActive ? <IconChevronRight size={14} stroke={2} className="platform-nav-item-chevron" /> : null}
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="app-shell platform-app">
      <header className="platform-header">
        <div className="platform-header-inner">
          <div className="platform-header-left">
            <button
              className="platform-menu-button"
              aria-label={open ? 'Fechar menu' : 'Abrir menu'}
              onClick={() => {
                setOpen(!open);
              }}
              type="button"
            >
              {open ? <IconX size={20} stroke={1.75} /> : <IconMenu2 size={20} stroke={1.75} />}
            </button>

            <button
              className="platform-brand"
              type="button"
              onClick={() => {
                handleSelect('dashboard');
              }}
            >
              <span className="platform-brand-mark" aria-hidden="true">
                <span className="platform-brand-mark-inner">
                  <IconSparkles size={16} stroke={1.75} />
                </span>
              </span>
              <span className="platform-brand-text">
                <span className="platform-brand-name">AGENDEI</span>
                <span className="platform-brand-suffix">PLATFORM</span>
              </span>
            </button>

            <span className="platform-header-tag">
              <IconShieldCheck size={14} stroke={1.75} />
              <span>Administração global</span>
            </span>
          </div>

          <div className="platform-header-right">
            <div className="platform-admin-chip">
              <span className="platform-admin-avatar">
                {email.slice(0, 2).toUpperCase()}
              </span>
              <span className="platform-admin-meta">
                <strong>Administrador</strong>
                <small>{email}</small>
              </span>
            </div>

            <Link className="platform-establishment-link" to="/">
              <IconUserCheck size={14} stroke={1.75} />
              <span className="platform-establishment-link-label">Área do estabelecimento</span>
              <IconExternalLink size={12} stroke={1.75} />
            </Link>
          </div>
        </div>
      </header>

      <div className="platform-body">
        <aside className="platform-sidebar platform-sidebar--desktop">{sidebarContent}</aside>

        {open ? (
          <div className="platform-sidebar-overlay">
            <button
              className="platform-backdrop"
              aria-label="Fechar menu"
              onClick={() => {
                setOpen(false);
              }}
              type="button"
            />
            <aside className="platform-sidebar platform-sidebar--mobile">{sidebarContent}</aside>
          </div>
        ) : null}

        <div className="platform-main">
          <div className="platform-page">{children}</div>
        </div>
      </div>
    </div>
  );
}
