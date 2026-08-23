import { IconPlus, IconSearch } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DebtSummarySchema, DebtListResponseItemSchema } from '@plataforma/shared';
import { formatMoneyCents, formatShortDate } from '../../../lib/format.js';
import { httpClient } from '../../../lib/http.js';
import { Pagination, EmptyState, ListSkeleton } from '../../ui/AppUi.js';
import { BotCobraDetailDrawer } from '../BotCobraDetailDrawer.js';
import '../bot-cobra.css';

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Em cobrança',
  PAUSED: 'Pausada',
  PROMISE_SCHEDULED: 'Promessa',
  HUMAN_SUPPORT: 'Atendimento humano',
  DISPUTED: 'Em disputa',
  PAID: 'Quitada',
  CANCELED: 'Cancelada',
};

interface DebtListItem {
  publicId: string;
  debtorName: string;
  debtorWhatsapp: string;
  originType: 'MANUAL' | 'APPOINTMENT';
  originalAmountCents: string;
  currentBalanceCents: string;
  status: string;
  dueDate: string;
  createdAt: string;
  collectionRulePublicId: string;
  activePromiseDate: string | null;
  hasPendingPix: boolean;
  lastAttemptType: string | null;
  lastAttemptAt: string | null;
}

export function BotCobraOverviewSection({ tenantPublicId }: { tenantPublicId: string }) {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [originType, setOriginType] = useState<string | null>(null);
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);

  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['bot-cobra-summary', tenantPublicId],
    queryFn: () =>
      httpClient.request('/tenant/debts/summary', {
        method: 'GET',
        schema: DebtSummarySchema,
        tenantPublicId,
      }),
  });

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ['bot-cobra-list', tenantPublicId, page, search, status, originType],
    queryFn: () => {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: '25',
        ...(search && { search }),
        ...(status && { status }),
        ...(originType && { originType }),
      });
      return httpClient.request(`/tenant/debts?${params}`, {
        method: 'GET',
        schema: DebtListResponseItemSchema,
        tenantPublicId,
      });
    },
  });

  return (
    <div className="app-shell bot-cobra-page">
      <div className="bot-cobra-container">
        <div className="bot-cobra-page-header-row" style={{ marginBottom: '2rem' }}>
          <div>
            <h1 style={{ margin: '0 0 0.5rem' }}>Bot Cobra</h1>
            <p style={{ color: 'var(--app-muted)', margin: '0', fontSize: '0.9rem' }}>
              Dashboard de cobrança e gestão de dívidas
            </p>
          </div>
          <button
            onClick={() => navigate('/admin/bot-cobra/nova')}
            className="button"
          >
            <IconPlus size={16} style={{ marginRight: '0.4rem' }} />
            Nova Cobrança
          </button>
        </div>

        {/* KPI Grid */}
        {summaryLoading ? (
          <div className="bot-cobra-kpi-grid">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bot-cobra-stat-card" style={{ minHeight: '120px', opacity: 0.5 }} />
            ))}
          </div>
        ) : summaryData ? (
          <div className="bot-cobra-kpi-grid">
            <div className="bot-cobra-stat-card">
              <h4>Em Aberto</h4>
              <p className="value">R$ {formatMoneyCents(BigInt(summaryData.openBalanceCents))}</p>
              <p className="subtext">{summaryData.activeCount} dívidas</p>
            </div>
            <div className="bot-cobra-stat-card">
              <h4>Recebido</h4>
              <p className="value">R$ {formatMoneyCents(BigInt(summaryData.receivedTotalCents))}</p>
            </div>
            <div className="bot-cobra-stat-card">
              <h4>Promessas</h4>
              <p className="value">{summaryData.promiseActiveCount}</p>
              <p className="subtext">{summaryData.promiseOverdueCount} atrasadas</p>
            </div>
            <div className="bot-cobra-stat-card">
              <h4>PIX Pendente</h4>
              <p className="value">-</p>
            </div>
            <div className="bot-cobra-stat-card">
              <h4>Atendimento</h4>
              <p className="value">{summaryData.humanSupportCount}</p>
            </div>
            <div className="bot-cobra-stat-card">
              <h4>Quitadas</h4>
              <p className="value">{summaryData.paidCount}</p>
            </div>
          </div>
        ) : null}

        {/* Filter */}
        <div className="bot-cobra-filter-bar">
          <label style={{ flex: '1 1 15rem', position: 'relative' }}>
            <IconSearch
              size={16}
              style={{
                position: 'absolute',
                left: '0.7rem',
                top: '0.75rem',
                color: 'var(--app-muted)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              placeholder="Buscar por nome ou telefone..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              style={{ paddingLeft: '2.2rem', width: '100%' }}
            />
          </label>
          <label>
            <select
              value={status ?? ''}
              onChange={(e) => {
                setStatus(e.target.value || null);
                setPage(1);
              }}
            >
              <option value="">Todos os Status</option>
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <select
              value={originType ?? ''}
              onChange={(e) => {
                setOriginType(e.target.value || null);
                setPage(1);
              }}
            >
              <option value="">Todas as Origens</option>
              <option value="MANUAL">Manual</option>
              <option value="APPOINTMENT">Agendamento</option>
            </select>
          </label>
        </div>

        {/* List */}
        {listLoading ? (
          <ListSkeleton />
        ) : !listData?.items.length ? (
          <EmptyState title="Nenhuma dívida encontrada" description="" />
        ) : (
          <>
            <div className="bot-cobra-section-card">
              <div className="bot-cobra-section-card-header">
                <h2>Dívidas ({listData?.items.length || 0})</h2>
              </div>

              <div className="bot-cobra-table">
                {listData.items.map((debt: DebtListItem) => (
                  <div
                    key={debt.publicId}
                    className="bot-cobra-table-row"
                    onClick={() => setSelectedDebtId(debt.publicId)}
                  >
                    <div className="bot-cobra-table-cell">
                      <strong>{debt.debtorName}</strong>
                      <small>{debt.debtorWhatsapp}</small>
                    </div>
                    <div className="bot-cobra-table-cell">
                      <span
                        className={`bot-cobra-badge ${debt.status.toLowerCase()}`}
                        style={{ marginBottom: '0.3rem' }}
                      >
                        {STATUS_LABELS[debt.status] || debt.status}
                      </span>
                      {debt.activePromiseDate && <small>Promessa até {formatShortDate(debt.activePromiseDate)}</small>}
                    </div>
                    <div className="bot-cobra-table-cell">
                      {debt.dueDate && <small>Venc: {formatShortDate(debt.dueDate)}</small>}
                      {debt.hasPendingPix && <small style={{ color: 'var(--app-warning)' }}>PIX Pendente</small>}
                    </div>
                    <div className="bot-cobra-table-cell text-right">
                      <strong>R$ {formatMoneyCents(BigInt(debt.currentBalanceCents))}</strong>
                      <small>de R$ {formatMoneyCents(BigInt(debt.originalAmountCents))}</small>
                    </div>
                  </div>
                ))}
              </div>

              {listData && listData.totalPages > 1 && (
                <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--app-border)' }}>
                  <Pagination
                    page={page}
                    totalPages={listData.totalPages}
                    onPrevious={() => setPage((p) => Math.max(1, p - 1))}
                    onNext={() => setPage((p) => p + 1)}
                  />
                </div>
              )}
            </div>
          </>
        )}

        {selectedDebtId && (
          <BotCobraDetailDrawer
            debtPublicId={selectedDebtId}
            tenantPublicId={tenantPublicId}
            isOpen={!!selectedDebtId}
            onClose={() => setSelectedDebtId(null)}
          />
        )}
      </div>
    </div>
  );
}
