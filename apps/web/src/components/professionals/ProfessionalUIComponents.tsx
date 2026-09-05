import { ReactNode } from 'react';
import { IconSearch, IconPlus, IconPhone, IconCalendar } from '@tabler/icons-react';

/* ============================================
   PROFESSIONAL HEADER
   ============================================ */

interface ProfessionalHeaderProps {
  onSearch: (search: string) => void;
  onNewClick?: () => void;
}

export function ProfessionalHeader({ onSearch, onNewClick }: ProfessionalHeaderProps) {
  return (
    <div className="professional-header">
      <div className="professional-search">
        <IconSearch size={18} />
        <input
          type="text"
          placeholder="Buscar profissional..."
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      {onNewClick && (
        <button className="btn btn-primary" onClick={onNewClick}>
          <IconPlus size={18} />
          <span>Adicionar profissional</span>
        </button>
      )}
    </div>
  );
}

/* ============================================
   PROFESSIONAL CARD (Grid)
   ============================================ */

interface ProfessionalCardProps {
  name: string;
  specialty?: string;
  phone?: string;
  appointments: number;
  status: 'active' | 'inactive';
  image?: string;
  actions?: ReactNode;
  onClick?: () => void;
}

export function ProfessionalCard({
  name,
  specialty,
  phone,
  appointments,
  status,
  image,
  actions,
  onClick,
}: ProfessionalCardProps) {
  return (
    <div className={`professional-card ${status === 'inactive' ? 'is-inactive' : ''}`} onClick={onClick}>
      {image ? (
        <img src={image} alt={name} className="professional-photo" />
      ) : (
        <div className="professional-avatar">{name.charAt(0).toUpperCase()}</div>
      )}

      <div className="professional-content">
        <h3>{name}</h3>
        {specialty && <p className="professional-specialty">{specialty}</p>}

        <div className="professional-stats">
          <div className="stat">
            <IconCalendar size={14} />
            <span>{appointments} agendamentos</span>
          </div>
          {phone && (
            <div className="stat">
              <IconPhone size={14} />
              <span>{phone}</span>
            </div>
          )}
        </div>

        <span className={`professional-status ${status}`}>
          {status === 'active' ? 'Ativo' : 'Inativo'}
        </span>
      </div>

      {actions && <div className="professional-actions">{actions}</div>}
    </div>
  );
}

/* ============================================
   PROFESSIONAL ROW (List)
   ============================================ */

interface ProfessionalRowProps {
  name: string;
  specialty?: string;
  appointments: number;
  status: 'active' | 'inactive';
  actions?: ReactNode;
  onClick?: () => void;
}

export function ProfessionalRow({
  name,
  specialty,
  appointments,
  status,
  actions,
  onClick,
}: ProfessionalRowProps) {
  return (
    <div className={`professional-row ${status === 'inactive' ? 'is-inactive' : ''}`} onClick={onClick}>
      <div className="professional-row-info">
        <p className="professional-row-name">{name}</p>
        {specialty && <span className="professional-row-specialty">{specialty}</span>}
      </div>

      <div className="professional-row-appointments">{appointments}</div>

      <span className={`professional-status ${status}`}>
        {status === 'active' ? 'Ativo' : 'Inativo'}
      </span>

      {actions && <div className="professional-row-actions">{actions}</div>}
    </div>
  );
}
