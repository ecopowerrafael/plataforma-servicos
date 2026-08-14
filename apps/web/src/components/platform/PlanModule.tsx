import {
  CommercialPlanPublicSchema,
  PlanListResponseSchema,
  SuccessResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';

import { httpClient } from '../../lib/http.js';
import { ConfirmationDialog, type ConfirmationRequest } from '../ConfirmationDialog.js';
import { PlanEditForm, type PlanFormSubmission } from './PlanEditForm.js';

const PlanDetailResponseSchema = z.object({ plan: CommercialPlanPublicSchema });

function displayLimitValue(limit: z.infer<typeof CommercialPlanPublicSchema>['limits'][number]) {
  if (limit.integerValue !== null) return limit.integerValue;
  if (limit.booleanValue !== null) return String(limit.booleanValue);
  return limit.stringValue ?? '';
}

export function PlanModule() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [billingCycle, setBillingCycle] = useState('');
  const [visibility, setVisibility] = useState('');
  const [orderBy, setOrderBy] = useState('createdAt');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const client = useQueryClient();
  const plans = useQuery({
    queryKey: ['platform', 'plans', page, status, billingCycle, visibility, orderBy, direction],
    queryFn: () => {
      const query = new URLSearchParams({
        page: String(page),
        limit: '10',
        orderBy,
        direction,
      });
      if (status !== '') query.set('status', status);
      if (billingCycle !== '') query.set('billingCycle', billingCycle);
      if (visibility !== '') query.set('isPublic', visibility);
      return httpClient.request(`/platform/plans?${query.toString()}`, {
        schema: PlanListResponseSchema,
      });
    },
    retry: false,
  });
  const detail = useQuery({
    queryKey: ['platform', 'plan', selected],
    queryFn: () =>
      httpClient.request(`/platform/plans/${selected ?? ''}`, { schema: PlanDetailResponseSchema }),
    enabled: selected !== null,
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: ({
      url,
      body,
      method = 'POST',
      schema = z.looseObject({}),
    }: {
      url: string;
      body?: unknown;
      method?: 'POST' | 'PATCH' | 'DELETE';
      schema?: z.ZodType;
    }) => httpClient.request(url, { method, ...(body === undefined ? {} : { body }), schema }),
    onSuccess: async () => {
      setNotice('Opera\u00e7\u00e3o conclu\u00edda com sucesso.');
      await Promise.all([
        client.invalidateQueries({ queryKey: ['platform', 'plans'] }),
        client.invalidateQueries({ queryKey: ['platform', 'plan', selected] }),
      ]);
    },
  });
  const createPlan = async (value: PlanFormSubmission) => {
    const result = await mutation.mutateAsync({
      url: '/platform/plans',
      body: value,
      schema: PlanDetailResponseSchema,
    });
    const parsed = PlanDetailResponseSchema.parse(result);
    setSelected(parsed.plan.publicId);
    setCreating(false);
  };
  const updatePlan = async (value: PlanFormSubmission) => {
    if (selected === null) return;
    const body = {
      name: value.name,
      subtitle: value.subtitle ?? null,
      shortDescription: value.shortDescription ?? null,
      description: value.description,
      billingCycle: value.billingCycle,
      priceCents: value.priceCents,
      currency: value.currency,
      trialDays: value.trialDays ?? null,
      isPublic: value.isPublic,
      highlighted: value.highlighted,
      badge: value.badge ?? null,
      ctaText: value.ctaText ?? null,
      sortOrder: value.sortOrder,
      limits: value.limits,
    };
    await mutation.mutateAsync({
      url: `/platform/plans/${selected}`,
      body,
      method: 'PATCH',
      schema: PlanDetailResponseSchema,
    });
  };
  const requestAction = (
    label: string,
    suffix: 'activate' | 'deactivate' | 'archive' | 'delete',
    description: string,
  ) => {
    if (selected === null) return;
    setConfirmation({
      title: `${label}?`,
      description,
      confirmLabel: label,
      requiresReason: false,
      variant: suffix === 'archive' || suffix === 'delete' ? 'danger' : 'default',
      onConfirm: async () => {
        await mutation.mutateAsync({
          url: suffix === 'delete' ? `/platform/plans/${selected}` : `/platform/plans/${selected}/${suffix}`,
          ...(suffix === 'delete' ? { method: 'DELETE' as const } : {}),
          schema: SuccessResponseSchema,
        });
      },
    });
  };

  return (
    <section aria-labelledby="plan-title">
      <p className="eyebrow">{'Gest\u00e3o comercial'}</p>
      <h2 id="plan-title">Planos</h2>
      {notice !== null && <p className="success-message">{notice}</p>}
      {mutation.error instanceof Error ? <p className="form-error">{mutation.error.message}</p> : null}
      <div className="form-actions">
        <button
          onClick={() => {
            setCreating((current) => !current);
          }}
          type="button"
        >
          {creating ? 'Fechar cria\u00e7\u00e3o' : 'Criar plano'}
        </button>
      </div>
      {creating && (
        <PlanEditForm
          busy={mutation.isPending}
          error={mutation.error instanceof Error ? mutation.error.message : null}
          onSave={createPlan}
        />
      )}
      <div className="platform-form">
        <label>
          Status
          <select
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value);
            }}
          >
            <option value="">Todos</option>
            <option value="ACTIVE">Ativo</option>
            <option value="INACTIVE">Inativo</option>
            <option value="ARCHIVED">Arquivado</option>
          </select>
        </label>
        <label>
          Ciclo
          <select
            value={billingCycle}
            onChange={(event) => {
              setPage(1);
              setBillingCycle(event.target.value);
            }}
          >
            <option value="">Todos</option>
            <option value="MONTHLY">Mensal</option>
            <option value="QUARTERLY">Trimestral</option>
            <option value="SEMIANNUAL">Semestral</option>
            <option value="ANNUAL">Anual</option>
            <option value="CUSTOM">Personalizado</option>
          </select>
        </label>
        <label>
          Visibilidade
          <select
            value={visibility}
            onChange={(event) => {
              setPage(1);
              setVisibility(event.target.value);
            }}
          >
            <option value="">Todas</option>
            <option value="true">{'P\u00fablico'}</option>
            <option value="false">Interno</option>
          </select>
        </label>
        <label>
          Ordenar por
          <select
            value={orderBy}
            onChange={(event) => {
              setPage(1);
              setOrderBy(event.target.value);
            }}
          >
            <option value="createdAt">{'Cria\u00e7\u00e3o'}</option>
            <option value="name">Nome</option>
            <option value="status">Status</option>
          </select>
        </label>
        <label>
          {'Dire\u00e7\u00e3o'}
          <select
            value={direction}
            onChange={(event) => {
              setPage(1);
              setDirection(event.target.value as 'asc' | 'desc');
            }}
          >
            <option value="desc">Decrescente</option>
            <option value="asc">Crescente</option>
          </select>
        </label>
      </div>
      {plans.isPending ? (
        <p>{'Carregando planos\u2026'}</p>
      ) : plans.error instanceof Error ? (
        <p className="form-error">{'N\u00e3o foi poss\u00edvel carregar os planos.'}</p>
      ) : plans.data === undefined || plans.data.items.length === 0 ? (
        <p>Nenhum plano encontrado.</p>
      ) : (
        <>
          <div className="data-list">
            {plans.data.items.map((plan) => (
              <button
                className="data-row"
                key={plan.publicId}
                onClick={() => {
                  setSelected(plan.publicId);
                  setCreating(false);
                }}
                type="button"
              >
                <span>{plan.name}</span>
                <span>{plan.code}</span>
                <span>{plan.description ?? 'Sem descri\u00e7\u00e3o'}</span>
                <span>{plan.status}</span>
                <span>{`${plan.priceCents} ${plan.currency}`}</span>
                <span>{`${plan.billingCycle} · ${String(plan.trialDays)} dias`}</span>
                <span>{plan.isPublic ? 'P\u00fablico' : 'Interno'}</span>
                <span>{`${String(plan.limits.length)} limites`}</span>
              </button>
            ))}
          </div>
          <div className="form-actions">
            <button
              disabled={page <= 1}
              onClick={() => {
                setPage(page - 1);
              }}
              type="button"
            >
              Anterior
            </button>
            <span>{`P\u00e1gina ${String(plans.data.page.page)} de ${String(plans.data.page.totalPages)}`}</span>
            <button
              disabled={page >= plans.data.page.totalPages}
              onClick={() => {
                setPage(page + 1);
              }}
              type="button"
            >
              {'Pr\u00f3xima'}
            </button>
          </div>
        </>
      )}
      {detail.data !== undefined && (
        <article className="sessions-panel">
          <h3>{detail.data.plan.name}</h3>
          <dl className="platform-details">
            <div>
              <dt>{'C\u00f3digo'}</dt>
              <dd>{detail.data.plan.code}</dd>
            </div>
            <div>
              <dt>{'Descri\u00e7\u00e3o'}</dt>
              <dd>{detail.data.plan.description ?? 'Sem descri\u00e7\u00e3o'}</dd>
            </div>
            <div>
              <dt>{'Pre\u00e7o'}</dt>
              <dd>{`${detail.data.plan.priceCents} ${detail.data.plan.currency}`}</dd>
            </div>
            <div>
              <dt>Ciclo</dt>
              <dd>{detail.data.plan.billingCycle}</dd>
            </div>
            <div>
              <dt>Trial</dt>
              <dd>{`${String(detail.data.plan.trialDays)} dias`}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{detail.data.plan.status}</dd>
            </div>
            <div>
              <dt>Visibilidade</dt>
              <dd>{detail.data.plan.isPublic ? 'P\u00fablico' : 'Interno'}</dd>
            </div>
            <div>
              <dt>{'Cria\u00e7\u00e3o'}</dt>
              <dd>{detail.data.plan.createdAt}</dd>
            </div>
            <div>
              <dt>{'Atualiza\u00e7\u00e3o'}</dt>
              <dd>{detail.data.plan.updatedAt}</dd>
            </div>
          </dl>
          <h4>Limites configurados</h4>
          {detail.data.plan.limits.length === 0 ? (
            <p>Nenhum limite configurado.</p>
          ) : (
            <ul>
              {detail.data.plan.limits.map((limit) => (
                <li key={limit.key}>{`${limit.key}: ${displayLimitValue(limit)}`}</li>
              ))}
            </ul>
          )}
          <PlanEditForm
            busy={mutation.isPending}
            error={mutation.error instanceof Error ? mutation.error.message : null}
            plan={detail.data.plan}
            onSave={updatePlan}
          />
          <div className="form-actions">
            <button
              disabled={mutation.isPending || detail.data.plan.status !== 'INACTIVE'}
              onClick={() => {
                requestAction(
                  'Ativar',
                  'activate',
                  'O plano voltar\u00e1 a ficar dispon\u00edvel.',
                );
              }}
              type="button"
            >
              Ativar
            </button>
            <button
              disabled={mutation.isPending || detail.data.plan.status !== 'ACTIVE'}
              onClick={() => {
                requestAction(
                  'Desativar',
                  'deactivate',
                  'O plano deixar\u00e1 de aceitar novas contrata\u00e7\u00f5es.',
                );
              }}
              type="button"
            >
              Desativar
            </button>
            <button
              disabled={mutation.isPending || detail.data.plan.status === 'ARCHIVED'}
              onClick={() => {
                requestAction(
                  'Arquivar',
                  'archive',
                  'O plano ser\u00e1 arquivado e n\u00e3o poder\u00e1 ser usado em novas assinaturas.',
                );
              }}
              type="button"
            >
              Arquivar
            </button>
            <button
              disabled={mutation.isPending}
              onClick={() => {
                requestAction(
                  'Excluir',
                  'delete',
                  'O plano sera excluido somente se nunca tiver sido usado.',
                );
              }}
              type="button"
            >
              Excluir
            </button>
          </div>
        </article>
      )}
      {confirmation !== null && (
        <ConfirmationDialog
          request={confirmation}
          onClose={() => {
            setConfirmation(null);
          }}
        />
      )}
    </section>
  );
}
