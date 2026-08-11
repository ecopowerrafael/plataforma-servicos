import { LoyaltyRuleListResponseSchema, LoyaltyRulePublicSchema } from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';

const typeLabels: Record<string, string> = { POINTS: 'Pontos', CASHBACK: 'Cashback' };

export function LoyaltyModule({
  tenantPublicId,
  canManage,
}: {
  tenantPublicId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const queryKey = ['tenant', tenantPublicId, 'loyalty', 'rules'];

  const rules = useQuery({
    queryKey,
    queryFn: () =>
      httpClient.request('/tenant/loyalty/rules', {
        schema: LoyaltyRuleListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  return (
    <section className="platform-form loyalty-module" aria-label="Fidelidade (pontos e cashback)">
      <div className="module-header"><div><p className="eyebrow">Relacionamento</p><h3>Programa de fidelidade</h3><p>Configure pontos e cashback para incentivar novas compras.</p></div></div>
      {rules.isPending ? <p>Carregando…</p> : null}
      {rules.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar as regras de fidelidade.</p>
      ) : null}
      {rules.data?.items.map((rule) => (
        <LoyaltyRuleForm
          key={rule.type}
          tenantPublicId={tenantPublicId}
          canManage={canManage}
          rule={rule}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey });
          }}
        />
      ))}
    </section>
  );
}

function LoyaltyRuleForm({
  tenantPublicId,
  canManage,
  rule,
  onSaved,
}: {
  tenantPublicId: string;
  canManage: boolean;
  rule: {
    type: 'POINTS' | 'CASHBACK';
    active: boolean;
    earnRate: number;
    minEligibleAmountCents: string;
    redeemRateCentsPerPoint: number | null;
    expirationDays: number | null;
  };
  onSaved: () => void;
}) {
  const [active, setActive] = useState(rule.active);
  const [earnRate, setEarnRate] = useState(String(rule.earnRate));
  const [minEligibleAmountCents, setMinEligibleAmountCents] = useState(rule.minEligibleAmountCents);
  const [redeemRateCentsPerPoint, setRedeemRateCentsPerPoint] = useState(
    rule.redeemRateCentsPerPoint === null ? '' : String(rule.redeemRateCentsPerPoint),
  );
  const [expirationDays, setExpirationDays] = useState(
    rule.expirationDays === null ? '' : String(rule.expirationDays),
  );

  const save = useMutation({
    mutationFn: () =>
      httpClient.request(`/tenant/loyalty/rules/${rule.type}`, {
        method: 'PUT',
        body: {
          active,
          earnRate: Number(earnRate),
          minEligibleAmountCents: Number(minEligibleAmountCents),
          redeemRateCentsPerPoint:
            redeemRateCentsPerPoint.trim() === '' ? null : Number(redeemRateCentsPerPoint),
          expirationDays: expirationDays.trim() === '' ? null : Number(expirationDays),
        },
        schema: LoyaltyRulePublicSchema,
        tenantPublicId,
      }),
    onSuccess: onSaved,
  });

  return (
    <article className="info-card loyalty-card" aria-label={typeLabels[rule.type] ?? rule.type}>
      <h4>{typeLabels[rule.type] ?? rule.type}</h4>
      <p>{rule.type === 'POINTS' ? 'Clientes acumulam pontos a cada compra e podem resgatá-los depois.' : 'Defina uma recompensa comercial para incentivar o retorno dos clientes.'}</p>
      {canManage && (
        <form
          className="form-actions"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <label>
            <input
              type="checkbox"
              role="switch"
              checked={active}
              onChange={(event) => {
                setActive(event.target.checked);
              }}
            />
            {`Ativar ${typeLabels[rule.type]?.toLowerCase() ?? rule.type}`}
          </label>
          <label>
            {rule.type === 'POINTS'
              ? 'Pontos ganhos por R$1 gasto'
              : 'Cashback em pontos-base (500 = 5%)'}
            <input
              type="number"
              min="1"
              value={earnRate}
              onChange={(event) => {
                setEarnRate(event.target.value);
              }}
            />
          </label>
          <label>
            Valor mínimo elegível (centavos)
            <input
              type="number"
              min="0"
              value={minEligibleAmountCents}
              onChange={(event) => {
                setMinEligibleAmountCents(event.target.value);
              }}
            />
          </label>
          {rule.type === 'POINTS' && (
            <label>
              Centavos por ponto no resgate
              <input
                type="number"
                min="1"
                placeholder="ex.: 1"
                value={redeemRateCentsPerPoint}
                onChange={(event) => {
                  setRedeemRateCentsPerPoint(event.target.value);
                }}
              />
            </label>
          )}
          <label>
            Expiração (dias, opcional)
            <input
              type="number"
              min="1"
              placeholder="Sem expiração"
              value={expirationDays}
              onChange={(event) => {
                setExpirationDays(event.target.value);
              }}
            />
          </label>
          <button type="submit" disabled={save.isPending}>
            Salvar
          </button>
          {save.error instanceof Error ? <p className="form-error">{save.error.message}</p> : null}
        </form>
      )}
    </article>
  );
}
