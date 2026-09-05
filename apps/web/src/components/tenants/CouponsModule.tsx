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
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);

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
      setIsCreatorOpen(false);
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
    <section className="platform-form coupon-module" aria-label="Cupons de desconto">
      <div className="module-header">
        <div><p className="eyebrow">Marketing</p><h3>Cupons de desconto</h3><p>Crie incentivos para primeira compra, retorno e campanhas.</p></div>
        {canManage && <button type="button" className="primary-button" onClick={() => { setIsCreatorOpen(true); }}>Novo cupom</button>}
      </div>
      {coupons.isPending ? <p>Carregando…</p> : null}
      {coupons.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar os cupons.</p>
      ) : null}
      {coupons.data !== undefined && (
        <ul className="coupon-list">
          {coupons.data.items.map((item) => (
            <li key={item.publicId} className="coupon-item">
              <div><strong>{item.code}</strong><span>{item.discountType === 'PERCENTAGE' ? `${String(item.discountValue)}% de desconto` : formatMoney(item.discountValue)}</span><small>{`Usos: ${String(item.usageCount)}${item.maxUses === null ? '' : ` de ${String(item.maxUses)}`}`}</small></div>
              <span className={`status-badge ${item.active ? 'status-active' : 'status-muted'}`}>{item.active ? 'Ativo' : 'Inativo'}</span>
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
          {coupons.data.items.length === 0 && <li className="empty-state"><strong>Nenhum cupom cadastrado</strong><span>Crie o primeiro cupom para uma campanha comercial.</span></li>}
        </ul>
      )}
      {canManage && isCreatorOpen && (
        <form className="app-drawer form-actions" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
          <div className="drawer-header"><div><p className="eyebrow">Novo cupom</p><h4>Defina a oferta</h4></div><button type="button" className="secondary-button" onClick={() => { setIsCreatorOpen(false); }}>Fechar</button></div>
          <label>Código do cupom<input
            placeholder="Código (ex.: BEMVINDO10)"
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
            }}
          /></label>
          <label>Tipo de desconto<select
            value={discountType}
            onChange={(event) => {
              setDiscountType(event.target.value as 'FIXED' | 'PERCENTAGE');
            }}
          >
            <option value="PERCENTAGE">Percentual</option>
            <option value="FIXED">Valor fixo (centavos)</option>
          </select></label>
          <label>Valor do desconto<input
            type="number"
            min="1"
            placeholder="Valor do desconto"
            value={discountValue}
            onChange={(event) => {
              setDiscountValue(event.target.value);
            }}
          /></label>
          <label>Limite total de usos<input
            type="number"
            min="1"
            placeholder="Limite total de usos (opcional)"
            value={maxUses}
            onChange={(event) => {
              setMaxUses(event.target.value);
            }}
          /></label>
          <label>Limite por cliente<input
            type="number"
            min="1"
            placeholder="Limite por cliente (opcional)"
            value={maxUsesPerCustomer}
            onChange={(event) => {
              setMaxUsesPerCustomer(event.target.value);
            }}
          /></label>
          <button
            type="submit"
            disabled={create.isPending || code.trim() === '' || discountValue.trim() === ''}
          >
            Criar cupom
          </button>
          {create.error instanceof Error ? (
            <p className="form-error">{create.error.message}</p>
          ) : null}
        </form>
      )}
    </section>
  );
}
