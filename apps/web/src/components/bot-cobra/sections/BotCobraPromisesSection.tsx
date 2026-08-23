import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PaymentPromiseListResponseSchema } from '@plataforma/shared';
import { formatMoneyCents, formatShortDate } from '../../../lib/format.js';
import { httpClient } from '../../../lib/http.js';
import { PageHeader, ListSkeleton, EmptyState } from '../../ui/AppUi.js';
import { BotCobraDetailDrawer } from '../BotCobraDetailDrawer.js';
import '../bot-cobra.css';

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Ativa',
  FULFILLED: 'Cumprida',
  OVERDUE: 'Vencida',
  REPLACED: 'Substituída',
  CANCELED: 'Cancelada',
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
    <div className="app-shell bot-cobra-page">
      <div className="bot-cobra-container">
        <PageHeader title="Promessas de Pagamento" description="Gerenciar e acompanhar promessas de pagamento" />

        <div className="bot-cobra-filter-bar" style={{ marginBottom: '1.5rem' }}>
          <label>
            <select
              value={statusFilter ?? ''}
              onChange={(e) => setStatusFilter(e.target.value || null)}
            >
              <option value="">Todos os Status</option>
              <option value="ACTIVE">Ativa</option>
              <option value="FULFILLED">Cumprida</option>
              <option value="OVERDUE">Vencida</option>
              <option value="REPLACED">Substituída</option>
              <option value="CANCELED">Cancelada</option>
            </select>
          </label>
        </div>

        {isLoading ? (
          <ListSkeleton />
        ) : promises && promises.length > 0 ? (
          <div className="bot-cobra-section-card">
            <div className="bot-cobra-section-card-header">
              <h2>Promessas ({promises.length})</h2>
            </div>

            <div className="bot-cobra-table">
              {promises.map((promise) => (
                <div
                  key={promise.publicId}
                  className="bot-cobra-table-row"
                  onClick={() => setSelectedDebtId(promise.debtPublicId)}
                >
                  <div className="bot-cobra-table-cell">
                    <strong>{promise.debtorName}</strong>
                    <small>Prometido até {formatShortDate(promise.promisedDate)}</small>
                  </div>
                  <div className="bot-cobra-table-cell">
                    <span className={`bot-cobra-badge ${promise.status.toLowerCase()}`}>
                      {STATUS_LABELS[promise.status] || promise.status}
                    </span>
                  </div>
                  <div className="bot-cobra-table-cell">
                    <small>{promise.source}</small>
                  </div>
                  <div className="bot-cobra-table-cell text-right">
                    <strong>R$ {formatMoneyCents(BigInt(promise.currentBalanceCents))}</strong>
                    <small>Criada em {formatShortDate(promise.createdAt)}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState title="Nenhuma promessa encontrada" description="" />
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
