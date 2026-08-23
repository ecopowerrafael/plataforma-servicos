import { IconPhone } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useState } from 'react';
import { DebtListResponseItemSchema } from '@plataforma/shared';
import { formatMoneyCents, formatShortDate } from '../../../lib/format.js';
import { httpClient } from '../../../lib/http.js';
import { PageHeader, Pagination, ListSkeleton, EmptyState } from '../../ui/AppUi.js';
import { BotCobraCard } from '../ui/BotCobraCard.js';
import { BotCobraSectionCard } from '../ui/BotCobraSectionCard.js';
import { BotCobraDetailDrawer } from '../BotCobraDetailDrawer.js';

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

export function BotCobraHumanSupportSection({ tenantPublicId }: { tenantPublicId: string }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);

  const { data: listData, isLoading } = useQuery({
    queryKey: ['bot-cobra-human-support', tenantPublicId, page, pageSize],
    queryFn: () => {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
        status: 'HUMAN_SUPPORT',
      });
      return httpClient.request(`/tenant/debts?${params}`, {
        method: 'GET',
        schema: DebtListResponseItemSchema,
        tenantPublicId,
      });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: (debtPublicId: string) =>
      httpClient.request(`/tenant/debts/${debtPublicId}/resume-from-human-support`, {
        method: 'POST',
        body: {},
        schema: z.object({}),
        tenantPublicId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot-cobra-human-support'] });
    },
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <PageHeader title="Atendimento Humano" description="Cobranças aguardando atendimento especializado" />

      <div className="px-4 md:px-6 py-6 max-w-full">
        {isLoading ? (
          <ListSkeleton />
        ) : listData && listData.items.length > 0 ? (
          <BotCobraSectionCard title="Fila de Atendimento" subtitle={`${listData.items.length} cobranças aguardando`}>
            <div className="space-y-3">
              {listData.items.map((debt: DebtListItem) => (
                <div
                  key={debt.publicId}
                  className="border border-gray-200 dark:border-slate-800 rounded-lg p-4 hover:border-purple-300 dark:hover:border-purple-700 hover:shadow-md dark:hover:shadow-purple-900/20 transition-all"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 dark:text-white mb-1">{debt.debtorName}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">{debt.debtorWhatsapp}</div>
                      {debt.activePromiseDate && (
                        <div className="text-xs text-blue-600 dark:text-blue-400 font-medium mt-1">
                          Promessa até {formatShortDate(debt.activePromiseDate)}
                        </div>
                      )}
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

                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`https://wa.me/${debt.debtorWhatsapp.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 dark:bg-green-950/30 hover:bg-green-200 dark:hover:bg-green-900/50 text-green-700 dark:text-green-400 rounded-lg text-sm font-medium transition-colors"
                    >
                      <IconPhone className="w-4 h-4" />
                      WhatsApp
                    </a>
                    <button
                      onClick={() => setSelectedDebtId(debt.publicId)}
                      className="px-4 py-2 bg-blue-100 dark:bg-blue-950/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-400 rounded-lg text-sm font-medium transition-colors"
                    >
                      Ver Cobrança
                    </button>
                    <button
                      onClick={() => resumeMutation.mutate(debt.publicId)}
                      disabled={resumeMutation.isPending}
                      className="px-4 py-2 bg-purple-100 dark:bg-purple-950/30 hover:bg-purple-200 dark:hover:bg-purple-900/50 disabled:bg-gray-200 dark:disabled:bg-gray-800 text-purple-700 dark:text-purple-400 disabled:text-gray-500 dark:disabled:text-gray-500 rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed"
                    >
                      {resumeMutation.isPending ? 'Retomando...' : 'Retomar Cobrança'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {listData && listData.totalPages > 1 && (
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-slate-800">
                <Pagination page={page} totalPages={listData.totalPages} onPageChange={setPage} />
              </div>
            )}
          </BotCobraSectionCard>
        ) : (
          <EmptyState
            title="Nenhuma cobrança em atendimento"
            message="Quando clientes solicitarem atendimento humano, aparecerão aqui"
          />
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
