import { ReactNode, CSSProperties } from 'react';

/* ============================================
   PAGE HEADER
   ============================================ */

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, eyebrow, actions }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
}

/* ============================================
   METRIC CARD
   ============================================ */

interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  change?: { value: number; isPositive: boolean };
  icon?: ReactNode;
}

export function MetricCard({ label, value, unit, change, icon }: MetricCardProps) {
  return (
    <div className="metric-card">
      {icon && <div className="metric-icon">{icon}</div>}
      <p className="metric-label">{label}</p>
      <div className="metric-value">
        {value}
        {unit && <span className="metric-unit">{unit}</span>}
      </div>
      {change && (
        <p className={`metric-change ${change.isPositive ? 'positive' : 'negative'}`}>
          {change.isPositive ? '↑' : '↓'} {Math.abs(change.value)}%
        </p>
      )}
    </div>
  );
}

/* ============================================
   SECTION CARD
   ============================================ */

interface SectionCardProps {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
}

export function SectionCard({ title, children, actions, footer }: SectionCardProps) {
  return (
    <div className="section-card">
      {title && (
        <div className="section-card-header">
          <h2>{title}</h2>
          {actions && <div className="actions">{actions}</div>}
        </div>
      )}
      <div className="section-card-body">{children}</div>
      {footer && <div className="section-card-footer">{footer}</div>}
    </div>
  );
}

/* ============================================
   LIST CONTAINER
   ============================================ */

interface ListItemProps {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  onClick?: () => void;
}

export function ListItem({ title, subtitle, badge, actions, onClick }: ListItemProps) {
  return (
    <div className="list-item" onClick={onClick}>
      <div className="list-item-main">
        <p className="list-item-title">{title}</p>
        {subtitle && <p className="list-item-subtitle">{subtitle}</p>}
      </div>
      {badge && <div className="list-item-badge">{badge}</div>}
      {actions && <div className="list-item-actions">{actions}</div>}
    </div>
  );
}

interface ListContainerProps {
  children: ReactNode;
}

export function ListContainer({ children }: ListContainerProps) {
  return <div className="list-container">{children}</div>;
}

/* ============================================
   FORM GROUP
   ============================================ */

interface FormGroupProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}

export function FormGroup({ label, error, hint, required, children }: FormGroupProps) {
  return (
    <div className={`form-group ${error ? 'error' : ''}`}>
      <label>
        {label}
        {required && <span className="required">*</span>}
      </label>
      {children}
      {hint && !error && <small className="form-hint">{hint}</small>}
      {error && <small className="form-error">{error}</small>}
    </div>
  );
}

/* ============================================
   EMPTY STATE
   ============================================ */

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-state-icon">{icon}</div>}
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action && <div>{action}</div>}
    </div>
  );
}

/* ============================================
   ALERT
   ============================================ */

type AlertType = 'success' | 'warning' | 'danger' | 'info';

interface AlertProps {
  type: AlertType;
  title?: string;
  message: string;
  icon?: ReactNode;
}

export function Alert({ type, title, message, icon }: AlertProps) {
  return (
    <div className={`alert alert-${type}`}>
      {icon && <div className="alert-icon">{icon}</div>}
      <div className="alert-content">
        {title && <p className="alert-title">{title}</p>}
        <p className="alert-message">{message}</p>
      </div>
    </div>
  );
}

/* ============================================
   BADGE
   ============================================ */

type BadgeType = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

interface BadgeProps {
  type?: BadgeType;
  children: ReactNode;
}

export function Badge({ type = 'neutral', children }: BadgeProps) {
  return <span className={`badge badge-${type}`}>{children}</span>;
}

/* ============================================
   BUTTON VARIANTS
   ============================================ */

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const className = `btn btn-${variant} btn-${size} ${isLoading ? 'is-loading' : ''}`;
  return (
    <button className={className} disabled={disabled || isLoading} {...props}>
      {isLoading ? '...' : children}
    </button>
  );
}

/* ============================================
   GRID LAYOUTS
   ============================================ */

interface GridProps {
  cols?: 1 | 2 | 3 | 4 | 'auto';
  children: ReactNode;
  gap?: 'sm' | 'md' | 'lg';
}

export function Grid({ cols = 'auto', children, gap = 'md' }: GridProps) {
  const colsClass = cols === 'auto' ? 'grid-auto' : `grid-${cols}`;
  const gapClass = gap === 'sm' ? 'gap-sm' : gap === 'lg' ? 'gap-lg' : '';
  return <div className={`${colsClass} ${gapClass}`}>{children}</div>;
}

/* ============================================
   MODAL
   ============================================ */

interface ModalProps {
  isOpen: boolean;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  size?: 'sm' | 'md' | 'lg';
}

export function Modal({ isOpen, title, children, footer, onClose, size = 'md' }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal-content modal-${size}`} onClick={(e) => e.stopPropagation()}>
        {title && (
          <div className="modal-header">
            <h2>{title}</h2>
            <button className="modal-close" onClick={onClose}>
              ✕
            </button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

/* ============================================
   LOADING SKELETON
   ============================================ */

interface SkeletonProps {
  count?: number;
  type?: 'card' | 'line';
}

export function Skeleton({ count = 1, type = 'card' }: SkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`skeleton skeleton-${type}`} />
      ))}
    </>
  );
}
