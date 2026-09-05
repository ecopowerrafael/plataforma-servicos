import { ProductListResponseSchema, TenantUnitsResponseSchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { StockMovementDrawer } from './StockMovementDrawer.js';
import { StockStatusBadge } from './StockStatusBadge.js';
import { httpClient } from '../../lib/http.js';
import { UnitSelect } from '../tenants/UnitSelect.js';
import { EmptyState, ListSkeleton, PageHeader, PageToolbar, Pagination } from '../ui/AppUi.js';

/** Painel de reposição: parte de "estoque baixo", sempre filtrado no backend. */
export function ProductStockModule({
  tenantPublicId,
  canManage,
}: {
  tenantPublicId: string;
  canManage: boolean;
}) {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [stock, setStock] = useState('low');
  const [unit, setUnit] = useState('');
  const [moving, setMoving] = useState<{ publicId: string; name: string } | null>(null);
  const query = new URLSearchParams({ page: String(page), limit: '20', active: 'true' });
  if (stock !== '') query.set('stock', stock);
  if (unit !== '') query.set('unitPublicId', unit);
  const products = useQuery({
    queryKey: ['tenant', tenantPublicId, 'products', 'stock-view', query.toString()],
    queryFn: () =>
      httpClient.request(`/tenant/products?${query.toString()}`, {
        schema: ProductListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const units = useQuery({
    queryKey: ['tenant', tenantPublicId, 'units'],
    queryFn: () =>
      httpClient.request('/tenant/units', {
        schema: TenantUnitsResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const multiUnit = (units.data?.units ?? []).filter((item) => item.status === 'ACTIVE').length > 1;
  const items = products.data?.items ?? [];
  return (
    <section className="sessions-panel product-catalog">
      <PageHeader
        eyebrow="Estoque"
        title="Situação do estoque"
        description="Acompanhe o que precisa de reposição e o que já está zerado."
      />
      <PageToolbar>
        <label>
          Situação
          <select
            value={stock}
            onChange={(event) => {
              setPage(1);
              setStock(event.target.value);
            }}
          >
            <option value="">Todos</option>
            <option value="in">Em estoque</option>
            <option value="low">Estoque baixo</option>
            <option value="out">Sem estoque</option>
          </select>
        </label>
        {multiUnit && (
          <label>
            Unidade
            <UnitSelect
              tenantPublicId={tenantPublicId}
              value={unit}
              onChange={(value) => {
                setPage(1);
                setUnit(value);
              }}
              onlyActive
            />
          </label>
        )}
      </PageToolbar>
      {products.isPending ? (
        <ListSkeleton rows={5} />
      ) : items.length === 0 ? (
        <EmptyState
          title="Nada para repor por aqui"
          description="Nenhum produto ativo se enquadra nesta situação de estoque."
        />
      ) : (
        <>
          <div className="product-catalog-list">
            {items.map((product) => (
              <div key={product.publicId} className="product-catalog-row product-stock-row">
                <button
                  className="product-identity"
                  type="button"
                  onClick={() => void navigate(`/app/produtos/${product.publicId}`)}
                >
                  <strong>{product.name}</strong>
                  <small>{product.categoryName ?? 'Sem categoria'}</small>
                </button>
                <span className="product-stock">
                  <strong>{product.stockQuantity}</strong>
                  <small>mínimo {product.stockMinimumQuantity}</small>
                </span>
                <StockStatusBadge status={product.stockStatus} />
                {canManage && (
                  <button
                    className="secondary-button button--sm"
                    type="button"
                    onClick={() => {
                      setMoving({ publicId: product.publicId, name: product.name });
                    }}
                  >
                    Movimentar
                  </button>
                )}
              </div>
            ))}
          </div>
          <Pagination
            page={products.data?.page.page ?? 1}
            totalPages={products.data?.page.totalPages ?? 1}
            onPrevious={() => {
              setPage((value) => value - 1);
            }}
            onNext={() => {
              setPage((value) => value + 1);
            }}
          />
        </>
      )}
      {moving !== null && (
        <StockMovementDrawer
          tenantPublicId={tenantPublicId}
          productPublicId={moving.publicId}
          productName={moving.name}
          defaultUnitPublicId={unit}
          onClose={() => {
            setMoving(null);
          }}
        />
      )}
    </section>
  );
}
