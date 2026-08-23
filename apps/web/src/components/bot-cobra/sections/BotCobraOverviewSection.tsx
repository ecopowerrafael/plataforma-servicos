import { IconPlus, IconSearch, IconAlertCircle, IconCheck, IconClock, IconHeadphones, IconFileText, IconReceiptOff } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DebtSummarySchema, DebtListResponseItemSchema } from '@plataforma/shared';
import { formatMoneyCents, formatShortDate } from '../../../lib/format.js';
import { httpClient } from '../../../lib/http.js';
import { PageHeader, Pagination, EmptyState, ListSkeleton } from '../../ui/AppUi.js';
import { BotCobraCard } from '../ui/BotCobraCard.js';
import { BotCobraStatCard } from '../ui/BotCobraStatCard.js';
import { BotCobraStatusBadge } from '../ui/BotCobraStatusBadge.js';
import { BotCobraDetailDrawer } from '../BotCobraDetailDrawer.js';

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

export function BotCobraOverviewSection({ tenantPublicId }: { tenantPublicId: string }) {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
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
    queryKey: ['bot-cobra-list', tenantPublicId, page, pageSize, search, status, originType],
    queryFn: () => {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
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
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <PageHeader
        title="Bot Cobra"
        description="Dashboard de cobrança e gestão de dívidas"
        action={
          <button
            onClick={() => navigate('/admin/bot-cobra/nova')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            <IconPlus className="w-4 h-4" />
            Nova Cobrança
          </button>
        }
      />

      <div className="px-4 md:px-6 py-6 max-w-full">
        {/* KPI Cards Grid */}
        <div className="mb-8">
          {summaryLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-24 bg-gray-200 dark:bg-slate-800 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : summaryData ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <BotCobraStatCard
                icon={<IconAlertCircle className="w-6 h-6" />}
                label="Em Aberto"
                value={`R$ ${formatMoneyCents(BigInt(summaryData.openBalanceCents))}`}
                subtext={`${summaryData.activeCount} dívidas`}
                color="red"
              />
              <BotCobraStatCard
                icon={<IconCheckCircle className="w-6 h-6" />}
                label="Recebido"
                value={`R$ ${formatMoneyCents(BigInt(summaryData.receivedTotalCents))}`}
                color="green"
              />
              <BotCobraStatCard
                icon={<IconClock className="w-6 h-6" />}
                label="Promessas"
                value={summaryData.promiseActiveCount}
                subtext={`${summaryData.promiseOverdueCount} atrasadas`}
                color="blue"
              />
              <BotCobraStatCard
                icon={<IconHeadphones className="w-6 h-6" />}
                label="Atendimento Humano"
                value={summaryData.humanSupportCount}
                color="purple"
              />
              <BotCobraStatCard
                icon={<IconFileText className="w-6 h-6" />}
                label="Em Disputa"
                value={summaryData.disputedCount}
                color="amber"
              />
              <BotCobraStatCard
                icon={<IconReceiptOff className="w-6 h-6" />}
                label="Quitadas"
                value={summaryData.paidCount}
                color="green"
              />
            </div>
          ) : null}
        </div>

        {/* Premium Filter Bar */}
        <BotCobraCard className="mb-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Filtros</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="relative">
                <IconSearch className="absolute left-3 top-3 w-5 h-5 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Buscar por nome ou telefone..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <select
                value={status ?? ''}
                onChange={(e) => {
                  setStatus(e.target.value || null);
                  setPage(1);
                }}
                className="px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Todos os Status</option>
                {Object.entries(STATUS_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                value={originType ?? ''}
                onChange={(e) => {
                  setOriginType(e.target.value || null);
                  setPage(1);
                }}
                className="px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Todas as Origens</option>
                <option value="MANUAL">Manual</option>
                <option value="APPOINTMENT">Agendamento</option>
              </select>
            </div>
          </div>
        </BotCobraCard>

        {/* Premium Debt List */}
        {listLoading ? (
          <ListSkeleton />
        ) : !listData?.items.length ? (
          <EmptyState message="Nenhuma dívida encontrada" />
        ) : (
          <BotCobraCard>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Dívidas ({listData?.items.length || 0})
              </h3>
            </div>

            <div className="space-y-3">
              {listData.items.map((debt: DebtListItem) => (
                <div
                  key={debt.publicId}
                  onClick={() => setSelectedDebtId(debt.publicId)}
                  className="border border-gray-200 dark:border-slate-800 rounded-lg p-4 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md dark:hover:shadow-blue-900/20 cursor-pointer transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="font-semibold text-gray-900 dark:text-white truncate">
                          {debt.debtorName}
                        </div>
                        <BotCobraStatusBadge status={debt.status} label={STATUS_LABELS[debt.status] || debt.status} />
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">{debt.debtorWhatsapp}</div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {debt.dueDate && (
                          <span className="text-gray-500 dark:text-gray-500">
                            Vencimento: {formatShortDate(debt.dueDate)}
                          </span>
                        )}
                        {debt.activePromiseDate && (
                          <span className="text-blue-600 dark:text-blue-400 font-medium">
                            Promessa até {formatShortDate(debt.activePromiseDate)}
                          </span>
                        )}
                        {debt.hasPendingPix && (
                          <span className="text-orange-600 dark:text-orange-400 font-medium">PIX Pendente</span>
                        )}
                        <span className="text-gray-500 dark:text-gray-500">
                          {debt.originType === 'MANUAL' ? '📝 Manual' : '📅 Agendamento'}
                        </span>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <div className="font-bold text-gray-900 dark:text-white">
                        R$ {formatMoneyCents(BigInt(debt.currentBalanceCents))}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-500">
                        de R$ {formatMoneyCents(BigInt(debt.originalAmountCents))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {listData && listData.totalPages > 1 && (
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-slate-800">
                <Pagination page={page} totalPages={listData.totalPages} onPageChange={setPage} />
              </div>
            )}
          </BotCobraCard>
        )}

        {/* Detail Drawer */}
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
