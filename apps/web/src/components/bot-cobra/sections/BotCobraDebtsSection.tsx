import { IconSearch } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { DebtListResponseItemSchema } from '@plataforma/shared';
import { formatMoneyCents, formatShortDate } from '../../../lib/format.js';
import { httpClient } from '../../../lib/http.js';
import { PageHeader, Pagination, ListSkeleton, EmptyState } from '../../ui/AppUi.js';
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

export function BotCobraDebtsSection({ tenantPublicId }: { tenantPublicId: string }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [originType, setOriginType] = useState<string | null>(null);
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ['bot-cobra-debts-list', tenantPublicId, page, search, status, originType],
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
        <PageHeader title="Cobranças" description="Lista completa de todas as cobranças em andamento" />

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
          <EmptyState title="Nenhuma cobrança encontrada" description="" />
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
                      <span className={`bot-cobra-badge ${debt.status.toLowerCase()}`}>
                        {STATUS_LABELS[debt.status] || debt.status}
                      </span>
                    </div>
                    <div className="bot-cobra-table-cell">
                      {debt.dueDate && <small>Venc: {formatShortDate(debt.dueDate)}</small>}
                      {debt.activePromiseDate && (
                        <small>Promessa até {formatShortDate(debt.activePromiseDate)}</small>
                      )}
                    </div>
                    <div className="bot-cobra-table-cell">
                      <small>{debt.originType === 'MANUAL' ? 'Manual' : 'Agendamento'}</small>
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
