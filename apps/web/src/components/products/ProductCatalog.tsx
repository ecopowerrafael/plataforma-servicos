import {
  CreateProductRequestSchema,
  CreateStockMovementRequestSchema,
  ProductCatalogSummaryResponseSchema,
  ProductCategoryListResponseSchema,
  ProductListResponseSchema,
  ProductPublicSchema,
  StockMovementPublicSchema,
  TenantUnitsResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { money } from './product-format.js';
import { ProductForm, type ProductSubmission } from './ProductForm.js';
import { ProductSaleDrawer } from './ProductSaleDrawer.js';
import { ProductRow } from './ProductUIComponents.js';
import { httpClient } from '../../lib/http.js';
import { UnitSelect } from '../tenants/UnitSelect.js';
import {
  EmptyState,
  ListSkeleton,
  PageHeader,
  PageToolbar,
  Pagination,
  StatusBadge,
} from '../ui/AppUi.js';

export function ProductCatalog({
  tenantPublicId,
  canManage,
  canSell = false,
}: {
  tenantPublicId: string;
  canManage: boolean;
  canSell?: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState('true');
  const [category, setCategory] = useState('');
  const [stock, setStock] = useState('');
  const [unit, setUnit] = useState('');
  const [creating, setCreating] = useState(false);
  const [selling, setSelling] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const query = new URLSearchParams({ page: String(page), limit: '20' });
  if (search.trim() !== '') query.set('search', search.trim());
  if (active !== '') query.set('active', active);
  if (category !== '') query.set('categoryPublicId', category);
  if (stock !== '') query.set('stock', stock);
  if (unit !== '') query.set('unitPublicId', unit);
  const products = useQuery({
    queryKey: ['tenant', tenantPublicId, 'products', query.toString()],
    queryFn: () =>
      httpClient.request(`/tenant/products?${query.toString()}`, {
        schema: ProductListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const summary = useQuery({
    queryKey: ['tenant', tenantPublicId, 'product-summary', unit],
    queryFn: () =>
      httpClient.request(
        `/tenant/products/summary${unit === '' ? '' : `?unitPublicId=${unit}`}`,
        { schema: ProductCatalogSummaryResponseSchema, tenantPublicId },
      ),
    retry: false,
  });
  const categories = useQuery({
    queryKey: ['tenant', tenantPublicId, 'product-categories'],
    queryFn: () =>
      httpClient.request('/tenant/product-categories', {
        schema: ProductCategoryListResponseSchema,
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
  const activeUnits = (units.data?.units ?? []).filter((item) => item.status === 'ACTIVE');
  const multiUnit = activeUnits.length > 1;
  const create = useMutation({
    mutationFn: async ({
      body,
      initialStock,
      image,
    }: {
      body: ProductSubmission;
      initialStock: number;
      image: File | null;
    }) => {
      const product = await httpClient.request('/tenant/products', {
        method: 'POST',
        tenantPublicId,
        schema: ProductPublicSchema,
        body: CreateProductRequestSchema.parse(body),
      });
      const targetUnit = unit === '' ? activeUnits[0]?.publicId : unit;
      // Saldo inicial entra como movimentação, para não divergir do histórico.
      if (initialStock > 0 && targetUnit !== undefined)
        await httpClient.request('/tenant/stock-movements', {
          method: 'POST',
          tenantPublicId,
          schema: StockMovementPublicSchema,
          body: CreateStockMovementRequestSchema.parse({
            type: 'ENTRY',
            productPublicId: product.publicId,
            unitPublicId: targetUnit,
            quantity: initialStock,
            reason: 'Estoque inicial do cadastro.',
          }),
        });
      let imageUploadFailed = false;
      if (image !== null) {
        const imageBody = new FormData();
        imageBody.set('file', image, image.name);
        await httpClient
          .request(`/tenant/products/${product.publicId}/image`, {
            method: 'PUT',
            tenantPublicId,
            schema: ProductPublicSchema,
            body: imageBody,
          })
          .catch(() => {
            imageUploadFailed = true;
          });
      }
      return { product, imageUploadFailed };
    },
    onSuccess: async ({ product, imageUploadFailed }) => {
      await queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'products'] });
      setSelectedImage(null);
      setCreating(false);
      if (imageUploadFailed)
        window.alert(
          'Produto salvo, mas a imagem não pôde ser enviada. Você pode tentar novamente na página de detalhe do produto.',
        );
      void navigate(`/app/produtos/${product.publicId}`);
    },
  });
  const items = products.data?.items ?? [];
  const cards = [
    ['Produtos ativos', summary.data === undefined ? '—' : String(summary.data.activeCount)],
    ['Estoque baixo', summary.data === undefined ? '—' : String(summary.data.lowStockCount)],
    ['Sem estoque', summary.data === undefined ? '—' : String(summary.data.outOfStockCount)],
  ] as const;
  return (
    <section className="sessions-panel product-catalog">
      <PageHeader
        eyebrow="Catálogo"
        title="Produtos"
        description="Gerencie seus produtos, preços e estoque."
        actions={
          <>
            {canSell && (
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setSelling(true);
                }}
              >
                Registrar venda
              </button>
            )}
            {canManage && (
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  setCreating(true);
                }}
              >
                + Novo produto
              </button>
            )}
          </>
        }
      />
      <div className="product-summary-cards">
        {cards.map(([label, value]) => (
          <article key={label} className="app-card product-summary-card">
            <p className="ds-eyebrow">{label}</p>
            <strong>{value}</strong>
          </article>
        ))}
        {summary.data !== undefined && summary.data.stockValueReliable && (
          <article className="app-card product-summary-card">
            <p className="ds-eyebrow">Valor em estoque</p>
            <strong>{money(summary.data.stockValueCents)}</strong>
            <small>Baseado no preço de custo cadastrado.</small>
          </article>
        )}
      </div>
      {creating && (
        <div className="product-create-backdrop" role="presentation">
          <aside
            aria-label="Novo produto"
            aria-modal="true"
            className="product-create-drawer"
            role="dialog"
          >
            <header className="product-create-drawer-header">
              <div>
                <p className="ds-eyebrow">Catálogo</p>
                <h2>Novo produto</h2>
                <span>Cadastre informações, estoque inicial e imagem em um único fluxo.</span>
              </div>
              <button
                aria-label="Fechar cadastro de produto"
                className="platform-drawer-close"
                disabled={create.isPending}
                type="button"
                onClick={() => {
                  setCreating(false);
                  setSelectedImage(null);
                }}
              >
                ×
              </button>
            </header>
            <ProductForm
              busy={create.isPending}
              categories={categories.data?.items ?? []}
              error={create.error instanceof Error ? create.error.message : null}
              selectedImage={selectedImage}
              showInitialStock={activeUnits.length > 0}
              onCancel={() => {
                setCreating(false);
                setSelectedImage(null);
              }}
              onImageChange={setSelectedImage}
              onSave={(body, initialStock) =>
                create.mutateAsync({ body, initialStock, image: selectedImage }).then(() => undefined)
              }
            />
          </aside>
        </div>
      )}
      <PageToolbar>
        <label className="ds-field--wide">
          Busca
          <input
            value={search}
            placeholder="Nome, SKU ou código de barras"
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
          />
        </label>
        <label>
          Estoque
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
        <label>
          Status
          <select
            value={active}
            onChange={(event) => {
              setPage(1);
              setActive(event.target.value);
            }}
          >
            <option value="true">Ativos</option>
            <option value="false">Arquivados</option>
            <option value="">Todos</option>
          </select>
        </label>
        {(categories.data?.items.length ?? 0) > 0 && (
          <label>
            Categoria
            <select
              value={category}
              onChange={(event) => {
                setPage(1);
                setCategory(event.target.value);
              }}
            >
              <option value="">Todas</option>
              {categories.data?.items.map((item) => (
                <option key={item.publicId} value={item.publicId}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
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
      {multiUnit && unit === '' && (
        <p className="muted">O estoque exibido soma todas as unidades ativas.</p>
      )}
      {products.isPending ? (
        <ListSkeleton rows={6} />
      ) : products.error instanceof Error ? (
        <EmptyState
          title="Não foi possível carregar os produtos."
          description="Tente novamente."
          action={<button onClick={() => void products.refetch()}>Tentar novamente</button>}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="Cadastre seu primeiro produto"
          description="Controle produtos vendidos no seu estabelecimento e acompanhe o estoque."
          action={
            canManage ? (
              <button
                className="primary-button"
                onClick={() => {
                  setCreating(true);
                }}
              >
                + Novo produto
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="product-catalog-list">
            {items.map((product) => (
              <ProductRow
                key={product.publicId}
                name={product.name}
                code={product.sku ?? undefined}
                category={product.categoryName ?? 'Sem categoria'}
                price={money(product.salePriceCents)}
                stock={product.stockQuantity}
                status={product.active ? 'active' : 'inactive'}
                imageAlt={product.imageAlt ?? product.name}
                imageUrl={product.imageUrl}
                tenantPublicId={tenantPublicId}
                publicId={product.publicId}
                onClick={() => void navigate(`/app/produtos/${product.publicId}`)}
              />
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
      {selling && (
        <ProductSaleDrawer
          tenantPublicId={tenantPublicId}
          defaultUnitPublicId={unit === '' ? (activeUnits[0]?.publicId ?? '') : unit}
          onClose={() => {
            setSelling(false);
          }}
        />
      )}
    </section>
  );
}
