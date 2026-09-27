import { ReactNode } from 'react';
import { IconSearch, IconPlus, IconPhone, IconMail, IconCalendar } from '@tabler/icons-react';

/* ============================================
   CUSTOMER HEADER (Busca + Novo Cliente)
   ============================================ */

interface CustomerHeaderProps {
  onSearch: (search: string) => void;
  onNewClick?: () => void;
  children?: ReactNode;
}

export function CustomerHeader({ onSearch, onNewClick, children }: CustomerHeaderProps) {
  return (
    <div className="customer-header">
      <div className="customer-search">
        <IconSearch size={18} />
        <input
          type="text"
          placeholder="Buscar cliente por nome, email ou telefone..."
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      {onNewClick && (
        <button className="btn btn-primary" onClick={onNewClick}>
          <IconPlus size={18} />
          <span>Novo cliente</span>
        </button>
      )}

      {children && <div className="customer-header-extra">{children}</div>}
    </div>
  );
}

/* ============================================
   CUSTOMER ROW (Lista / Tabela)
   ============================================ */

interface CustomerRowProps {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  lastAppointment?: string;
  status?: ReactNode;
  actions?: ReactNode;
  onClick?: () => void;
}

export function CustomerRow({
  id,
  name,
  email,
  phone,
  lastAppointment,
  status,
  actions,
  onClick,
}: CustomerRowProps) {
  return (
    <div className="customer-row" onClick={onClick}>
      <div className="customer-col customer-name">
        <div className="customer-avatar">{name.charAt(0).toUpperCase()}</div>
        <div>
          <p className="customer-name-text">{name}</p>
          {email && <p className="customer-email">{email}</p>}
        </div>
      </div>

      {phone && (
        <div className="customer-col customer-phone">
          <IconPhone size={14} />
          <span>{phone}</span>
        </div>
      )}

      {lastAppointment && (
        <div className="customer-col customer-last-appt">
          <IconCalendar size={14} />
          <span>{lastAppointment}</span>
        </div>
      )}

      {status && <div className="customer-col customer-status">{status}</div>}

      {actions && <div className="customer-col customer-actions">{actions}</div>}
    </div>
  );
}

/* ============================================
   CUSTOMER CARD (Mobile)
   ============================================ */

interface CustomerCardProps {
  name: string;
  email?: string;
  phone?: string;
  lastAppointment?: string;
  status?: ReactNode;
  actions?: ReactNode;
  onClick?: () => void;
}

export function CustomerCard({
  name,
  email,
  phone,
  lastAppointment,
  status,
  actions,
  onClick,
}: CustomerCardProps) {
  return (
    <div className="customer-card" onClick={onClick}>
      <div className="customer-card-header">
        <div className="customer-card-avatar">{name.charAt(0).toUpperCase()}</div>
        <div className="customer-card-info">
          <h3>{name}</h3>
          {email && <p>{email}</p>}
        </div>
        {status}
      </div>

      <div className="customer-card-body">
        {phone && (
          <div className="customer-card-field">
            <IconPhone size={16} />
            <span>{phone}</span>
          </div>
        )}
        {lastAppointment && (
          <div className="customer-card-field">
            <IconCalendar size={16} />
            <span>{lastAppointment}</span>
          </div>
        )}
      </div>

      {actions && <div className="customer-card-actions">{actions}</div>}
    </div>
  );
}

/* ============================================
   CUSTOMER QUICK PANEL
   ============================================ */

interface CustomerQuickPanelProps {
  name: string;
  email?: string;
  phone?: string;
  appointments: number;
  nextAppointment?: string;
  actions?: ReactNode;
}

export function CustomerQuickPanel({
  name,
  email,
  phone,
  appointments,
  nextAppointment,
  actions,
}: CustomerQuickPanelProps) {
  return (
    <div className="customer-quick-panel">
      <div className="quick-panel-header">
        <div>
          <h3>{name}</h3>
          {email && (
            <p>
              <IconMail size={14} />
              {email}
            </p>
          )}
        </div>
      </div>

      <div className="quick-panel-stats">
        <div className="stat">
          <p className="stat-label">Agendamentos</p>
          <p className="stat-value">{appointments}</p>
        </div>
        {nextAppointment && (
          <div className="stat">
            <p className="stat-label">Próxima visita</p>
            <p className="stat-value">{nextAppointment}</p>
          </div>
        )}
      </div>

      {phone && <p className="quick-panel-phone">{phone}</p>}

      {actions && <div className="quick-panel-actions">{actions}</div>}
    </div>
  );
}
