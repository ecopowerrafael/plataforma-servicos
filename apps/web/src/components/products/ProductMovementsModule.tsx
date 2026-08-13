import { ProductListResponseSchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { StockMovementList } from './StockMovementList.js';
import { httpClient } from '../../lib/http.js';
import { PageHeader } from '../ui/AppUi.js';

export function ProductMovementsModule({ tenantPublicId }: { tenantPublicId: string }) {
  const [product, setProduct] = useState('');
  const products = useQuery({
    queryKey: ['tenant', tenantPublicId, 'products', 'movement-filter'],
    queryFn: () =>
      httpClient.request('/tenant/products?limit=100', {
        schema: ProductListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  return (
    <section className="sessions-panel product-movements">
      <PageHeader
        eyebrow="Estoque"
        title="Movimentações"
        description="Entradas, saídas, ajustes e vendas registradas no estoque."
      />
      <label className="product-movement-filter">
        Produto
        <select
          value={product}
          onChange={(event) => {
            setProduct(event.target.value);
          }}
        >
          <option value="">Todos os produtos</option>
          {products.data?.items.map((item) => (
            <option key={item.publicId} value={item.publicId}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <StockMovementList
        key={product}
        tenantPublicId={tenantPublicId}
        showProduct
        {...(product === '' ? {} : { productPublicId: product })}
      />
    </section>
  );
}
