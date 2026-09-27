import { type ProductStockStatus } from '@plataforma/shared';

export const money = (cents: string | number) =>
  (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const stockStatusLabel: Record<ProductStockStatus, string> = {
  IN_STOCK: 'Em estoque',
  LOW_STOCK: 'Estoque baixo',
  OUT_OF_STOCK: 'Sem estoque',
};

export const movementTypeLabel = {
  ENTRY: 'Entrada',
  MANUAL_EXIT: 'Saída',
  POSITIVE_ADJUSTMENT: 'Ajuste positivo',
  NEGATIVE_ADJUSTMENT: 'Ajuste negativo',
  TRANSFER_OUT: 'Transferência enviada',
  TRANSFER_IN: 'Transferência recebida',
} as const;

export type MovementType = keyof typeof movementTypeLabel;

export const movementIncreases = (type: MovementType) =>
  type === 'ENTRY' || type === 'POSITIVE_ADJUSTMENT' || type === 'TRANSFER_IN';

export const dateTime = (value: string) =>
  new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

/** Margem só é exibida quando custo e preço de venda existem de verdade. */
export function margin(costCents: string, saleCents: string): number | null {
  const cost = Number(costCents);
  const sale = Number(saleCents);
  if (!Number.isFinite(cost) || !Number.isFinite(sale) || cost <= 0 || sale <= 0) return null;
  return ((sale - cost) / sale) * 100;
}
