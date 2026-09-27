import { ReactNode } from 'react';
import { IconSearch, IconPlus, IconEye, IconEdit, IconTrash } from '@tabler/icons-react';

/* ============================================
   TREATMENT PLANS HEADER
   ============================================ */

interface TreatmentPlansHeaderProps {
  onSearch: (search: string) => void;
  onNewClick?: () => void;
  stats?: ReactNode;
}

export function TreatmentPlansHeader({
  onSearch,
  onNewClick,
  stats,
}: TreatmentPlansHeaderProps) {
  return (
    <div className="treatment-plans-header">
      <div className="plans-header-top">
        <div className="plans-search">
          <IconSearch size={18} />
          <input
            type="text"
            placeholder="Buscar por cliente, serviço ou profissional..."
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>

        {onNewClick && (
          <button className="btn btn-primary" onClick={onNewClick}>
            <IconPlus size={18} />
            <span>Novo orçamento</span>
          </button>
        )}
      </div>

      {stats && <div className="plans-stats">{stats}</div>}
    </div>
  );
}

/* ============================================
   TREATMENT PLAN ROW
   ============================================ */

interface TreatmentPlanRowProps {
  id: string;
  title: string;
  customer: string;
  service: string;
  professional: string;
  value: string;
  sessions: string;
  status: ReactNode;
  actions?: ReactNode;
  onClick?: () => void;
}

export function TreatmentPlanRow({
  id,
  title,
  customer,
  service,
  professional,
  value,
  sessions,
  status,
  actions,
  onClick,
}: TreatmentPlanRowProps) {
  return (
    <div className="treatment-plan-row" onClick={onClick}>
      <div className="plan-col plan-title">
        <strong>{title}</strong>
        <span className="plan-customer">{customer}</span>
      </div>
      <div className="plan-col plan-service">{service}</div>
      <div className="plan-col plan-professional">{professional}</div>
      <div className="plan-col plan-value">{value}</div>
      <div className="plan-col plan-sessions">{sessions}</div>
      <div className="plan-col plan-status">{status}</div>
      {actions && <div className="plan-col plan-actions">{actions}</div>}
    </div>
  );
}

/* ============================================
   TREATMENT PLAN CARD (Mobile)
   ============================================ */

interface TreatmentPlanCardProps {
  title: string;
  customer: string;
  service: string;
  professional: string;
  value: string;
  sessions: string;
  status: ReactNode;
  actions?: ReactNode;
  onClick?: () => void;
}

export function TreatmentPlanCard({
  title,
  customer,
  service,
  professional,
  value,
  sessions,
  status,
  actions,
  onClick,
}: TreatmentPlanCardProps) {
  return (
    <div className="treatment-plan-card" onClick={onClick}>
      <div className="plan-card-header">
        <div>
          <h3>{title}</h3>
          <p className="plan-card-customer">{customer}</p>
        </div>
        {status}
      </div>

      <div className="plan-card-body">
        <div className="plan-card-row">
          <span className="label">Serviço</span>
          <span className="value">{service}</span>
        </div>
        <div className="plan-card-row">
          <span className="label">Profissional</span>
          <span className="value">{professional}</span>
        </div>
        <div className="plan-card-row">
          <span className="label">Valor</span>
          <span className="value">{value}</span>
        </div>
        <div className="plan-card-row">
          <span className="label">Sessões</span>
          <span className="value">{sessions}</span>
        </div>
      </div>

      {actions && <div className="plan-card-actions">{actions}</div>}
    </div>
  );
}

/* ============================================
   PLAN DETAIL PANEL
   ============================================ */

interface PlanDetailPanelProps {
  title: string;
  customer: string;
  service: string;
  professional: string;
  status: ReactNode;
  value: string;
  sessions: string;
  notes?: string;
  children?: ReactNode;
  actions?: ReactNode;
}

export function PlanDetailPanel({
  title,
  customer,
  service,
  professional,
  status,
  value,
  sessions,
  notes,
  children,
  actions,
}: PlanDetailPanelProps) {
  return (
    <div className="plan-detail-panel">
      <div className="plan-detail-header">
        <div>
          <h2>{title}</h2>
          <p>{service}</p>
        </div>
        {status}
      </div>

      <div className="plan-detail-grid">
        <div className="plan-detail-field">
          <label>Cliente</label>
          <p>{customer}</p>
        </div>
        <div className="plan-detail-field">
          <label>Profissional</label>
          <p>{professional}</p>
        </div>
        <div className="plan-detail-field">
          <label>Valor</label>
          <p className="plan-value-highlight">{value}</p>
        </div>
        <div className="plan-detail-field">
          <label>Sessões</label>
          <p>{sessions}</p>
        </div>
      </div>

      {notes && (
        <div className="plan-detail-notes">
          <label>Observações</label>
          <p>{notes}</p>
        </div>
      )}

      {children && <div className="plan-detail-content">{children}</div>}

      {actions && <div className="plan-detail-actions">{actions}</div>}
    </div>
  );
}
