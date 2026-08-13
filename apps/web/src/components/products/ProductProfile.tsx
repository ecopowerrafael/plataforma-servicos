import {
  CreateProductRequestSchema,
  ProductCategoryListResponseSchema,
  ProductPublicSchema,
  ProductRemovalResponseSchema,
  ProductSaleListResponseSchema,
  ProductStatusResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type ZodType } from 'zod';

import { dateTime, margin, money } from './product-format.js';
import { ProductForm, type ProductSubmission } from './ProductForm.js';
import { ProductImageUpload } from './ProductImageUpload.js';
import { StockMovementDrawer } from './StockMovementDrawer.js';
import { StockMovementList } from './StockMovementList.js';
import { StockOverview } from './StockOverview.js';
import { StockStatusBadge } from './StockStatusBadge.js';
import { httpClient } from '../../lib/http.js';
import { ConfirmationDialog } from '../ConfirmationDialog.js';
import { TenantServiceImage } from '../services/TenantServiceImage.js';
import { EmptyState, ListSkeleton, StatusBadge } from '../ui/AppUi.js';

type Tab = 'overview' | 'stock' | 'movements' | 'sales';

export function ProductProfile({
  tenantPublicId,
  publicId,
  canManage,
  canReadSales,
}: {
  tenantPublicId: string;
  publicId: string;
  canManage: boolean;
  canReadSales: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const detail = useQuery({
    queryKey: ['tenant', tenantPublicId, 'product', publicId],
    queryFn: () =>
      httpClient.request(`/tenant/products/${publicId}`, {
        schema: ProductPublicSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const categories = useQuery({
    queryKey: ['tenant', tenantPublicId, 'product-categories'],
    queryFn: () =>
      httpClient.request('/tenant/product-categories', {
        schema: ProductCategoryListResponseSchema,
        tenantPublicId,
      }),
    enabled: editing,
    retry: false,
  });
  const sales = useQuery({
    queryKey: ['tenant', tenantPublicId, 'product-sales', publicId],
    queryFn: () =>
      httpClient.request(`/tenant/product-sales?productPublicId=${publicId}`, {
        schema: ProductSaleListResponseSchema,
        tenantPublicId,
      }),
    enabled: canReadSales,
    retry: false,
  });
  const mutate = useMutation({
    mutationFn: ({
      url,
      method,
      body,
      schema,
    }: {
      url: string;
      method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
      body?: unknown;
      schema?: ZodType;
    }) =>
      httpClient.request(url, {
        method,
        ...(body === undefined ? {} : { body }),
        schema: schema ?? ProductPublicSchema,
        tenantPublicId,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['tenant', tenantPublicId, 'product', publicId],
        }),
        queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'products'] }),
      ]);
    },
  });
  const remove = useMutation({
    mutationFn: () =>
      httpClient.request(`/tenant/products/${publicId}`, {
        method: 'DELETE',
        schema: ProductRemovalResponseSchema,
        tenantPublicId,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['tenant', tenantPublicId, 'product', publicId],
        }),
        queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'products'] }),
        queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'product-summary'] }),
      ]);
    },
  });
  if (detail.isPending)
    return (
      <section className="sessions-panel">
        <ListSkeleton rows={6} />
      </section>
    );
  if (detail.error instanceof Error || detail.data === undefined)
    return (
      <section className="sessions-panel">
        <EmptyState
          title="Não foi possível carregar este produto."
          description="Ele pode não existir ou não estar disponível neste estabelecimento."
          action={<button onClick={() => void navigate('/app/produtos')}>Voltar aos produtos</button>}
        />
      </section>
    );
  const product = detail.data;
  const productMargin = margin(product.costPriceCents, product.salePriceCents);
  const save = (value: ProductSubmission) =>
    mutate
      .mutateAsync({
        url: `/tenant/products/${publicId}`,
        method: 'PATCH',
        body: CreateProductRequestSchema.parse(value),
      })
      .then(() => {
        setEditing(false);
      });
  const changeStatus = (active: boolean) =>
    mutate.mutateAsync({
      url: `/tenant/products/${publicId}/${active ? 'activate' : 'deactivate'}`,
      method: 'POST',
      schema: ProductStatusResponseSchema,
    });
  const saleItems = (sales.data?.items ?? []).flatMap((sale) =>
    sale.items
      .filter((item) => item.productPublicId === publicId)
      .map((item) => ({ sale, item })),
  );
  const tabs: [Tab, string][] = [
    ['overview', 'Visão geral'],
    ['stock', 'Estoque'],
    ['movements', 'Movimentações'],
  ];
  if (canReadSales && saleItems.length > 0) tabs.push(['sales', 'Vendas']);
  return (
    <section className="sessions-panel product-profile">
      <button className="crm-back-button" onClick={() => void navigate('/app/produtos')}>
        ← Produtos
      </button>
      <header className="product-profile-header">
        <span className="product-thumb product-thumb--lg">
          {product.imageUrl === null ? (
            <i aria-hidden="true">{product.name.slice(0, 1).toUpperCase()}</i>
          ) : (
            <TenantServiceImage
              alt={product.imageAlt ?? product.name}
              kind="products"
              servicePublicId={product.publicId}
              tenantPublicId={tenantPublicId}
            />
          )}
        </span>
        <div>
          <div className="product-profile-title">
            <h2>{product.name}</h2>
            <StatusBadge active={product.active}>
              {product.active ? 'Ativo' : 'Arquivado'}
            </StatusBadge>
            <StockStatusBadge status={product.stockStatus} />
          </div>
          <p>
            {money(product.salePriceCents)} · {product.stockQuantity} em estoque ·{' '}
            {product.categoryName ?? 'Sem categoria'}
          </p>
        </div>
        {canManage && (
          <div className="crm-quick-actions">
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                setMoving(true);
              }}
            >
              Movimentar estoque
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setEditing(true);
              }}
            >
              Editar
            </button>
            <div className="product-actions-menu">
              <button
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                className="secondary-button"
                type="button"
                onClick={() => {
                  setMenuOpen((value) => !value);
                }}
              >
                •••
              </button>
              {menuOpen && (
                <div className="product-actions-dropdown" role="menu">
                  {product.active ? (
                    <button
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        void changeStatus(false);
                      }}
                    >
                      Desativar
                    </button>
                  ) : (
                    <button
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        void changeStatus(true);
                      }}
                    >
                      Restaurar
                    </button>
                  )}
                  <button
                    className="is-danger"
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirmRemoval(true);
                    }}
                  >
                    Arquivar/Excluir
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </header>
      <nav className="crm-tabs">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => {
              setTab(id);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === 'overview' && (
        <div className="product-profile-grid">
          <article className="app-card">
            <p className="ds-eyebrow">Preços</p>
            <dl className="platform-details">
              <div>
                <dt>Preço de venda</dt>
                <dd>{money(product.salePriceCents)}</dd>
              </div>
              <div>
                <dt>Preço de custo</dt>
                <dd>
                  {Number(product.costPriceCents) > 0
                    ? money(product.costPriceCents)
                    : 'Não informado'}
                </dd>
              </div>
              {productMargin !== null && (
                <div>
                  <dt>Margem</dt>
                  <dd>{productMargin.toFixed(1).replace('.', ',')}%</dd>
                </div>
              )}
            </dl>
          </article>
          <article className="app-card">
            <p className="ds-eyebrow">Identificação</p>
            <dl className="platform-details">
              <div>
                <dt>Categoria</dt>
                <dd>{product.categoryName ?? 'Sem categoria'}</dd>
              </div>
              <div>
                <dt>SKU</dt>
                <dd>{product.sku ?? 'Não informado'}</dd>
              </div>
              <div>
                <dt>Código de barras</dt>
                <dd>{product.barcode ?? 'Não informado'}</dd>
              </div>
            </dl>
          </article>
          <article className="app-card">
            <p className="ds-eyebrow">Descrição</p>
            <p>{product.description ?? 'Sem descrição cadastrada.'}</p>
          </article>
          {canManage && (
            <article className="app-card">
              <ProductImageUpload
                busy={mutate.isPending}
                hasImage={product.imageUrl !== null}
                onUpload={async (file) => {
                  const body = new FormData();
                  body.set('file', file, file.name);
                  await mutate.mutateAsync({
                    url: `/tenant/products/${publicId}/image`,
                    method: 'PUT',
                    body,
                  });
                }}
                onRemove={() =>
                  mutate
                    .mutateAsync({ url: `/tenant/products/${publicId}/image`, method: 'DELETE' })
                    .then(() => undefined)
                }
              />
            </article>
          )}
        </div>
      )}
      {tab === 'stock' && (
        <StockOverview
          tenantPublicId={tenantPublicId}
          productPublicId={publicId}
          canManage={canManage}
        />
      )}
      {tab === 'movements' && (
        <StockMovementList tenantPublicId={tenantPublicId} productPublicId={publicId} />
      )}
      {tab === 'sales' && (
        <ul className="product-sale-rows">
          {saleItems.map(({ sale, item }) => (
            <li key={item.publicId} className="app-card">
              <strong>{money(item.totalCents)}</strong>
              <small>
                {item.quantity} × {money(item.unitPriceCents)}
              </small>
              <small>{dateTime(sale.createdAt)}</small>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <div className="app-drawer">
          <div className="drawer-header">
            <h3>Editar produto</h3>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setEditing(false);
              }}
            >
              Fechar
            </button>
          </div>
          <ProductForm
            busy={mutate.isPending}
            error={mutate.error instanceof Error ? mutate.error.message : null}
            product={product}
            categories={categories.data?.items ?? []}
            onSave={save}
          />
        </div>
      )}
      {confirmRemoval && (
        <ConfirmationDialog
          request={{
            title: 'Arquivar ou excluir produto',
            description: [
              'Se este produto nunca foi vendido nem movimentado, ele será excluído definitivamente.',
              'Caso já tenha histórico, será arquivado: sai do catálogo, mas continua nas vendas e movimentações antigas e pode ser restaurado depois.',
              product.stockQuantity > 0
                ? `Atenção: ainda existem ${String(product.stockQuantity)} unidades em estoque. O saldo é preservado como está.`
                : '',
            ]
              .filter((line) => line !== '')
              .join(' '),
            confirmLabel: 'Arquivar ou excluir',
            requiresReason: false,
            variant: 'danger',
            onConfirm: async () => {
              const result = await remove.mutateAsync();
              if (result.deleted) void navigate('/app/produtos');
            },
          }}
          onClose={() => {
            setConfirmRemoval(false);
          }}
        />
      )}
      {moving && (
        <StockMovementDrawer
          tenantPublicId={tenantPublicId}
          productPublicId={publicId}
          productName={product.name}
          onClose={() => {
            setMoving(false);
          }}
        />
      )}
    </section>
  );
}
