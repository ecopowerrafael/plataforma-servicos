import { ReactNode } from 'react';
import { IconSearch, IconPlus, IconFilter, IconCalendar, IconDollarSign, IconTrendingUp } from '@tabler/icons-react';

/* ============================================
   FINANCIAL HEADER
   ============================================ */

interface FinancialHeaderProps {
  onSearch: (search: string) => void;
  onNewClick?: () => void;
  onFilterClick?: () => void;
  dateRange?: ReactNode;
}

export function FinancialHeader({
  onSearch,
  onNewClick,
  onFilterClick,
  dateRange,
}: FinancialHeaderProps) {
  return (
    <div className="financial-header">
      <div className="financial-header-top">
        <div className="financial-search">
          <IconSearch size={18} />
          <input
            type="text"
            placeholder="Buscar por descrição, categoria ou documento..."
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>

        <div className="financial-header-actions">
          {onFilterClick && (
            <button className="btn btn-secondary" onClick={onFilterClick}>
              <IconFilter size={18} />
              <span>Filtros</span>
            </button>
          )}

          {onNewClick && (
            <button className="btn btn-primary" onClick={onNewClick}>
              <IconPlus size={18} />
              <span>Nova movimentação</span>
            </button>
          )}
        </div>
      </div>

      {dateRange && <div className="financial-date-range">{dateRange}</div>}
    </div>
  );
}

/* ============================================
   FINANCIAL SUMMARY CARD
   ============================================ */

interface FinancialSummaryCardProps {
  title: string;
  value: string;
  icon: ReactNode;
  trend?: { value: string; isPositive: boolean };
  period?: string;
}

export function FinancialSummaryCard({
  title,
  value,
  icon,
  trend,
  period,
}: FinancialSummaryCardProps) {
  return (
    <div className="financial-summary-card">
      <div className="summary-icon">{icon}</div>

      <div className="summary-content">
        <p className="summary-label">{title}</p>
        <h3 className="summary-value">{value}</h3>
        {period && <span className="summary-period">{period}</span>}
      </div>

      {trend && (
        <div className={`summary-trend ${trend.isPositive ? 'positive' : 'negative'}`}>
          <IconTrendingUp size={16} />
          <span>{trend.value}</span>
        </div>
      )}
    </div>
  );
}

/* ============================================
   FINANCIAL TRANSACTION ROW
   ============================================ */

interface FinancialTransactionRowProps {
  id: string;
  description: string;
  category: string;
  type: 'income' | 'expense';
  amount: string;
  date: string;
  status: 'paid' | 'pending' | 'cancelled';
  actions?: ReactNode;
  onClick?: () => void;
}

export function FinancialTransactionRow({
  id,
  description,
  category,
  type,
  amount,
  date,
  status,
  actions,
  onClick,
}: FinancialTransactionRowProps) {
  return (
    <div className={`financial-row financial-${type}`} onClick={onClick}>
      <div className="fin-col fin-description">
        <strong>{description}</strong>
        <span className="fin-category">{category}</span>
      </div>

      <div className="fin-col fin-date">{date}</div>

      <div className="fin-col fin-amount">
        <span className={`amount ${type}`}>{amount}</span>
      </div>

      <div className={`fin-col fin-status status-${status}`}>
        {status === 'paid' && 'Pago'}
        {status === 'pending' && 'Pendente'}
        {status === 'cancelled' && 'Cancelado'}
      </div>

      {actions && <div className="fin-col fin-actions">{actions}</div>}
    </div>
  );
}

/* ============================================
   FINANCIAL TRANSACTION CARD (Mobile)
   ============================================ */

interface FinancialTransactionCardProps {
  description: string;
  category: string;
  type: 'income' | 'expense';
  amount: string;
  date: string;
  status: 'paid' | 'pending' | 'cancelled';
  actions?: ReactNode;
  onClick?: () => void;
}

export function FinancialTransactionCard({
  description,
  category,
  type,
  amount,
  date,
  status,
  actions,
  onClick,
}: FinancialTransactionCardProps) {
  return (
    <div className={`financial-card financial-${type}`} onClick={onClick}>
      <div className="fin-card-header">
        <div>
          <h3>{description}</h3>
          <p className="fin-card-category">{category}</p>
        </div>
        <span className={`fin-card-amount ${type}`}>{amount}</span>
      </div>

      <div className="fin-card-body">
        <div className="fin-card-row">
          <span className="label">Data</span>
          <span className="value">{date}</span>
        </div>
        <div className="fin-card-row">
          <span className="label">Status</span>
          <span className={`status status-${status}`}>
            {status === 'paid' && 'Pago'}
            {status === 'pending' && 'Pendente'}
            {status === 'cancelled' && 'Cancelado'}
          </span>
        </div>
      </div>

      {actions && <div className="fin-card-actions">{actions}</div>}
    </div>
  );
}

/* ============================================
   FINANCIAL SUMMARY PANEL
   ============================================ */

interface FinancialSummaryPanelProps {
  period: string;
  totalIncome: string;
  totalExpense: string;
  netResult: string;
  transactions?: {
    title: string;
    count: number;
    value: string;
  }[];
  children?: ReactNode;
  actions?: ReactNode;
}

export function FinancialSummaryPanel({
  period,
  totalIncome,
  totalExpense,
  netResult,
  transactions,
  children,
  actions,
}: FinancialSummaryPanelProps) {
  return (
    <div className="financial-summary-panel">
      <div className="summary-panel-header">
        <div>
          <h2>Resumo Financeiro</h2>
          <p>{period}</p>
        </div>
      </div>

      <div className="summary-panel-grid">
        <div className="summary-panel-field">
          <label>Receitas</label>
          <p className="summary-income">{totalIncome}</p>
        </div>
        <div className="summary-panel-field">
          <label>Despesas</label>
          <p className="summary-expense">{totalExpense}</p>
        </div>
        <div className="summary-panel-field">
          <label>Resultado Líquido</label>
          <p className="summary-net">{netResult}</p>
        </div>
      </div>

      {transactions && transactions.length > 0 && (
        <div className="summary-panel-transactions">
          <h4>Movimentações</h4>
          <div className="transactions-grid">
            {transactions.map((tx, idx) => (
              <div key={idx} className="transaction-item">
                <span className="tx-title">{tx.title}</span>
                <p className="tx-count">{tx.count} transações</p>
                <span className="tx-value">{tx.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {children && <div className="summary-panel-content">{children}</div>}

      {actions && <div className="summary-panel-actions">{actions}</div>}
    </div>
  );
}
