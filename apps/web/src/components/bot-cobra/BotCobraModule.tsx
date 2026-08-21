import { IconPlus, IconSearch } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { formatMoneyCents, formatShortDate } from '../../lib/format.js';
import { httpClient } from '../../lib/http.js';
import { EmptyState, ListSkeleton, PageHeader, Pagination } from '../ui/AppUi.js';
import { BotCobraDetailDrawer } from './BotCobraDetailDrawer.js';

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

interface DebtSummary {
  openBalanceCents: string;
  originalTotalCents: string;
  receivedTotalCents: string;
  activeCount: number;
  promiseActiveCount: number;
  promiseOverdueCount: number;
  humanSupportCount: number;
  disputedCount: number;
  paidCount: number;
  failedAttemptCount: number;
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Em cobrança',
  PAUSED: 'Pausada',
  PROMISE_SCHEDULED: 'Promessa',
  HUMAN_SUPPORT: 'Atendimento humano',
  DISPUTED: 'Em disputa',
  PAID: 'Quitada',
  CANCELED: 'Cancelada',
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'text-red-600',
  PAUSED: 'text-gray-600',
  PROMISE_SCHEDULED: 'text-blue-600',
  HUMAN_SUPPORT: 'text-purple-600',
  DISPUTED: 'text-orange-600',
  PAID: 'text-green-600',
  CANCELED: 'text-gray-400',
};

export function BotCobraModule({ tenantPublicId }: { tenantPublicId: string }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [originType, setOriginType] = useState<string | null>(null);
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);

  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['bot-cobra-summary', tenantPublicId],
    queryFn: async () => {
      const res = await httpClient.get(`/tenant/debts/summary`);
      return res.json() as Promise<DebtSummary>;
    },
  });

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ['bot-cobra-list', tenantPublicId, page, pageSize, search, status, originType],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
        ...(search && { search }),
        ...(status && { status }),
        ...(originType && { originType }),
      });
      const res = await httpClient.get(`/tenant/debts?${params}`);
      return res.json() as Promise<{
        items: DebtListItem[];
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      }>;
    },
  });

  return (
    <>
      <PageHeader title="Bot Cobra" description="Gerenciar cobranças e dívidas" />

      {/* Summary Cards */}
      {summaryLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-gray-100 rounded h-20 animate-pulse" />
          ))}
        </div>
      ) : summaryData ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <SummaryCard
            label="Em aberto"
            value={`R$ ${formatMoneyCents(BigInt(summaryData.openBalanceCents))}`}
            count={summaryData.activeCount}
          />
          <SummaryCard
            label="Recebido"
            value={`R$ ${formatMoneyCents(BigInt(summaryData.receivedTotalCents))}`}
            variant="success"
          />
          <SummaryCard
            label="Promessas"
            value={summaryData.promiseActiveCount}
            subvalue={`${summaryData.promiseOverdueCount} atrasadas`}
            variant="info"
          />
          <SummaryCard
            label="Atendimento"
            value={summaryData.humanSupportCount}
            variant="warning"
          />
          <SummaryCard
            label="Quitadas"
            value={summaryData.paidCount}
            variant="success"
          />
        </div>
      ) : null}

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="flex-1 min-w-64">
          <div className="relative">
            <IconSearch className="absolute left-2 top-2.5 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nome ou telefone..."
              className="w-full pl-8 pr-3 py-2 border rounded-md"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
        <select
          className="px-3 py-2 border rounded-md text-sm"
          value={status ?? ''}
          onChange={(e) => {
            setStatus(e.target.value || null);
            setPage(1);
          }}
        >
          <option value="">Status</option>
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          className="px-3 py-2 border rounded-md text-sm"
          value={originType ?? ''}
          onChange={(e) => {
            setOriginType(e.target.value || null);
            setPage(1);
          }}
        >
          <option value="">Origem</option>
          <option value="MANUAL">Manual</option>
          <option value="APPOINTMENT">Agendamento</option>
        </select>
      </div>

      {/* List */}
      {listLoading ? (
        <ListSkeleton />
      ) : !listData?.items.length ? (
        <EmptyState message="Nenhuma dívida encontrada" />
      ) : (
        <>
          <div className="space-y-2">
            {listData.items.map((debt) => (
              <div
                key={debt.publicId}
                className="border rounded-lg p-3 hover:bg-gray-50 cursor-pointer transition"
                onClick={() => setSelectedDebtId(debt.publicId)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-sm">{debt.debtorName}</div>
                    <div className="text-xs text-gray-600">{debt.debtorWhatsapp}</div>
                    <div className="flex gap-2 mt-1 text-xs">
                      <span className={`${STATUS_COLORS[debt.status] || 'text-gray-600'}`}>
                        {STATUS_LABELS[debt.status] || debt.status}
                      </span>
                      {debt.activePromiseDate && (
                        <span className="text-blue-600">Promessa até {formatShortDate(debt.activePromiseDate)}</span>
                      )}
                      {debt.hasPendingPix && <span className="text-orange-600">PIX pendente</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-sm">R$ {formatMoneyCents(BigInt(debt.currentBalanceCents))}</div>
                    <div className="text-xs text-gray-600">
                      de R$ {formatMoneyCents(BigInt(debt.originalAmountCents))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {listData && listData.totalPages > 1 && (
            <Pagination
              page={page}
              totalPages={listData.totalPages}
              onPageChange={setPage}
            />
          )}
        </>
      )}

      {/* Detail Drawer */}
      {selectedDebtId && (
        <BotCobraDetailDrawer
          debtPublicId={selectedDebtId}
          isOpen={!!selectedDebtId}
          onClose={() => setSelectedDebtId(null)}
        />
      )}
    </>
  );
}

function SummaryCard({
  label,
  value,
  subvalue,
  count,
  variant = 'default',
}: {
  label: string;
  value: string | number;
  subvalue?: string;
  count?: number;
  variant?: 'default' | 'success' | 'warning' | 'info';
}) {
  const bgColor = {
    default: 'bg-blue-50 border-blue-200',
    success: 'bg-green-50 border-green-200',
    warning: 'bg-yellow-50 border-yellow-200',
    info: 'bg-purple-50 border-purple-200',
  }[variant];

  const textColor = {
    default: 'text-blue-900',
    success: 'text-green-900',
    warning: 'text-yellow-900',
    info: 'text-purple-900',
  }[variant];

  return (
    <div className={`${bgColor} border rounded-lg p-3`}>
      <div className="text-xs text-gray-600 font-medium">{label}</div>
      <div className={`text-lg font-bold ${textColor} mt-1`}>{value}</div>
      {subvalue && <div className="text-xs text-gray-600 mt-1">{subvalue}</div>}
      {count !== undefined && <div className="text-xs text-gray-600 mt-1">{count} registros</div>}
    </div>
  );
}
