import { CreateStockMovementRequestSchema, StockMovementPublicSchema } from '@plataforma/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';
import { UnitSelect } from '../tenants/UnitSelect.js';

const types = [
  ['ENTRY', 'Entrada', 'Confirmar entrada'],
  ['MANUAL_EXIT', 'Saída', 'Confirmar saída'],
  ['POSITIVE_ADJUSTMENT', 'Ajuste positivo', 'Confirmar ajuste'],
  ['NEGATIVE_ADJUSTMENT', 'Ajuste negativo', 'Confirmar ajuste'],
] as const;

/**
 * Toda alteração operacional de saldo passa por aqui: o backend grava a
 * movimentação e o saldo na mesma transação.
 */
export function StockMovementDrawer({
  tenantPublicId,
  productPublicId,
  productName,
  defaultUnitPublicId = '',
  onClose,
}: {
  tenantPublicId: string;
  productPublicId: string;
  productName: string;
  defaultUnitPublicId?: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<(typeof types)[number][0]>('ENTRY');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  const [unit, setUnit] = useState(defaultUnitPublicId);
  const [validation, setValidation] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/stock-movements', {
        method: 'POST',
        tenantPublicId,
        schema: StockMovementPublicSchema,
        body: CreateStockMovementRequestSchema.parse({
          type,
          productPublicId,
          unitPublicId: unit,
          quantity,
          ...(reason.trim() === '' ? {} : { reason: reason.trim() }),
        }),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'products'] }),
        queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'product'] }),
        queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'product-stock'] }),
        queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'stock-movements'] }),
        queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'product-summary'] }),
      ]);
      onClose();
    },
  });
  const confirmLabel = types.find(([id]) => id === type)?.[2] ?? 'Confirmar';
  const submit = () => {
    if (unit === '') {
      setValidation('Selecione a unidade da movimentação.');
      return;
    }
    if (type !== 'ENTRY' && reason.trim().length < 3) {
      setValidation('Informe o motivo da movimentação.');
      return;
    }
    setValidation(null);
    create.mutate();
  };
  return (
    <div className="app-drawer product-movement-drawer" role="dialog" aria-label="Movimentar estoque">
      <div className="drawer-header">
        <h3>Movimentar estoque</h3>
        <button className="secondary-button" type="button" onClick={onClose}>
          Fechar
        </button>
      </div>
      <p className="muted">{productName}</p>
      <label>
        Tipo
        <select
          value={type}
          onChange={(event) => {
            setType(event.target.value as (typeof types)[number][0]);
          }}
        >
          {types.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Quantidade
        <input
          min="1"
          type="number"
          value={quantity}
          onChange={(event) => {
            setQuantity(event.target.value);
          }}
        />
      </label>
      <label>
        Motivo{type === 'ENTRY' ? ' (opcional)' : ''}
        <input
          value={reason}
          placeholder="Ex.: Compra de fornecedor"
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
      </label>
      <label>
        Unidade
        <UnitSelect
          tenantPublicId={tenantPublicId}
          value={unit}
          onChange={setUnit}
          includeAllOption={false}
          onlyActive
        />
      </label>
      {validation !== null && (
        <p className="form-error" role="alert">
          {validation}
        </p>
      )}
      {create.error instanceof Error && (
        <p className="form-error" role="alert">
          {create.error.message}
        </p>
      )}
      <button className="primary-button" disabled={create.isPending} type="button" onClick={submit}>
        {create.isPending ? 'Registrando…' : confirmLabel}
      </button>
    </div>
  );
}
