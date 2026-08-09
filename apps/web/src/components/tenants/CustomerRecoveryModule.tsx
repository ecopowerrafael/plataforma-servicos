import {
  RecoveryEligibleListResponseSchema,
  RecoveryExecutionListResponseSchema,
  RecoveryRuleListResponseSchema,
  RecoveryRulePublicSchema,
  RecoveryRuleSchema,
  RecoveryRunResponseSchema,
  type UpdateRecoveryRule,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';

const labels = {
  INACTIVE: 'Cliente inativo',
  CANCELED_NO_REBOOK: 'Cancelou e não reagendou',
  NO_SHOW_NO_REBOOK: 'Não compareceu e não reagendou',
  POST_SERVICE_NO_RETURN: 'Pós-atendimento sem retorno',
  BIRTHDAY: 'Aniversário',
} as const;
type Rule = keyof typeof labels;

export function CustomerRecoveryModule({
  tenantPublicId,
  canManage,
}: {
  tenantPublicId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [selectedRule, setSelectedRule] = useState<Rule>('INACTIVE');
  const rules = useQuery({
    queryKey: ['tenant', tenantPublicId, 'customer-recovery'],
    queryFn: () =>
      httpClient.request('/tenant/customer-recovery', {
        schema: RecoveryRuleListResponseSchema,
        tenantPublicId,
      }),
  });
  const eligible = useQuery({
    queryKey: ['tenant', tenantPublicId, 'customer-recovery', 'eligible', selectedRule],
    queryFn: () =>
      httpClient.request(`/tenant/customer-recovery/eligible?rule=${selectedRule}`, {
        schema: RecoveryEligibleListResponseSchema,
        tenantPublicId,
      }),
  });
  const executions = useQuery({
    queryKey: ['tenant', tenantPublicId, 'customer-recovery', 'executions'],
    queryFn: () =>
      httpClient.request('/tenant/customer-recovery/executions', {
        schema: RecoveryExecutionListResponseSchema,
        tenantPublicId,
      }),
  });
  const save = useMutation({
    mutationFn: ({ rule, input }: { rule: Rule; input: UpdateRecoveryRule }) =>
      httpClient.request(`/tenant/customer-recovery/${rule}`, {
        method: 'PUT',
        body: input,
        schema: RecoveryRulePublicSchema,
        tenantPublicId,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['tenant', tenantPublicId, 'customer-recovery'],
      });
    },
  });
  const run = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/customer-recovery/run', {
        method: 'POST',
        body: {},
        schema: RecoveryRunResponseSchema,
        tenantPublicId,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['tenant', tenantPublicId, 'customer-recovery'],
      });
    },
  });
  return (
    <section className="platform-form" aria-label="Recuperação de clientes">
      <h3>Recuperação de clientes</h3>
      {rules.data?.items.map((item) => (
        <div className="form-row" key={item.rule}>
          <strong>{labels[item.rule]}</strong>
          <label>
            <input
              type="checkbox"
              checked={item.active}
              disabled={!canManage}
              onChange={(event) => {
                save.mutate({
                  rule: item.rule,
                  input: { active: event.target.checked, days: item.days },
                });
              }}
            />{' '}
            Ativa
          </label>
          <label>
            Dias{' '}
            <input
              type="number"
              min={1}
              max={730}
              defaultValue={item.days}
              disabled={!canManage || item.rule === 'BIRTHDAY'}
              onBlur={(event) => {
                save.mutate({
                  rule: item.rule,
                  input: { active: item.active, days: Number(event.target.value) },
                });
              }}
            />
          </label>
        </div>
      ))}
      {canManage ? (
        <button
          type="button"
          disabled={run.isPending}
          onClick={() => {
            run.mutate();
          }}
        >
          Executar agora
        </button>
      ) : null}
      <label>
        Visualizar elegíveis
        <select
          value={selectedRule}
          onChange={(event) => {
            setSelectedRule(RecoveryRuleSchema.parse(event.target.value));
          }}
        >
          {Object.entries(labels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <p>{eligible.data?.items.length ?? 0} cliente(s) elegível(is).</p>
      {eligible.data?.items.map((item) => (
        <p key={item.customerPublicId}>
          {item.name}
          {item.referenceAt === null
            ? ''
            : ` — referência ${new Date(item.referenceAt).toLocaleDateString('pt-BR')}`}
        </p>
      ))}
      <h4>Execuções recentes</h4>
      {executions.data?.items.slice(0, 20).map((item) => (
        <p key={item.publicId}>
          {labels[item.rule]} — {item.status} — {new Date(item.createdAt).toLocaleString('pt-BR')}
        </p>
      ))}
    </section>
  );
}
