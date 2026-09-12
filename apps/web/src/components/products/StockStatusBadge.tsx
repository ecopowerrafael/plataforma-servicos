import { type ProductStockStatus } from '@plataforma/shared';

import { stockStatusLabel } from './product-format.js';

const modifier: Record<ProductStockStatus, string> = {
  IN_STOCK: 'ds-badge--success',
  LOW_STOCK: 'ds-badge--warning',
  OUT_OF_STOCK: 'ds-badge--danger',
};

/** Situação de estoque sempre com texto, nunca apenas cor. */
export function StockStatusBadge({ status }: { status: ProductStockStatus }) {
  return <span className={`ds-badge ${modifier[status]}`}>{stockStatusLabel[status]}</span>;
}
