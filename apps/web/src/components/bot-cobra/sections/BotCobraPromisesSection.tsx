import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PaymentPromiseListResponseSchema } from '@plataforma/shared';
import { formatMoneyCents, formatShortDate } from '../../../lib/format.js';
import { httpClient } from '../../../lib/http.js';
import { PageHeader, ListSkeleton, EmptyState } from '../../ui/AppUi.js';
import { BotCobraCard } from '../ui/BotCobraCard.js';
import { BotCobraSectionCard } from '../ui/BotCobraSectionCard.js';
import { BotCobraStatusBadge } from '../ui/BotCobraStatusBadge.js';
import { BotCobraDetailDrawer } from '../BotCobraDetailDrawer.js';

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Ativa',
  FULFILLED: 'Cumprida',
  OVERDUE: 'Vencida',
  REPLACED: 'Substituída',
  CANCELED: 'Cancelada',
};

const STATUS_MAP: Record<string, string> = {
  ACTIVE: 'PROMISE_SCHEDULED',
  FULFILLED: 'PAID',
  OVERDUE: 'OPEN',
  REPLACED: 'PAUSED',
  CANCELED: 'CANCELED',
};

export function BotCobraPromisesSection({ tenantPublicId }: { tenantPublicId: string }) {
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);

  const { data: promisesData, isLoading } = useQuery({
    queryKey: ['bot-cobra-promises', tenantPublicId, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      return httpClient.request(`/tenant/payment-promises?${params}`, {
        method: 'GET',
        schema: PaymentPromiseListResponseSchema,
        tenantPublicId,
      });
    },
  });

  const promises = promisesData?.items ?? [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <PageHeader title="Promessas de Pagamento" description="Gerenciar e acompanhar promessas de pagamento" />

      <div className="px-4 md:px-6 py-6 max-w-full">
        {/* Filter */}
        <BotCobraCard className="mb-6">
          <div className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Filtro</h3>
            <select
              value={statusFilter ?? ''}
              onChange={(e) => setStatusFilter(e.target.value || null)}
              className="px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Todos os Status</option>
              <option value="ACTIVE">Ativa</option>
              <option value="FULFILLED">Cumprida</option>
              <option value="OVERDUE">Vencida</option>
              <option value="REPLACED">Substituída</option>
              <option value="CANCELED">Cancelada</option>
            </select>
          </div>
        </BotCobraCard>

        {/* List */}
        {isLoading ? (
          <ListSkeleton />
        ) : promises && promises.length > 0 ? (
          <BotCobraSectionCard title="Promessas" subtitle={`${promises.length} registros encontrados`}>
            <div className="space-y-3">
              {promises.map((promise) => (
                <div
                  key={promise.publicId}
                  onClick={() => setSelectedDebtId(promise.debtPublicId)}
                  className="border border-gray-200 dark:border-slate-800 rounded-lg p-4 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md dark:hover:shadow-blue-900/20 cursor-pointer transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <div className="font-semibold text-gray-900 dark:text-white truncate">
                          {promise.debtorName}
                        </div>
                        <BotCobraStatusBadge status={STATUS_MAP[promise.status]} label={STATUS_LABELS[promise.status]} />
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        Promessa até <span className="font-medium">{formatShortDate(promise.promisedDate)}</span>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="text-gray-500 dark:text-gray-500">Criado em {formatShortDate(promise.createdAt)}</span>
                        <span className="text-gray-500 dark:text-gray-500">•</span>
                        <span className="text-gray-500 dark:text-gray-500">Origem: {promise.source}</span>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <div className="font-bold text-gray-900 dark:text-white">
                        R$ {formatMoneyCents(BigInt(promise.currentBalanceCents))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </BotCobraSectionCard>
        ) : (
          <EmptyState title="Nenhuma promessa encontrada" message="Crie cobranças e aguarde as promessas de pagamento" />
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
