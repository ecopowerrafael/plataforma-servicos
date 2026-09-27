import { ReactNode } from 'react';
import {
  IconBoxSeam,
  IconCoin,
  IconPackage,
  IconPlus,
  IconSearch,
} from '@tabler/icons-react';

import { TenantServiceImage } from '../services/TenantServiceImage.js';

/* ============================================
   PRODUCT HEADER
   ============================================ */

interface ProductHeaderProps {
  onSearch: (search: string) => void;
  onNewClick?: () => void;
}

export function ProductHeader({ onSearch, onNewClick }: ProductHeaderProps) {
  return (
    <div className="product-header">
      <div className="product-search">
        <IconSearch size={18} />
        <input
          type="text"
          placeholder="Buscar produtos por nome, código ou categoria..."
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      {onNewClick && (
        <button className="btn btn-primary" onClick={onNewClick}>
          <IconPlus size={18} />
          <span>Novo produto</span>
        </button>
      )}
    </div>
  );
}

/* ============================================
   PRODUCT CARD (Grid)
   ============================================ */

interface ProductCardProps {
  name: string;
  code?: string;
  category: string;
  price: string;
  stock: number;
  image?: string;
  status: 'active' | 'inactive';
  actions?: ReactNode;
  onClick?: () => void;
}

export function ProductCard({
  name,
  code,
  category,
  price,
  stock,
  image,
  status,
  actions,
  onClick,
}: ProductCardProps) {
  return (
    <div className={`product-card ${status === 'inactive' ? 'is-inactive' : ''}`} onClick={onClick}>
      {image ? (
        <div className="product-image" style={{ backgroundImage: `url(${image})` }} />
      ) : (
        <div className="product-image-placeholder">
          <IconBoxSeam size={40} />
        </div>
      )}

      <div className="product-content">
        <div className="product-header-info">
          <h3>{name}</h3>
          {code && <span className="product-code">{code}</span>}
        </div>

        <p className="product-category">{category}</p>

        <div className="product-stats">
          <div className="stat">
            <IconCoin size={14} />
            <span className="price">{price}</span>
          </div>
          <div className="stat">
            <IconPackage size={14} />
            <span className={`stock ${stock > 0 ? 'available' : 'unavailable'}`}>
              {stock} em estoque
            </span>
          </div>
        </div>

        <span className={`product-status ${status}`}>
          {status === 'active' ? 'Ativo' : 'Inativo'}
        </span>
      </div>

      {actions && <div className="product-actions">{actions}</div>}
    </div>
  );
}

/* ============================================
   PRODUCT ROW (List)
   ============================================ */

interface ProductRowProps {
  publicId: string;
  name: string;
  code?: string;
  category: string;
  price: string;
  stock: number;
  imageAlt: string;
  imageUrl: string | null;
  status: 'active' | 'inactive';
  tenantPublicId: string;
  actions?: ReactNode;
  onClick?: () => void;
}

export function ProductRow({
  publicId,
  name,
  code,
  category,
  price,
  stock,
  imageAlt,
  imageUrl,
  status,
  tenantPublicId,
  actions,
  onClick,
}: ProductRowProps) {
  return (
    <div className={`product-row ${status === 'inactive' ? 'is-inactive' : ''}`} onClick={onClick}>
      <span className="product-row-thumb" aria-hidden={imageUrl === null ? 'true' : undefined}>
        {imageUrl === null ? (
          <i>{name.slice(0, 1).toUpperCase()}</i>
        ) : (
          <TenantServiceImage
            alt={imageAlt}
            kind="products"
            servicePublicId={publicId}
            tenantPublicId={tenantPublicId}
          />
        )}
      </span>
      <div className="product-row-main">
        <p className="product-row-name">{name}</p>
        <div className="product-row-meta">
          <span className="product-row-category">{category}</span>
          {code && <span className="product-row-code">{code}</span>}
        </div>
      </div>

      <div className="product-row-price">{price}</div>

      <div className={`product-row-stock ${stock > 0 ? 'available' : 'unavailable'}`}>
        {stock} un.
      </div>

      <span className={`product-status ${status}`}>
        {status === 'active' ? 'Ativo' : 'Inativo'}
      </span>

      {actions && <div className="product-row-actions">{actions}</div>}
    </div>
  );
}

/* ============================================
   PRODUCT DETAIL PANEL
   ============================================ */

interface ProductDetailPanelProps {
  name: string;
  code: string;
  category: string;
  price: string;
  stock: number;
  status: 'active' | 'inactive';
  description?: string;
  sku?: string;
  supplier?: string;
  cost?: string;
  children?: ReactNode;
  actions?: ReactNode;
}

export function ProductDetailPanel({
  name,
  code,
  category,
  price,
  stock,
  status,
  description,
  sku,
  supplier,
  cost,
  children,
  actions,
}: ProductDetailPanelProps) {
  return (
    <div className="product-detail-panel">
      <div className="product-detail-header">
        <div>
          <h2>{name}</h2>
          <p className="product-detail-code">{code}</p>
        </div>
        <span className={`product-status ${status}`}>
          {status === 'active' ? 'Ativo' : 'Inativo'}
        </span>
      </div>

      <div className="product-detail-grid">
        <div className="product-detail-field">
          <label>Categoria</label>
          <p>{category}</p>
        </div>
        <div className="product-detail-field">
          <label>Preço</label>
          <p className="product-detail-price">{price}</p>
        </div>
        <div className="product-detail-field">
          <label>Estoque</label>
          <p className={`product-detail-stock ${stock > 0 ? 'available' : 'unavailable'}`}>
            {stock} unidades
          </p>
        </div>
        {sku && (
          <div className="product-detail-field">
            <label>SKU</label>
            <p>{sku}</p>
          </div>
        )}
        {supplier && (
          <div className="product-detail-field">
            <label>Fornecedor</label>
            <p>{supplier}</p>
          </div>
        )}
        {cost && (
          <div className="product-detail-field">
            <label>Custo</label>
            <p className="product-detail-cost">{cost}</p>
          </div>
        )}
      </div>

      {description && (
        <div className="product-detail-description">
          <label>Descrição</label>
          <p>{description}</p>
        </div>
      )}

      {children && <div className="product-detail-content">{children}</div>}

      {actions && <div className="product-detail-actions">{actions}</div>}
    </div>
  );
}
