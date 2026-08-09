import {
  CreateProductCategoryRequestSchema,
  CreateProductRequestSchema,
  CreateProductSaleRequestSchema,
  CustomerListResponseSchema,
  PaymentMethodListResponseSchema,
  ProductCategoryListResponseSchema,
  ProductCategoryPublicSchema,
  ProductListResponseSchema,
  ProductPublicSchema,
  ProductSaleListResponseSchema,
  ProductSalePublicSchema,
  ProductStockListResponseSchema,
  ProfessionalListResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { UnitSelect } from './UnitSelect.js';
import { httpClient } from '../../lib/http.js';

export function ProductInventoryModule({
  tenantPublicId,
  canManage,
  canSell,
}: {
  tenantPublicId: string;
  canManage: boolean;
  canSell: boolean;
}) {
  const cache = useQueryClient();
  const [unit, setUnit] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [product, setProduct] = useState({
    name: '',
    salePriceCents: '',
    commissionType: '',
    commissionValue: '',
  });
  const [sale, setSale] = useState({
    productPublicId: '',
    quantity: '1',
    customerPublicId: '',
    professionalPublicId: '',
    paymentMethodPublicId: '',
  });
  const categories = useQuery({
    queryKey: ['products-categories', tenantPublicId],
    queryFn: () =>
      httpClient.request('/tenant/product-categories', {
        schema: ProductCategoryListResponseSchema,
        tenantPublicId,
      }),
  });
  const products = useQuery({
    queryKey: ['products', tenantPublicId],
    queryFn: () =>
      httpClient.request('/tenant/products', { schema: ProductListResponseSchema, tenantPublicId }),
  });
  const stocks = useQuery({
    queryKey: ['product-stock', tenantPublicId, unit],
    queryFn: () =>
      httpClient.request(`/tenant/product-stock${unit === '' ? '' : `?unitPublicId=${unit}`}`, {
        schema: ProductStockListResponseSchema,
        tenantPublicId,
      }),
  });
  const sales = useQuery({
    queryKey: ['product-sales', tenantPublicId, unit],
    queryFn: () =>
      httpClient.request(`/tenant/product-sales${unit === '' ? '' : `?unitPublicId=${unit}`}`, {
        schema: ProductSaleListResponseSchema,
        tenantPublicId,
      }),
  });
  const customers = useQuery({
    queryKey: ['sale-customers', tenantPublicId],
    queryFn: () =>
      httpClient.request('/tenant/customers?limit=100&active=true', {
        schema: CustomerListResponseSchema,
        tenantPublicId,
      }),
    enabled: canSell,
  });
  const professionals = useQuery({
    queryKey: ['sale-professionals', tenantPublicId],
    queryFn: () =>
      httpClient.request('/tenant/professionals?limit=100&active=true', {
        schema: ProfessionalListResponseSchema,
        tenantPublicId,
      }),
    enabled: canSell,
  });
  const methods = useQuery({
    queryKey: ['sale-payment-methods', tenantPublicId],
    queryFn: () =>
      httpClient.request('/tenant/payment-methods', {
        schema: PaymentMethodListResponseSchema,
        tenantPublicId,
      }),
    enabled: canSell,
  });
  const refresh = () => cache.invalidateQueries({ queryKey: ['products'] });
  const refreshAll = () =>
    Promise.all([
      cache.invalidateQueries({ queryKey: ['product-stock'] }),
      cache.invalidateQueries({ queryKey: ['product-sales'] }),
    ]);
  const createCategory = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/product-categories', {
        method: 'POST',
        tenantPublicId,
        schema: ProductCategoryPublicSchema,
        body: CreateProductCategoryRequestSchema.parse({ name: categoryName }),
      }),
    onSuccess: () => {
      setCategoryName('');
      return cache.invalidateQueries({ queryKey: ['products-categories'] });
    },
  });
  const createProduct = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/products', {
        method: 'POST',
        tenantPublicId,
        schema: ProductPublicSchema,
        body: CreateProductRequestSchema.parse({
          name: product.name,
          salePriceCents: product.salePriceCents,
          costPriceCents: '0',
          commissionType: product.commissionType || null,
          commissionValue: product.commissionValue || null,
        }),
      }),
    onSuccess: refresh,
  });
  const createSale = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/product-sales', {
        method: 'POST',
        tenantPublicId,
        schema: ProductSalePublicSchema,
        body: CreateProductSaleRequestSchema.parse({
          unitPublicId: unit,
          customerPublicId: sale.customerPublicId || null,
          professionalPublicId: sale.professionalPublicId || null,
          paymentMethodPublicId: sale.paymentMethodPublicId,
          items: [{ productPublicId: sale.productPublicId, quantity: sale.quantity }],
        }),
      }),
    onSuccess: refreshAll,
  });
  return (
    <section className="sessions-panel">
      <p className="eyebrow">Estoque e produtos</p>
      <h2>Catálogo, alertas e vendas</h2>
      <label>
        Unidade
        <UnitSelect tenantPublicId={tenantPublicId} value={unit} onChange={setUnit} />
      </label>
      {canManage && (
        <>
          <div className="filter-row">
            <input
              placeholder="Nova categoria"
              value={categoryName}
              onChange={(e) => {
                setCategoryName(e.target.value);
              }}
            />
            <button
              onClick={() => {
                createCategory.mutate();
              }}
            >
              Criar categoria
            </button>
          </div>
          <div className="filter-row">
            <input
              placeholder="Produto"
              value={product.name}
              onChange={(e) => {
                setProduct({ ...product, name: e.target.value });
              }}
            />
            <input
              placeholder="Preço em centavos"
              value={product.salePriceCents}
              onChange={(e) => {
                setProduct({ ...product, salePriceCents: e.target.value });
              }}
            />
            <select
              value={product.commissionType}
              onChange={(e) => {
                setProduct({ ...product, commissionType: e.target.value });
              }}
            >
              <option value="">Sem comissão</option>
              <option value="PERCENTAGE">Percentual</option>
              <option value="FIXED">Fixa</option>
            </select>
            <input
              placeholder="Comissão"
              value={product.commissionValue}
              onChange={(e) => {
                setProduct({ ...product, commissionValue: e.target.value });
              }}
            />
            <button
              onClick={() => {
                createProduct.mutate();
              }}
            >
              Criar produto
            </button>
          </div>
        </>
      )}
      <h3>Saldos e alertas</h3>
      <ul>
        {stocks.data?.items.map((stock) => {
          const item = products.data?.items.find(
            (candidate) => candidate.publicId === stock.productPublicId,
          );
          return (
            <li key={stock.publicId}>
              {item?.name ?? stock.productPublicId}: {stock.quantity}
              {stock.lowStock ? ' — estoque mínimo atingido' : ''}
            </li>
          );
        })}
      </ul>
      {canSell && (
        <>
          <h3>Registrar venda</h3>
          <div className="filter-row">
            <select
              value={sale.productPublicId}
              onChange={(e) => {
                setSale({ ...sale, productPublicId: e.target.value });
              }}
            >
              <option value="">Produto</option>
              {products.data?.items.map((x) => (
                <option key={x.publicId} value={x.publicId}>
                  {x.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="1"
              value={sale.quantity}
              onChange={(e) => {
                setSale({ ...sale, quantity: e.target.value });
              }}
            />
            <select
              value={sale.customerPublicId}
              onChange={(e) => {
                setSale({ ...sale, customerPublicId: e.target.value });
              }}
            >
              <option value="">Sem cliente</option>
              {customers.data?.items.map((x) => (
                <option key={x.publicId} value={x.publicId}>
                  {x.name}
                </option>
              ))}
            </select>
            <select
              value={sale.professionalPublicId}
              onChange={(e) => {
                setSale({ ...sale, professionalPublicId: e.target.value });
              }}
            >
              <option value="">Sem profissional</option>
              {professionals.data?.items.map((x) => (
                <option key={x.publicId} value={x.publicId}>
                  {x.publicName}
                </option>
              ))}
            </select>
            <select
              value={sale.paymentMethodPublicId}
              onChange={(e) => {
                setSale({ ...sale, paymentMethodPublicId: e.target.value });
              }}
            >
              <option value="">Forma de pagamento</option>
              {methods.data?.items.map((x) => (
                <option key={x.publicId} value={x.publicId}>
                  {x.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                createSale.mutate();
              }}
              disabled={unit === ''}
            >
              Concluir venda
            </button>
          </div>
        </>
      )}
      <h3>Histórico de vendas</h3>
      <ul>
        {sales.data?.items.map((item) => (
          <li key={item.publicId}>
            {new Date(item.createdAt).toLocaleString('pt-BR')} · R${' '}
            {(Number(item.totalCents) / 100).toFixed(2)} ·{' '}
            {item.items
              .map((saleItem) => `${saleItem.productName} × ${String(saleItem.quantity)}`)
              .join(', ')}
          </li>
        ))}
      </ul>
      <small>
        {categories.data?.items.length ?? 0} categorias · {products.data?.items.length ?? 0}{' '}
        produtos
      </small>
    </section>
  );
}
