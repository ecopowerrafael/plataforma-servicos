import { LoyaltyRuleListResponseSchema, LoyaltyRulePublicSchema } from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';
import { EmptyState, ListSkeleton, PageHeader, StatusBadge } from '../ui/AppUi.js';

interface LoyaltyRule {
  type: 'POINTS' | 'CASHBACK';
  active: boolean;
  earnRate: number;
  minEligibleAmountCents: string;
  redeemRateCentsPerPoint: number | null;
  expirationDays: number | null;
}

const typeLabels: Record<string, string> = { POINTS: 'Pontos', CASHBACK: 'Cashback' };
const money = (cents: string | number) =>
  (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const percent = (basisPoints: number) =>
  `${(basisPoints / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
const expiration = (days: number | null) =>
  days === null ? 'Sem expiração' : `Expira em ${String(days)} dias`;

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
    <section className="sessions-panel loyalty-module" aria-label="Programa de fidelidade">
      <PageHeader
        eyebrow="Relacionamento"
        title="Programa de fidelidade"
        description="Configure pontos e cashback para incentivar novas compras."
      />
      {rules.isPending ? (
        <ListSkeleton rows={2} />
      ) : rules.error instanceof Error ? (
        <EmptyState
          title="Não foi possível carregar as regras de fidelidade."
          description="Tente novamente."
          action={<button onClick={() => void rules.refetch()}>Tentar novamente</button>}
        />
      ) : (rules.data?.items.length ?? 0) === 0 ? (
        <EmptyState
          title="Programa de fidelidade ainda não configurado"
          description="Quando as regras estiverem disponíveis, pontos e cashback aparecem aqui."
        />
      ) : (
        <div className="loyalty-grid">
          {rules.data?.items.map((rule) => (
            <LoyaltyRuleCard
              key={rule.type}
              tenantPublicId={tenantPublicId}
              canManage={canManage}
              rule={rule}
              onSaved={() => {
                void queryClient.invalidateQueries({ queryKey });
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** Resumo por padrão; os campos só aparecem ao editar a regra. */
function LoyaltyRuleCard({
  tenantPublicId,
  canManage,
  rule,
  onSaved,
}: {
  tenantPublicId: string;
  canManage: boolean;
  rule: LoyaltyRule;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const label = typeLabels[rule.type] ?? rule.type;
  const isPoints = rule.type === 'POINTS';
  const summary = isPoints
    ? [
        `${String(rule.earnRate)} ${rule.earnRate === 1 ? 'ponto' : 'pontos'} a cada R$ 1,00`,
        rule.redeemRateCentsPerPoint === null
          ? 'Resgate não configurado'
          : `Cada ponto vale ${money(rule.redeemRateCentsPerPoint)}`,
        `Valor mínimo: ${money(rule.minEligibleAmountCents)}`,
        expiration(rule.expirationDays),
      ]
    : [
        `${percent(rule.earnRate)} de cashback`,
        `Valor mínimo: ${money(rule.minEligibleAmountCents)}`,
        expiration(rule.expirationDays),
      ];
  return (
    <article className="app-card loyalty-card" aria-label={label}>
      <header>
        <strong>{label}</strong>
        <StatusBadge active={rule.active}>{rule.active ? 'Ativo' : 'Inativo'}</StatusBadge>
      </header>
      {editing ? (
        <LoyaltyRuleForm
          tenantPublicId={tenantPublicId}
          rule={rule}
          onCancel={() => {
            setEditing(false);
          }}
          onSaved={() => {
            setEditing(false);
            onSaved();
          }}
        />
      ) : (
        <>
          <ul className="loyalty-summary">
            {summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {canManage && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setEditing(true);
              }}
            >
              Editar regra
            </button>
          )}
        </>
      )}
    </article>
  );
}

function LoyaltyRuleForm({
  tenantPublicId,
  rule,
  onCancel,
  onSaved,
}: {
  tenantPublicId: string;
  rule: LoyaltyRule;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const isPoints = rule.type === 'POINTS';
  const [active, setActive] = useState(rule.active);
  // Pontos: quantidade por real. Cashback: percentual — o backend segue em pontos-base.
  const [earn, setEarn] = useState(
    isPoints ? String(rule.earnRate) : String(rule.earnRate / 100),
  );
  const [minAmount, setMinAmount] = useState(String(Number(rule.minEligibleAmountCents) / 100));
  const [redeemRate, setRedeemRate] = useState(
    rule.redeemRateCentsPerPoint === null ? '' : String(rule.redeemRateCentsPerPoint / 100),
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
          earnRate: isPoints
            ? Math.round(Number(earn) || 0)
            : Math.round((Number(earn) || 0) * 100),
          minEligibleAmountCents: Math.round((Number(minAmount) || 0) * 100),
          redeemRateCentsPerPoint:
            redeemRate.trim() === '' ? null : Math.round((Number(redeemRate) || 0) * 100),
          expirationDays: expirationDays.trim() === '' ? null : Number(expirationDays),
        },
        schema: LoyaltyRulePublicSchema,
        tenantPublicId,
      }),
    onSuccess: onSaved,
  });
  return (
    <form
      className="loyalty-form"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <label className="ds-switch-field">
        <input
          className="ds-switch"
          role="switch"
          type="checkbox"
          checked={active}
          onChange={(event) => {
            setActive(event.target.checked);
          }}
        />
        {`Ativar ${(typeLabels[rule.type] ?? rule.type).toLowerCase()}`}
      </label>
      <div className="loyalty-form-grid">
        <label>
          {isPoints ? 'Pontos por R$ 1,00' : 'Cashback (%)'}
          <input
            min={isPoints ? '1' : '0.01'}
            step={isPoints ? '1' : '0.01'}
            type="number"
            value={earn}
            onChange={(event) => {
              setEarn(event.target.value);
            }}
          />
        </label>
        {isPoints && (
          <label>
            Valor de cada ponto no resgate
            <input
              min="0.01"
              step="0.01"
              type="number"
              placeholder="R$ 0,01"
              value={redeemRate}
              onChange={(event) => {
                setRedeemRate(event.target.value);
              }}
            />
          </label>
        )}
        <label>
          Valor mínimo da compra
          <input
            min="0"
            step="0.01"
            type="number"
            value={minAmount}
            onChange={(event) => {
              setMinAmount(event.target.value);
            }}
          />
          <small>{money(Math.round((Number(minAmount) || 0) * 100))}</small>
        </label>
        <label>
          Expiração (dias)
          <input
            min="1"
            type="number"
            placeholder="Sem expiração"
            value={expirationDays}
            onChange={(event) => {
              setExpirationDays(event.target.value);
            }}
          />
        </label>
      </div>
      {save.error instanceof Error && (
        <p className="form-error" role="alert">
          {save.error.message}
        </p>
      )}
      <div className="loyalty-form-actions">
        <button className="primary-button" disabled={save.isPending} type="submit">
          {save.isPending ? 'Salvando…' : 'Salvar regra'}
        </button>
        <button className="secondary-button" type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
