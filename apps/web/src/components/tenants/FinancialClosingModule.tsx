import {
  FinancialClosingListResponseSchema,
  FinancialClosingPublicSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';

const formatMoney = (cents: string) => `R$ ${(Number(cents) / 100).toFixed(2)}`;
const today = () => new Date().toISOString().slice(0, 10);
const startOfDayIso = (date: string) => `${date}T00:00:00.000Z`;
const endOfDayIso = (date: string) => `${date}T23:59:59.999Z`;

export function FinancialClosingModule({
  tenantPublicId,
  canManage,
}: {
  tenantPublicId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [periodFrom, setPeriodFrom] = useState(() =>
    startOfDayIso(new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10)),
  );
  const [periodTo, setPeriodTo] = useState(() => endOfDayIso(today()));
  const [selected, setSelected] = useState<string | null>(null);

  const queryKey = ['tenant', tenantPublicId, 'financial-closings'];

  const closings = useQuery({
    queryKey,
    queryFn: () =>
      httpClient.request('/tenant/financial-closings', {
        schema: FinancialClosingListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  const create = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/financial-closings', {
        method: 'POST',
        body: { periodFrom, periodTo },
        schema: FinancialClosingPublicSchema,
        tenantPublicId,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const cancel = useMutation({
    mutationFn: (publicId: string) => {
      const reason = window.prompt('Motivo do cancelamento do fechamento:');
      if (reason === null || reason.trim().length < 3)
        throw new Error('Informe um motivo com pelo menos 3 caracteres.');
      return httpClient.request(`/tenant/financial-closings/${publicId}/cancel`, {
        method: 'POST',
        body: { reason },
        schema: FinancialClosingPublicSchema,
        tenantPublicId,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const selectedClosing = closings.data?.items.find((item) => item.publicId === selected) ?? null;

  return (
    <section className="platform-form" aria-label="Fechamento financeiro">
      <h3>Fechamento financeiro</h3>
      {canManage && (
        <div className="form-actions">
          <input
            type="date"
            value={periodFrom.slice(0, 10)}
            onChange={(event) => {
              setPeriodFrom(startOfDayIso(event.target.value));
            }}
          />
          <input
            type="date"
            value={periodTo.slice(0, 10)}
            onChange={(event) => {
              setPeriodTo(endOfDayIso(event.target.value));
            }}
          />
          <button
            type="button"
            disabled={create.isPending}
            onClick={() => {
              create.mutate();
            }}
          >
            Realizar fechamento do período
          </button>
          {create.error instanceof Error ? (
            <p className="form-error">{create.error.message}</p>
          ) : null}
        </div>
      )}

      {closings.isPending ? <p>Carregando…</p> : null}
      {closings.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar os fechamentos.</p>
      ) : null}
      {closings.data !== undefined && (
        <ul>
          {closings.data.items.map((item) => (
            <li key={item.publicId}>
              {`${new Date(item.periodFrom).toLocaleDateString('pt-BR')} a ${new Date(item.periodTo).toLocaleDateString('pt-BR')} — recebido: ${formatMoney(item.totalReceivedCents)} — saldo: ${formatMoney(item.balanceCents)} — ${item.status === 'ACTIVE' ? 'ativo' : 'cancelado'}`}
              <button
                type="button"
                onClick={() => {
                  setSelected(item.publicId);
                }}
              >
                Detalhes
              </button>
              {item.status === 'ACTIVE' && canManage && (
                <button
                  type="button"
                  disabled={cancel.isPending}
                  onClick={() => {
                    cancel.mutate(item.publicId);
                  }}
                >
                  Cancelar
                </button>
              )}
            </li>
          ))}
          {closings.data.items.length === 0 && <li>Nenhum fechamento realizado ainda.</li>}
        </ul>
      )}
      {cancel.error instanceof Error ? <p className="form-error">{cancel.error.message}</p> : null}

      {selectedClosing !== null && (
        <div className="printable-receipt">
          <h4>{`Fechamento ${new Date(selectedClosing.periodFrom).toLocaleDateString('pt-BR')} a ${new Date(selectedClosing.periodTo).toLocaleDateString('pt-BR')}`}</h4>
          <p>{`Status: ${selectedClosing.status === 'ACTIVE' ? 'ativo' : `cancelado (${selectedClosing.canceledReason ?? ''})`}`}</p>
          <p>{`Fechado em: ${new Date(selectedClosing.closedAt).toLocaleString('pt-BR')} por ${selectedClosing.closedByEmail ?? 'desconhecido'}`}</p>
          <p>{`Total recebido: ${formatMoney(selectedClosing.totalReceivedCents)}`}</p>
          <p>{`Total cancelado/estornado: ${formatMoney(selectedClosing.totalCanceledCents)}`}</p>
          <p>{`Sinais recebidos: ${formatMoney(selectedClosing.depositTotalCents)}`}</p>
          <p>{`Entradas manuais no caixa: ${formatMoney(selectedClosing.manualInCents)}`}</p>
          <p>{`Saídas manuais no caixa: ${formatMoney(selectedClosing.manualOutCents)}`}</p>
          <p>{`Movimentação líquida do caixa: ${formatMoney(selectedClosing.cashMovementsNetCents)}`}</p>
          <p>{`Comissões geradas: ${formatMoney(selectedClosing.commissionsTotalCents)}`}</p>
          <p>{`Saldo consolidado: ${formatMoney(selectedClosing.balanceCents)}`}</p>
          <h5>Por forma de pagamento</h5>
          <ul>
            {selectedClosing.paymentMethodBreakdown.map((item) => (
              <li key={item.paymentMethodPublicId}>
                {`${item.paymentMethodName}: ${formatMoney(item.totalCents)} (${String(item.count)} pagamentos)`}
              </li>
            ))}
            {selectedClosing.paymentMethodBreakdown.length === 0 && (
              <li>Nenhum pagamento no período.</li>
            )}
          </ul>
          <button
            type="button"
            onClick={() => {
              setSelected(null);
            }}
          >
            Fechar detalhes
          </button>
        </div>
      )}
    </section>
  );
}
