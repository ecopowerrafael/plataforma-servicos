import {
  ChangePlanRequestSchema,
  CreateSubscriptionRequestSchema,
  ExtendTrialRequestSchema,
  PlanListResponseSchema,
  PlatformTenantListResponseSchema,
  SubscriptionDetailResponseSchema,
  SubscriptionListResponseSchema,
  SubscriptionPublicSchema,
  UpdateSubscriptionRequestSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';

import { httpClient } from '../../lib/http.js';
import { ConfirmationDialog, type ConfirmationRequest } from '../ConfirmationDialog.js';
import { ErrorState, formatCycle, formatDate, formatMoney, formatStatus, PageHeader, Pagination, StatusBadge } from './PlatformUi.js';

const SubscriptionResponseSchema = z.object({ subscription: SubscriptionPublicSchema });
const CreateFormSchema = CreateSubscriptionRequestSchema.extend({ tenantPublicId: z.uuid() });

export function SubscriptionModule() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [planPublicId, setPlanPublicId] = useState('');
  const [tenantPublicId, setTenantPublicId] = useState('');
  const [orderBy, setOrderBy] = useState('createdAt');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createValues, setCreateValues] = useState({
    tenantPublicId: '',
    planPublicId: '',
    billingCycle: '',
    startsAt: '',
    currentPeriodEndsAt: '',
    trial: false,
    reason: '',
  });
  const [changeValues, setChangeValues] = useState({ planPublicId: '', billingCycle: undefined as 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL' | 'CUSTOM' | undefined, reason: '' });
  const [trialValues, setTrialValues] = useState({ trialEndsAt: '', reason: '' });
  const [periodValues, setPeriodValues] = useState({ currentPeriodStartsAt: '', currentPeriodEndsAt: '', reason: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const client = useQueryClient();
  const plans = useQuery({
    queryKey: ['platform', 'plans', 'subscription-options'],
    queryFn: () =>
      httpClient.request('/platform/plans?status=ACTIVE&limit=100', {
        schema: PlanListResponseSchema,
      }),
    retry: false,
  });
  const tenants = useQuery({
    queryKey: ['platform', 'tenants', 'subscription-options'],
    queryFn: () =>
      httpClient.request('/platform/tenants?limit=100', {
        schema: PlatformTenantListResponseSchema,
      }),
    retry: false,
  });
  const tenantNames = new Map(
    (tenants.data?.items ?? []).map((tenant) => [tenant.publicId, tenant.displayName]),
  );
  const createPlan = plans.data?.items.find((plan) => plan.publicId === createValues.planPublicId);
  const createOptions = createPlan?.billingOptions.filter((option) => option.active) ?? [];
  const changePlan = plans.data?.items.find((plan) => plan.publicId === changeValues.planPublicId);
  const changeOptions = changePlan?.billingOptions.filter((option) => option.active) ?? [];
  const subscriptions = useQuery({
    queryKey: [
      'platform',
      'subscriptions',
      page,
      status,
      planPublicId,
      tenantPublicId,
      orderBy,
      direction,
    ],
    queryFn: () => {
      const query = new URLSearchParams({ page: String(page), limit: '10', orderBy, direction });
      if (status !== '') query.set('status', status);
      if (planPublicId !== '') query.set('planPublicId', planPublicId);
      if (tenantPublicId !== '') query.set('tenantPublicId', tenantPublicId);
      return httpClient.request(`/platform/subscriptions?${query.toString()}`, {
        schema: SubscriptionListResponseSchema,
      });
    },
    retry: false,
  });
  const detail = useQuery({
    queryKey: ['platform', 'subscription', selected],
    queryFn: () =>
      httpClient.request(`/platform/subscriptions/${selected ?? ''}?page=1&limit=100`, {
        schema: SubscriptionDetailResponseSchema,
      }),
    enabled: selected !== null,
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: ({
      url,
      body,
      schema = z.looseObject({}),
    }: {
      url: string;
      body: unknown;
      schema?: z.ZodType;
    }) => httpClient.request(url, { method: 'POST', body, schema }),
    onSuccess: async () => {
      setNotice('Opera\u00e7\u00e3o conclu\u00edda com sucesso.');
      await Promise.all([
        client.invalidateQueries({ queryKey: ['platform', 'subscriptions'] }),
        client.invalidateQueries({ queryKey: ['platform', 'subscription', selected] }),
      ]);
    },
  });
  const createSubscription = async () => {
    const parsed = CreateFormSchema.safeParse({
      ...createValues,
      startsAt: createValues.startsAt === '' ? undefined : createValues.startsAt,
      currentPeriodEndsAt:
        createValues.currentPeriodEndsAt === '' ? undefined : createValues.currentPeriodEndsAt,
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Revise os campos informados.');
      return;
    }
    const { tenantPublicId: tenantId, ...body } = parsed.data;
    const result = await mutation.mutateAsync({
      url: `/platform/tenants/${tenantId}/subscriptions`,
      body,
      schema: SubscriptionResponseSchema,
    });
    setSelected(SubscriptionResponseSchema.parse(result).subscription.publicId);
    setCreating(false);
    setFormError(null);
  };
  const confirmChangePlan = () => {
    const parsed = ChangePlanRequestSchema.safeParse(changeValues);
    if (!parsed.success || selected === null) {
      setFormError(
        parsed.success
          ? 'Selecione uma assinatura.'
          : (parsed.error.issues[0]?.message ?? 'Revise os campos informados.'),
      );
      return;
    }
    setConfirmation({
      title: 'Confirmar mudan\u00e7a de plano?',
      description: 'O plano e o snapshot comercial da assinatura ser\u00e3o atualizados.',
      confirmLabel: 'Alterar plano',
      requiresReason: false,
      onConfirm: async () => {
        await mutation.mutateAsync({
          url: `/platform/subscriptions/${selected}/change-plan`,
          body: parsed.data,
          schema: SubscriptionResponseSchema,
        });
      },
    });
  };
  const confirmTrialExtension = () => {
    const parsed = ExtendTrialRequestSchema.safeParse(trialValues);
    if (!parsed.success || selected === null) {
      setFormError(
        parsed.success
          ? 'Selecione uma assinatura.'
          : (parsed.error.issues[0]?.message ?? 'Revise os campos informados.'),
      );
      return;
    }
    if (new Date(parsed.data.trialEndsAt) <= new Date()) {
      setFormError('A nova data de trial deve estar no futuro.');
      return;
    }
    setConfirmation({
      title: 'Confirmar extens\u00e3o de trial?',
      description: 'A data de encerramento do trial ser\u00e1 alterada.',
      confirmLabel: 'Estender trial',
      requiresReason: false,
      onConfirm: async () => {
        await mutation.mutateAsync({
          url: `/platform/subscriptions/${selected}/extend-trial`,
          body: parsed.data,
          schema: SubscriptionResponseSchema,
        });
      },
    });
  };
  const confirmPeriodUpdate = () => {
    const parsed = UpdateSubscriptionRequestSchema.safeParse(periodValues);
    if (!parsed.success || selected === null) {
      setFormError(parsed.success ? 'Selecione uma assinatura.' : (parsed.error.issues[0]?.message ?? 'Revise as datas.'));
      return;
    }
    setConfirmation({
      title: 'Confirmar correcao do periodo?',
      description: 'Somente as datas do periodo comercial atual serao corrigidas.',
      confirmLabel: 'Salvar periodo',
      requiresReason: false,
      onConfirm: async () => {
        await mutation.mutateAsync({ url: `/platform/subscriptions/${selected}/period`, body: parsed.data, schema: SubscriptionResponseSchema });
      },
    });
  };
  const requestStatus = (
    label: string,
    suffix: 'activate' | 'suspend' | 'reactivate' | 'cancel',
    description: string,
  ) => {
    if (selected === null) return;
    setConfirmation({
      title: `${label}?`,
      description,
      confirmLabel: label,
      requiresReason: true,
      variant: suffix === 'cancel' ? 'danger' : 'default',
      onConfirm: async (reason) => {
        await mutation.mutateAsync({
          url: `/platform/subscriptions/${selected}/${suffix}`,
          body: { reason },
          schema: SubscriptionResponseSchema,
        });
      },
    });
  };
  return (
    <section aria-labelledby="subscription-title">
      <PageHeader title="Assinaturas" description="Gerencie planos, periodos, trials e situacao comercial dos estabelecimentos." action={<button onClick={() => { setCreating(true); }} type="button">+ Criar assinatura</button>} />
      {notice !== null && <p className="success-message">{notice}</p>}
      {mutation.error instanceof Error ? <p className="form-error">{mutation.error.message}</p> : null}
      {creating && (
        <><button className="platform-backdrop" aria-label="Fechar" onClick={() => { setCreating(false); }} type="button" /><form
          className="platform-drawer platform-form"
          onSubmit={(event) => {
            event.preventDefault();
            void createSubscription();
          }}
        >
          <h3>Criar assinatura</h3>
          <button className="platform-drawer-close" aria-label="Fechar" onClick={() => { setCreating(false); }} type="button">×</button>
          <label>
            Estabelecimento
            <select
              value={createValues.tenantPublicId}
              onChange={(event) => {
                setCreateValues({ ...createValues, tenantPublicId: event.target.value });
              }}
            >
              <option value="">Selecione um estabelecimento</option>
              {(tenants.data?.items ?? []).map((tenant) => (
                <option key={tenant.publicId} value={tenant.publicId}>
                  {tenant.displayName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Plano
            <select
              value={createValues.planPublicId}
              onChange={(event) => {
                const next = plans.data?.items.find((plan) => plan.publicId === event.target.value);
                setCreateValues({ ...createValues, planPublicId: event.target.value, billingCycle: next?.billingOptions.find((option) => option.active)?.billingCycle ?? '' });
              }}
            >
              <option value="">Selecione um plano</option>
              {(plans.data?.items ?? []).map((plan) => (
                <option key={plan.publicId} value={plan.publicId}>
                  {plan.name}
                </option>
              ))}
            </select>
          </label>
          <label>Opcao de cobranca<select value={createValues.billingCycle} onChange={(event) => { setCreateValues({ ...createValues, billingCycle: event.target.value }); }}>{createOptions.map((option) => <option key={option.publicId} value={option.billingCycle}>{`${formatCycle(option.billingCycle)} - ${formatMoney(option.priceCents, createPlan?.currency)}`}</option>)}</select></label>
          <label>
            {'In\u00edcio (ISO, opcional)'}
            <input
              placeholder="2026-08-04T12:00:00.000Z"
              value={createValues.startsAt}
              onChange={(event) => {
                setCreateValues({ ...createValues, startsAt: event.target.value });
              }}
            />
          </label>
          <label>
            {'Fim do per\u00edodo (ISO, opcional)'}
            <input
              placeholder="2026-09-04T12:00:00.000Z"
              value={createValues.currentPeriodEndsAt}
              onChange={(event) => {
                setCreateValues({ ...createValues, currentPeriodEndsAt: event.target.value });
              }}
            />
          </label>
          <label>
            <input
              checked={createValues.trial}
              onChange={(event) => {
                setCreateValues({ ...createValues, trial: event.target.checked });
              }}
              type="checkbox"
            />
            {' Iniciar trial quando o plano permitir'}
          </label>
          <label>
            Motivo
            <textarea
              value={createValues.reason}
              onChange={(event) => {
                setCreateValues({ ...createValues, reason: event.target.value });
              }}
            />
          </label>
          {formError !== null && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
          <button disabled={mutation.isPending} type="submit">
            {mutation.isPending ? 'Criando\u2026' : 'Criar assinatura'}
          </button>
        </form></>
      )}
      <div className="platform-filter-bar">
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
            {['TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELED', 'EXPIRED'].map((item) => (
              <option key={item} value={item}>
                {formatStatus(item)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Plano
          <select
            value={planPublicId}
            onChange={(event) => {
              setPage(1);
              setPlanPublicId(event.target.value);
            }}
          >
            <option value="">Todos</option>
            {(plans.data?.items ?? []).map((plan) => (
              <option key={plan.publicId} value={plan.publicId}>
                {plan.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Estabelecimento
          <select
            value={tenantPublicId}
            onChange={(event) => {
              setPage(1);
              setTenantPublicId(event.target.value);
            }}
          >
            <option value="">Todos</option>
            {(tenants.data?.items ?? []).map((tenant) => (
              <option key={tenant.publicId} value={tenant.publicId}>
                {tenant.displayName}
              </option>
            ))}
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
            <option value="currentPeriodEndsAt">{'Fim do per\u00edodo'}</option>
            <option value="trialEndsAt">Fim do trial</option>
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
      {subscriptions.isPending ? (
        <div className="platform-table-skeleton"><i className="platform-skeleton"/><i className="platform-skeleton"/></div>
      ) : subscriptions.error instanceof Error ? (
        <ErrorState message={subscriptions.error.message} retry={() => { void subscriptions.refetch(); }} />
      ) : subscriptions.data === undefined || subscriptions.data.items.length === 0 ? (
        <div className="platform-empty"><h3>Nenhuma assinatura encontrada</h3><p>Nenhuma assinatura corresponde aos filtros atuais.</p></div>
      ) : (
        <>
          <div className="platform-table-wrap"><table className="platform-table platform-subscription-table"><thead><tr><th>Estabelecimento</th><th>Plano</th><th>Ciclo</th><th>Status</th><th>Periodo</th><th>Valor</th><th>Acoes</th></tr></thead><tbody>
            {subscriptions.data.items.map((subscription) => (
              <tr key={subscription.publicId} onClick={() => { setSelected(subscription.publicId); }}><td><strong>{tenantNames.get(subscription.tenantPublicId) ?? 'Estabelecimento indisponivel'}</strong></td><td>{subscription.plan.name}</td><td>{formatCycle(subscription.billingCycle)}</td><td><StatusBadge value={subscription.status}/></td><td><span>{formatDate(subscription.currentPeriodStartsAt)}</span><span> → {formatDate(subscription.currentPeriodEndsAt)}</span></td><td>{formatMoney(subscription.priceCents,subscription.currency)}</td><td><button aria-label="Ver detalhes" onClick={(event) => { event.stopPropagation(); setSelected(subscription.publicId); }} type="button">•••</button></td></tr>
            ))}
          </tbody></table></div>
          <Pagination page={page} totalPages={subscriptions.data.page.totalPages} total={subscriptions.data.page.total} limit={subscriptions.data.page.limit} onPage={setPage}/>
        </>
      )}
      {detail.data !== undefined && (
        <><button className="platform-backdrop" aria-label="Fechar" onClick={() => { setSelected(null); }} type="button"/><article className="platform-drawer platform-drawer--detail"><button className="platform-drawer-close" aria-label="Fechar" onClick={() => { setSelected(null); }} type="button">×</button><h3>{tenantNames.get(detail.data.subscription.tenantPublicId) ?? 'Assinatura'}</h3><StatusBadge value={detail.data.subscription.status}/>
          <dl className="platform-details">
            <div>
              <dt>Estabelecimento</dt>
              <dd>
                {tenantNames.get(detail.data.subscription.tenantPublicId) ??
                  'Estabelecimento indispon\u00edvel'}
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd><StatusBadge value={detail.data.subscription.status}/></dd>
            </div>
            <div>
              <dt>{'Pre\u00e7o'}</dt>
              <dd>{formatMoney(detail.data.subscription.priceCents,detail.data.subscription.currency)}</dd>
            </div>
            <div>
              <dt>Ciclo</dt>
              <dd>{formatCycle(detail.data.subscription.billingCycle)}</dd>
            </div>
            <div>
              <dt>{'In\u00edcio'}</dt>
              <dd>{formatDate(detail.data.subscription.startsAt,true)}</dd>
            </div>
            <div>
              <dt>Trial</dt>
              <dd>{detail.data.subscription.trialEndsAt ? formatDate(detail.data.subscription.trialEndsAt,true) : 'Sem trial'}</dd>
            </div>
            <div>
              <dt>{'Per\u00edodo atual'}</dt>
              <dd>{`${formatDate(detail.data.subscription.currentPeriodStartsAt)} → ${formatDate(detail.data.subscription.currentPeriodEndsAt)}`}</dd>
            </div>
            <div>
              <dt>Cancelamento</dt>
              <dd>{detail.data.subscription.canceledAt ?? 'N\u00e3o cancelada'}</dd>
            </div>
            <div>
              <dt>{'T\u00e9rmino'}</dt>
              <dd>{detail.data.subscription.endsAt ?? 'Sem t\u00e9rmino definido'}</dd>
            </div>
          </dl>
          <h4>{'Hist\u00f3rico comercial'}</h4>
          {detail.data.history.length === 0 ? (
            <p>Nenhum evento dispon\u00edvel.</p>
          ) : (
            <ul>
              {detail.data.history.map((event) => (
                <li
                  key={event.publicId}
                ><strong>{event.action.replaceAll('_',' ')}</strong>{` · ${event.previousStatus ? formatStatus(event.previousStatus) : '—'} → ${event.newStatus ? formatStatus(event.newStatus) : '—'} · ${event.reason ?? 'Sem motivo'} · ${event.performedBy?.email ?? 'Sistema'} · ${formatDate(event.createdAt,true)}`}</li>
              ))}
            </ul>
          )}
          <h4>Alterar plano</h4>
          <div className="platform-form">
            <label>
              Novo plano
              <select
                value={changeValues.planPublicId}
                onChange={(event) => {
                  const next=plans.data?.items.find((plan)=>plan.publicId===event.target.value);setChangeValues({ ...changeValues, planPublicId: event.target.value,billingCycle:next?.billingOptions.find((option)=>option.active)?.billingCycle });
                }}
              >
                <option value="">Selecione um plano</option>
                {(plans.data?.items ?? []).map((plan) => (
                  <option key={plan.publicId} value={plan.publicId}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Motivo
              <textarea
                value={changeValues.reason}
                onChange={(event) => {
                  setChangeValues({ ...changeValues, reason: event.target.value });
                }}
              />
            </label>
            <label>
              Periodicidade futura
              <select value={changeValues.billingCycle ?? ''} onChange={(event) => { setChangeValues({ ...changeValues, billingCycle: event.target.value === '' ? undefined : event.target.value as NonNullable<typeof changeValues.billingCycle> }); }}>
                {changeOptions.map((option)=><option key={option.publicId} value={option.billingCycle}>{`${formatCycle(option.billingCycle)} - ${formatMoney(option.priceCents,changePlan?.currency)}`}</option>)}
              </select>
            </label>
            {changeValues.planPublicId !== '' ? <p>{`Plano atual: ${detail.data.subscription.plan.name}. Novo plano: ${plans.data?.items.find((plan) => plan.publicId === changeValues.planPublicId)?.name ?? 'selecione'}. O preco e ciclo escolhidos valerao para periodos futuros; nao sera gerada cobranca.`}</p> : null}
            <button disabled={mutation.isPending} onClick={confirmChangePlan} type="button">
              Alterar plano
            </button>
          </div>
          <h4>Estender trial</h4>
          <div className="platform-form"><div className="form-actions"><button onClick={() => { if(detail.data.subscription.trialEndsAt){const date=new Date(detail.data.subscription.trialEndsAt);date.setUTCDate(date.getUTCDate()+7);setTrialValues({...trialValues,trialEndsAt:date.toISOString()});} }} type="button">+ 7 dias</button><button onClick={() => { if(detail.data.subscription.trialEndsAt){const date=new Date(detail.data.subscription.trialEndsAt);date.setUTCDate(date.getUTCDate()+15);setTrialValues({...trialValues,trialEndsAt:date.toISOString()});} }} type="button">+ 15 dias</button><button onClick={() => { if(detail.data.subscription.trialEndsAt){const date=new Date(detail.data.subscription.trialEndsAt);date.setUTCDate(date.getUTCDate()+30);setTrialValues({...trialValues,trialEndsAt:date.toISOString()});} }} type="button">+ 30 dias</button></div>
            <label>
              Nova data de trial (ISO)
              <input
                placeholder="2026-09-04T12:00:00.000Z"
                value={trialValues.trialEndsAt}
                onChange={(event) => {
                  setTrialValues({ ...trialValues, trialEndsAt: event.target.value });
                }}
              />
            </label>
            <label>
              Motivo
              <textarea
                value={trialValues.reason}
                onChange={(event) => {
                  setTrialValues({ ...trialValues, reason: event.target.value });
                }}
              />
            </label>
            <button
              disabled={mutation.isPending || detail.data.subscription.status !== 'TRIALING'}
              onClick={confirmTrialExtension}
              type="button"
            >
              Estender trial
            </button>
          </div>
          <h4>Editar periodo</h4>
          <div className="platform-form">
            <label>Inicio do periodo<input value={periodValues.currentPeriodStartsAt} placeholder={detail.data.subscription.currentPeriodStartsAt} onChange={(event) => { setPeriodValues({ ...periodValues, currentPeriodStartsAt: event.target.value }); }} /></label>
            <label>Fim do periodo<input value={periodValues.currentPeriodEndsAt} placeholder={detail.data.subscription.currentPeriodEndsAt} onChange={(event) => { setPeriodValues({ ...periodValues, currentPeriodEndsAt: event.target.value }); }} /></label>
            <label>Motivo<textarea value={periodValues.reason} onChange={(event) => { setPeriodValues({ ...periodValues, reason: event.target.value }); }} /></label>
            <button disabled={mutation.isPending} onClick={confirmPeriodUpdate} type="button">Salvar periodo</button>
          </div>
          {formError !== null && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
          <div className="form-actions">
            <button
              disabled={
                mutation.isPending ||
                !['TRIALING', 'PAST_DUE'].includes(detail.data.subscription.status)
              }
              onClick={() => {
                requestStatus('Ativar', 'activate', 'A assinatura ser\u00e1 ativada.');
              }}
              type="button"
            >
              Ativar
            </button>
            <button
              disabled={
                mutation.isPending ||
                !['ACTIVE', 'TRIALING', 'PAST_DUE'].includes(detail.data.subscription.status)
              }
              onClick={() => {
                requestStatus(
                  'Suspender',
                  'suspend',
                  'A assinatura ficar\u00e1 suspensa at\u00e9 ser reativada.',
                );
              }}
              type="button"
            >
              Suspender
            </button>
            <button
              disabled={mutation.isPending || detail.data.subscription.status !== 'SUSPENDED'}
              onClick={() => {
                requestStatus('Reativar', 'reactivate', 'A assinatura voltar\u00e1 a operar.');
              }}
              type="button"
            >
              Reativar
            </button>
            <button
              disabled={
                mutation.isPending ||
                ['CANCELED', 'EXPIRED'].includes(detail.data.subscription.status)
              }
              onClick={() => {
                requestStatus(
                  'Cancelar',
                  'cancel',
                  'A assinatura ser\u00e1 cancelada imediatamente.',
                );
              }}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </article></>
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
