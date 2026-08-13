import { StockMovementListResponseSchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { dateTime, movementIncreases, movementTypeLabel } from './product-format.js';
import { httpClient } from '../../lib/http.js';
import { UnitSelect } from '../tenants/UnitSelect.js';
import { EmptyState, ListSkeleton, PageToolbar, Pagination } from '../ui/AppUi.js';

/** Histórico operacional; todos os filtros são resolvidos no backend. */
export function StockMovementList({
  tenantPublicId,
  productPublicId,
  showFilters = true,
  showProduct = false,
  limit = 20,
}: {
  tenantPublicId: string;
  productPublicId?: string;
  showFilters?: boolean;
  showProduct?: boolean;
  limit?: number;
}) {
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [unit, setUnit] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const movements = useQuery({
    queryKey: [
      'tenant',
      tenantPublicId,
      'stock-movements',
      { productPublicId, page, type, unit, from, to, limit },
    ],
    queryFn: () => {
      const query = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (productPublicId !== undefined) query.set('productPublicId', productPublicId);
      if (type !== '') query.set('type', type);
      if (unit !== '') query.set('unitPublicId', unit);
      if (from !== '') query.set('from', new Date(`${from}T00:00:00`).toISOString());
      if (to !== '') query.set('to', new Date(`${to}T23:59:59`).toISOString());
      return httpClient.request(`/tenant/stock-movements?${query.toString()}`, {
        schema: StockMovementListResponseSchema,
        tenantPublicId,
      });
    },
    retry: false,
  });
  const items = movements.data?.items ?? [];
  return (
    <div className="stock-movement-list">
      {showFilters && (
        <PageToolbar>
          <label>
            Tipo
            <select
              value={type}
              onChange={(event) => {
                setPage(1);
                setType(event.target.value);
              }}
            >
              <option value="">Todos</option>
              {Object.entries(movementTypeLabel).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Unidade
            <UnitSelect
              tenantPublicId={tenantPublicId}
              value={unit}
              onChange={(value) => {
                setPage(1);
                setUnit(value);
              }}
            />
          </label>
          <label>
            De
            <input
              type="date"
              value={from}
              onChange={(event) => {
                setPage(1);
                setFrom(event.target.value);
              }}
            />
          </label>
          <label>
            Até
            <input
              type="date"
              value={to}
              onChange={(event) => {
                setPage(1);
                setTo(event.target.value);
              }}
            />
          </label>
        </PageToolbar>
      )}
      {movements.isPending ? (
        <ListSkeleton rows={5} />
      ) : movements.error instanceof Error ? (
        <EmptyState
          title="Não foi possível carregar as movimentações."
          description="Tente novamente."
          action={<button onClick={() => void movements.refetch()}>Tentar novamente</button>}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="Nenhuma movimentação registrada"
          description="Entradas, saídas e ajustes de estoque aparecem aqui com data, responsável e motivo."
        />
      ) : (
        <>
          <ul className="movement-rows">
            {items.map((movement) => {
              const positive = movementIncreases(movement.type);
              return (
                <li key={movement.publicId}>
                  <span className={`movement-delta ${positive ? 'is-in' : 'is-out'}`}>
                    {positive ? '+' : '−'}
                    {movement.quantity}
                  </span>
                  <span className="movement-body">
                    <strong>
                      {movement.salePublicId === null
                        ? movementTypeLabel[movement.type]
                        : 'Venda'}
                      {showProduct ? ` · ${movement.productName}` : ''}
                    </strong>
                    <small>
                      {movement.saleCustomerName ?? movement.reason ?? 'Sem motivo informado'}
                    </small>
                    <small>
                      {movement.unitName}
                      {movement.relatedUnitName === null ? '' : ` → ${movement.relatedUnitName}`} ·
                      saldo {movement.previousQuantity} → {movement.resultingQuantity}
                    </small>
                  </span>
                  <span className="movement-meta">
                    <small>{dateTime(movement.createdAt)}</small>
                    {movement.responsibleName !== null && (
                      <small>{movement.responsibleName}</small>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <Pagination
            page={movements.data?.page.page ?? 1}
            totalPages={movements.data?.page.totalPages ?? 1}
            onPrevious={() => {
              setPage((value) => value - 1);
            }}
            onNext={() => {
              setPage((value) => value + 1);
            }}
          />
        </>
      )}
    </div>
  );
}
