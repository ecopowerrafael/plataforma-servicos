import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useState } from 'react';
import { DebtListResponseItemSchema } from '@plataforma/shared';
import { formatMoneyCents, formatShortDate } from '../../../lib/format.js';
import { httpClient } from '../../../lib/http.js';
import { PageHeader, Pagination, ListSkeleton, EmptyState } from '../../ui/AppUi.js';
import { BotCobraDetailDrawer } from '../BotCobraDetailDrawer.js';
import '../bot-cobra.css';

interface DebtListItem {
  publicId: string;
  debtorName: string;
  debtorWhatsapp: string;
  originalAmountCents: string;
  currentBalanceCents: string;
  activePromiseDate: string | null;
}

export function BotCobraHumanSupportSection({ tenantPublicId }: { tenantPublicId: string }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);

  const { data: listData, isLoading } = useQuery({
    queryKey: ['bot-cobra-human-support', tenantPublicId, page],
    queryFn: () => {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: '25',
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
    <div className="app-shell bot-cobra-page">
      <div className="bot-cobra-container">
        <PageHeader title="Atendimento Humano" description="Cobranças aguardando atendimento especializado" />

        {isLoading ? (
          <ListSkeleton />
        ) : listData && listData.items.length > 0 ? (
          <>
            <div className="bot-cobra-section-card">
              <div className="bot-cobra-section-card-header">
                <h2>Fila de Atendimento ({listData.items.length})</h2>
              </div>

              <div className="bot-cobra-table">
                {listData.items.map((debt: DebtListItem) => (
                  <div key={debt.publicId} className="bot-cobra-table-row">
                    <div className="bot-cobra-table-cell" onClick={() => setSelectedDebtId(debt.publicId)}>
                      <strong>{debt.debtorName}</strong>
                      <small>{debt.debtorWhatsapp}</small>
                      {debt.activePromiseDate && (
                        <small>Promessa até {formatShortDate(debt.activePromiseDate)}</small>
                      )}
                    </div>
                    <div className="bot-cobra-table-cell text-right">
                      <strong>R$ {formatMoneyCents(BigInt(debt.currentBalanceCents))}</strong>
                      <small>de R$ {formatMoneyCents(BigInt(debt.originalAmountCents))}</small>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', minWidth: 'auto' }}>
                      <a
                        href={`https://wa.me/${debt.debtorWhatsapp.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="button"
                        style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem' }}
                      >
                        WhatsApp
                      </a>
                      <button
                        onClick={() => setSelectedDebtId(debt.publicId)}
                        className="button"
                        style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem' }}
                      >
                        Ver
                      </button>
                      <button
                        onClick={() => resumeMutation.mutate(debt.publicId)}
                        disabled={resumeMutation.isPending}
                        className="button"
                        style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem' }}
                      >
                        {resumeMutation.isPending ? '...' : 'Retomar'}
                      </button>
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
        ) : (
          <EmptyState title="Nenhuma cobrança em atendimento" description="" />
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
