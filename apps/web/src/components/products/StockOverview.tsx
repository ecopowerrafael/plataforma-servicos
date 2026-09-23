import {
  ProductStockListResponseSchema,
  ProductStockPublicSchema,
  SetMinimumStockRequestSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { StockStatusBadge } from './StockStatusBadge.js';
import { httpClient } from '../../lib/http.js';
import { EmptyState, ListSkeleton } from '../ui/AppUi.js';

/** Saldo por unidade e estoque mínimo — o mínimo é gravado sem tocar no saldo. */
export function StockOverview({
  tenantPublicId,
  productPublicId,
  canManage,
}: {
  tenantPublicId: string;
  productPublicId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [minimum, setMinimum] = useState('0');
  const stock = useQuery({
    queryKey: ['tenant', tenantPublicId, 'product-stock', productPublicId],
    queryFn: () =>
      httpClient.request(`/tenant/product-stock?productPublicId=${productPublicId}`, {
        schema: ProductStockListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const save = useMutation({
    mutationFn: (unitPublicId: string) =>
      httpClient.request(
        `/tenant/products/${productPublicId}/units/${unitPublicId}/minimum-stock`,
        {
          method: 'PATCH',
          tenantPublicId,
          schema: ProductStockPublicSchema,
          body: SetMinimumStockRequestSchema.parse({ minimumQuantity: minimum }),
        },
      ),
    onSuccess: async () => {
      setEditing(null);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['tenant', tenantPublicId, 'product-stock', productPublicId],
        }),
        queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'product'] }),
        queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'products'] }),
      ]);
    },
  });
  if (stock.isPending) return <ListSkeleton rows={3} />;
  const items = stock.data?.items ?? [];
  if (items.length === 0)
    return (
      <EmptyState
        title="Sem saldo registrado"
        description="Registre uma entrada em Movimentar estoque para começar a controlar o saldo deste produto."
      />
    );
  return (
    <ul className="stock-unit-list">
      {items.map((item) => (
        <li key={item.publicId} className="app-card stock-unit-row">
          <div>
            <strong>{item.unitName}</strong>
            <StockStatusBadge status={item.status} />
          </div>
          <dl className="platform-details">
            <div>
              <dt>Saldo atual</dt>
              <dd>{item.quantity}</dd>
            </div>
            <div>
              <dt>Estoque mínimo</dt>
              <dd>{item.minimumQuantity}</dd>
            </div>
          </dl>
          {canManage &&
            (editing === item.unitPublicId ? (
              <div className="stock-minimum-edit">
                <input
                  min="0"
                  type="number"
                  value={minimum}
                  onChange={(event) => {
                    setMinimum(event.target.value);
                  }}
                />
                <button
                  className="primary-button button--sm"
                  disabled={save.isPending}
                  type="button"
                  onClick={() => {
                    save.mutate(item.unitPublicId);
                  }}
                >
                  Salvar
                </button>
                <button
                  className="secondary-button button--sm"
                  type="button"
                  onClick={() => {
                    setEditing(null);
                  }}
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                className="secondary-button button--sm"
                type="button"
                onClick={() => {
                  setMinimum(String(item.minimumQuantity));
                  setEditing(item.unitPublicId);
                }}
              >
                Definir estoque mínimo
              </button>
            ))}
        </li>
      ))}
    </ul>
  );
}
