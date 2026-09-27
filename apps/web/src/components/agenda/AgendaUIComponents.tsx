import { ReactNode } from 'react';
import { IconSearch, IconFilter, IconChevronDown } from '@tabler/icons-react';

/* ============================================
   AGENDA HEADER (Período + Filtros)
   ============================================ */

interface AgendaHeaderProps {
  period: 'day' | 'week' | 'month';
  onPeriodChange: (period: 'day' | 'week' | 'month') => void;
  onSearch: (search: string) => void;
  onFilterToggle?: () => void;
  children?: ReactNode;
}

export function AgendaHeader({
  period,
  onPeriodChange,
  onSearch,
  onFilterToggle,
  children,
}: AgendaHeaderProps) {
  return (
    <div className="agenda-header">
      <div className="agenda-header-left">
        <div className="period-selector">
          {(['day', 'week', 'month'] as const).map((p) => (
            <button
              key={p}
              className={`period-btn ${period === p ? 'active' : ''}`}
              onClick={() => onPeriodChange(p)}
            >
              {p === 'day' ? 'Dia' : p === 'week' ? 'Semana' : 'Mês'}
            </button>
          ))}
        </div>
      </div>

      <div className="agenda-header-right">
        <div className="agenda-search">
          <IconSearch size={18} />
          <input
            type="text"
            placeholder="Buscar agendamentos..."
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>

        {onFilterToggle && (
          <button className="filter-btn" onClick={onFilterToggle} aria-label="Filtros">
            <IconFilter size={18} />
            <span>Filtros</span>
          </button>
        )}
      </div>

      {children && <div className="agenda-header-extra">{children}</div>}
    </div>
  );
}

/* ============================================
   APPOINTMENT ROW (Lista / Tabela)
   ============================================ */

interface AppointmentRowProps {
  id: string;
  time: string;
  customer: string;
  service: string;
  professional: string;
  status: ReactNode;
  payment?: ReactNode;
  actions?: ReactNode;
  onClick?: () => void;
}

export function AppointmentRow({
  id,
  time,
  customer,
  service,
  professional,
  status,
  payment,
  actions,
  onClick,
}: AppointmentRowProps) {
  return (
    <div className="appointment-row" onClick={onClick}>
      <div className="appointment-col appointment-time">{time}</div>
      <div className="appointment-col appointment-customer">
        <div className="appointment-name">{customer}</div>
      </div>
      <div className="appointment-col appointment-service">{service}</div>
      <div className="appointment-col appointment-professional">{professional}</div>
      <div className="appointment-col appointment-status">{status}</div>
      {payment && <div className="appointment-col appointment-payment">{payment}</div>}
      {actions && <div className="appointment-col appointment-actions">{actions}</div>}
    </div>
  );
}

/* ============================================
   APPOINTMENT CARD (Mobile)
   ============================================ */

interface AppointmentCardProps {
  time: string;
  customer: string;
  service: string;
  professional: string;
  status: ReactNode;
  payment?: ReactNode;
  actions?: ReactNode;
  onClick?: () => void;
}

export function AppointmentCard({
  time,
  customer,
  service,
  professional,
  status,
  payment,
  actions,
  onClick,
}: AppointmentCardProps) {
  return (
    <div className="appointment-card" onClick={onClick}>
      <div className="appointment-card-header">
        <div>
          <p className="appointment-card-time">{time}</p>
          <h3 className="appointment-card-customer">{customer}</h3>
        </div>
        {status}
      </div>

      <div className="appointment-card-body">
        <div className="appointment-card-row">
          <span className="label">Serviço</span>
          <span className="value">{service}</span>
        </div>
        <div className="appointment-card-row">
          <span className="label">Profissional</span>
          <span className="value">{professional}</span>
        </div>
        {payment && (
          <div className="appointment-card-row">
            <span className="label">Pagamento</span>
            <span className="value">{payment}</span>
          </div>
        )}
      </div>

      {actions && <div className="appointment-card-actions">{actions}</div>}
    </div>
  );
}

/* ============================================
   FILTER PANEL
   ============================================ */

interface FilterPanelProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function FilterPanel({ isOpen, onClose, children }: FilterPanelProps) {
  if (!isOpen) return null;

  return (
    <>
      <div className="filter-overlay" onClick={onClose} />
      <div className="filter-panel">
        <div className="filter-panel-header">
          <h3>Filtros</h3>
          <button className="filter-close" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>
        <div className="filter-panel-content">{children}</div>
      </div>
    </>
  );
}

/* ============================================
   STATUS MENU (Context Menu)
   ============================================ */

interface StatusMenuProps {
  isOpen: boolean;
  children: ReactNode;
}

export function StatusMenu({ isOpen, children }: StatusMenuProps) {
  if (!isOpen) return null;

  return (
    <ul className="status-menu" role="menu">
      {children}
    </ul>
  );
}

export function StatusMenuItem({
  children,
  isDanger = false,
  onClick,
}: {
  children: ReactNode;
  isDanger?: boolean;
  onClick?: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        role="menuitem"
        className={isDanger ? 'is-danger' : ''}
        onClick={onClick}
      >
        {children}
      </button>
    </li>
  );
}
