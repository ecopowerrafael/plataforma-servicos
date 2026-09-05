import { ReactNode } from 'react';
import { IconSearch, IconPlus, IconClock, IconCoin } from '@tabler/icons-react';

/* ============================================
   SERVICE HEADER
   ============================================ */

interface ServiceHeaderProps {
  onSearch: (search: string) => void;
  onNewClick?: () => void;
}

export function ServiceHeader({ onSearch, onNewClick }: ServiceHeaderProps) {
  return (
    <div className="service-header">
      <div className="service-search">
        <IconSearch size={18} />
        <input
          type="text"
          placeholder="Buscar serviços..."
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      {onNewClick && (
        <button className="btn btn-primary" onClick={onNewClick}>
          <IconPlus size={18} />
          <span>Novo serviço</span>
        </button>
      )}
    </div>
  );
}

/* ============================================
   SERVICE CARD (Grid)
   ============================================ */

interface ServiceCardProps {
  name: string;
  description?: string;
  duration: string;
  price: string;
  category?: string;
  image?: string;
  actions?: ReactNode;
  onClick?: () => void;
}

export function ServiceCard({
  name,
  description,
  duration,
  price,
  category,
  image,
  actions,
  onClick,
}: ServiceCardProps) {
  return (
    <div className="service-card" onClick={onClick}>
      {image && <div className="service-image" style={{ backgroundImage: `url(${image})` }} />}

      <div className="service-content">
        {category && <span className="service-category">{category}</span>}

        <h3>{name}</h3>
        {description && <p className="service-description">{description}</p>}

        <div className="service-info">
          <div className="service-info-item">
            <IconClock size={16} />
            <span>{duration}</span>
          </div>
          <div className="service-info-item">
            <IconCoin size={16} />
            <span className="service-price">{price}</span>
          </div>
        </div>
      </div>

      {actions && <div className="service-actions">{actions}</div>}
    </div>
  );
}

/* ============================================
   SERVICE ROW (List)
   ============================================ */

interface ServiceRowProps {
  name: string;
  category?: string;
  duration: string;
  price: string;
  active: boolean;
  actions?: ReactNode;
  onClick?: () => void;
}

export function ServiceRow({
  name,
  category,
  duration,
  price,
  active,
  actions,
  onClick,
}: ServiceRowProps) {
  return (
    <div className={`service-row${!active ? ' is-inactive' : ''}`} onClick={onClick}>
      <div className="service-row-main">
        <p className="service-row-name">{name}</p>
        {category && <span className="service-row-category">{category}</span>}
      </div>

      <div className="service-row-info">
        <span>{duration}</span>
        <span className="service-row-price">{price}</span>
      </div>

      {actions && <div className="service-row-actions">{actions}</div>}
    </div>
  );
}
