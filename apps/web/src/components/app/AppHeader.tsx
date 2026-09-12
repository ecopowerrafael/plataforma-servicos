import { IconMenu2, IconLogout, IconChevronDown } from '@tabler/icons-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  tenantName?: string;
  onMenuClick?: () => void;
  onLogout?: () => void;
  onTenantSelect?: () => void;
  showMobileMenu?: boolean;
}

export function AppHeader({
  title,
  subtitle,
  tenantName,
  onMenuClick,
  onLogout,
  onTenantSelect,
  showMobileMenu = false,
}: AppHeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <header className="app-header">
      <div className="app-header-left">
        {showMobileMenu && (
          <button
            className="app-header-menu-btn"
            onClick={onMenuClick}
            aria-label="Abrir menu"
          >
            <IconMenu2 size={20} />
          </button>
        )}
        <div className="app-header-title">
          {subtitle && <p className="app-header-eyebrow">{subtitle}</p>}
          <h1>{title}</h1>
        </div>
      </div>

      <div className="app-header-right">
        {tenantName && (
          <button
            className="app-header-tenant"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            aria-expanded={dropdownOpen}
          >
            <span>{tenantName}</span>
            <IconChevronDown size={16} />
          </button>
        )}

        {dropdownOpen && onTenantSelect && (
          <div className="app-header-dropdown">
            <button onClick={onTenantSelect} className="dropdown-item">
              Trocar estabelecimento
            </button>
          </div>
        )}

        <button
          className="app-header-logout"
          onClick={onLogout}
          aria-label="Sair da conta"
          title="Sair"
        >
          <IconLogout size={18} />
        </button>
      </div>
    </header>
  );
}
