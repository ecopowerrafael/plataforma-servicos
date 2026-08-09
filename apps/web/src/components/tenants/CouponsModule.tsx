import { CouponListResponseSchema, CouponPublicSchema } from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';

const formatMoney = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;

export function CouponsModule({
  tenantPublicId,
  canManage,
}: {
  tenantPublicId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'FIXED' | 'PERCENTAGE'>('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState('10');
  const [maxUses, setMaxUses] = useState('');
  const [maxUsesPerCustomer, setMaxUsesPerCustomer] = useState('1');

  const queryKey = ['tenant', tenantPublicId, 'coupons'];

  const coupons = useQuery({
    queryKey,
    queryFn: () =>
      httpClient.request('/tenant/coupons', { schema: CouponListResponseSchema, tenantPublicId }),
    retry: false,
  });

  const create = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/coupons', {
        method: 'POST',
        body: {
          code,
          discountType,
          discountValue: Number(discountValue),
          active: true,
          maxUses: maxUses.trim() === '' ? null : Number(maxUses),
          maxUsesPerCustomer: maxUsesPerCustomer.trim() === '' ? null : Number(maxUsesPerCustomer),
        },
        schema: CouponPublicSchema,
        tenantPublicId,
      }),
    onSuccess: () => {
      setCode('');
      setDiscountValue('10');
      setMaxUses('');
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const toggleActive = useMutation({
    mutationFn: (item: {
      publicId: string;
      discountType: 'FIXED' | 'PERCENTAGE';
      discountValue: number;
      active: boolean;
      maxUses: number | null;
      maxUsesPerCustomer: number | null;
    }) =>
      httpClient.request(`/tenant/coupons/${item.publicId}`, {
        method: 'PATCH',
        body: {
          discountType: item.discountType,
          discountValue: item.discountValue,
          active: !item.active,
          maxUses: item.maxUses,
          maxUsesPerCustomer: item.maxUsesPerCustomer,
        },
        schema: CouponPublicSchema,
        tenantPublicId,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  return (
    <section className="platform-form" aria-label="Cupons de desconto">
      <h3>Cupons de desconto</h3>
      {coupons.isPending ? <p>Carregando…</p> : null}
      {coupons.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar os cupons.</p>
      ) : null}
      {coupons.data !== undefined && (
        <ul>
          {coupons.data.items.map((item) => (
            <li key={item.publicId}>
              {`${item.code} — ${
                item.discountType === 'PERCENTAGE'
                  ? `${String(item.discountValue)}%`
                  : formatMoney(item.discountValue)
              } — usos: ${String(item.usageCount)}${item.maxUses === null ? '' : `/${String(item.maxUses)}`} — ${item.active ? 'ativo' : 'inativo'}`}
              {canManage && (
                <button
                  type="button"
                  disabled={toggleActive.isPending}
                  onClick={() => {
                    toggleActive.mutate(item);
                  }}
                >
                  {item.active ? 'Desativar' : 'Ativar'}
                </button>
              )}
            </li>
          ))}
          {coupons.data.items.length === 0 && <li>Nenhum cupom cadastrado.</li>}
        </ul>
      )}
      {canManage && (
        <div className="form-actions">
          <input
            placeholder="Código (ex.: BEMVINDO10)"
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
            }}
          />
          <select
            value={discountType}
            onChange={(event) => {
              setDiscountType(event.target.value as 'FIXED' | 'PERCENTAGE');
            }}
          >
            <option value="PERCENTAGE">Percentual</option>
            <option value="FIXED">Valor fixo (centavos)</option>
          </select>
          <input
            type="number"
            min="1"
            placeholder="Valor do desconto"
            value={discountValue}
            onChange={(event) => {
              setDiscountValue(event.target.value);
            }}
          />
          <input
            type="number"
            min="1"
            placeholder="Limite total de usos (opcional)"
            value={maxUses}
            onChange={(event) => {
              setMaxUses(event.target.value);
            }}
          />
          <input
            type="number"
            min="1"
            placeholder="Limite por cliente (opcional)"
            value={maxUsesPerCustomer}
            onChange={(event) => {
              setMaxUsesPerCustomer(event.target.value);
            }}
          />
          <button
            type="button"
            disabled={create.isPending || code.trim() === '' || discountValue.trim() === ''}
            onClick={() => {
              create.mutate();
            }}
          >
            Criar cupom
          </button>
          {create.error instanceof Error ? (
            <p className="form-error">{create.error.message}</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
