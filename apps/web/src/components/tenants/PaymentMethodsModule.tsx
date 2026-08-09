import { PaymentMethodListResponseSchema, PaymentMethodPublicSchema } from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';

const typeLabels: Record<string, string> = {
  CASH: 'Dinheiro',
  PIX: 'Pix',
  DEBIT_CARD: 'Cartão de débito',
  CREDIT_CARD: 'Cartão de crédito',
  BANK_TRANSFER: 'Transferência',
  OTHER: 'Outro',
};

export function PaymentMethodsModule({
  tenantPublicId,
  canManage,
}: {
  tenantPublicId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [type, setType] = useState('CASH');
  const [sortOrder, setSortOrder] = useState('0');

  const queryKey = ['tenant', tenantPublicId, 'payment-methods'];

  const methods = useQuery({
    queryKey,
    queryFn: () =>
      httpClient.request('/tenant/payment-methods', {
        schema: PaymentMethodListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  const create = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/payment-methods', {
        method: 'POST',
        body: { name, type, sortOrder: Number(sortOrder) },
        schema: PaymentMethodPublicSchema,
        tenantPublicId,
      }),
    onSuccess: () => {
      setName('');
      setSortOrder('0');
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const toggleActive = useMutation({
    mutationFn: (input: { publicId: string; active: boolean }) =>
      httpClient.request(`/tenant/payment-methods/${input.publicId}`, {
        method: 'PATCH',
        body: { active: !input.active },
        schema: PaymentMethodPublicSchema,
        tenantPublicId,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  return (
    <section className="platform-form" aria-label="Formas de pagamento">
      <h3>Formas de pagamento</h3>
      {methods.isPending ? <p>Carregando…</p> : null}
      {methods.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar as formas de pagamento.</p>
      ) : null}
      {methods.data !== undefined && (
        <ul>
          {methods.data.items.map((item) => (
            <li key={item.publicId}>
              {`${item.name} (${typeLabels[item.type] ?? item.type}) — ordem ${String(item.sortOrder)} — ${item.active ? 'ativa' : 'inativa'}`}
              {canManage && (
                <button
                  type="button"
                  disabled={toggleActive.isPending}
                  onClick={() => {
                    toggleActive.mutate({ publicId: item.publicId, active: item.active });
                  }}
                >
                  {item.active ? 'Desativar' : 'Ativar'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <div className="form-actions">
          <input
            placeholder="Nome"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
          <select
            value={type}
            onChange={(event) => {
              setType(event.target.value);
            }}
          >
            {Object.entries(typeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="0"
            placeholder="Ordem"
            value={sortOrder}
            onChange={(event) => {
              setSortOrder(event.target.value);
            }}
          />
          <button
            type="button"
            disabled={create.isPending || name === ''}
            onClick={() => {
              create.mutate();
            }}
          >
            Adicionar forma de pagamento
          </button>
          {create.error instanceof Error ? (
            <p className="form-error">{create.error.message}</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
