import {
  PlanListResponseSchema,
  TenantFeaturesResponseSchema,
  TenantCustomFieldsResponseSchema,
  TenantExperienceResponseSchema,
  PlatformTenantDetailResponseSchema,
  PlatformTenantListResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';

import {
  ErrorState,
  formatCycle,
  formatDate,
  PageHeader,
  Pagination,
  StatusBadge,
} from './PlatformUi.js';
import { TenantEditForm } from './TenantEditForm.js';
import { TenantProvisionForm } from './TenantProvisionForm.js';
import { httpClient } from '../../lib/http.js';
import { ConfirmationDialog, type ConfirmationRequest } from '../ConfirmationDialog.js';

import type {
  CreatePlatformTenantRequestSchema,
  UpdatePlatformTenantRequestSchema,
} from '@plataforma/shared';

function formText(values: FormData, name: string): string {
  const value = values.get(name);
  return typeof value === 'string' ? value : '';
}

export function TenantModule() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const [subscriptionPlan, setSubscriptionPlan] = useState('');
  const [subscriptionCycle, setSubscriptionCycle] = useState<
    '' | 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL'
  >('');
  const client = useQueryClient();
  const tenants = useQuery({
    queryKey: ['platform', 'tenants', page, search, status],
    queryFn: () => {
      const query = new URLSearchParams({
        page: String(page),
        limit: '10',
        orderBy: 'createdAt',
        direction: 'desc',
      });
      if (search.trim() !== '') query.set('search', search.trim());
      if (status !== '') query.set('status', status);
      return httpClient.request(`/platform/tenants?${query.toString()}`, {
        schema: PlatformTenantListResponseSchema,
      });
    },
    retry: false,
  });
  const detail = useQuery({
    queryKey: ['platform', 'tenant', selected],
    queryFn: () =>
      httpClient.request(`/platform/tenants/${selected ?? ''}`, {
        schema: PlatformTenantDetailResponseSchema,
      }),
    enabled: selected !== null,
    retry: false,
  });
  const features = useQuery({
    queryKey: ['platform', 'tenant', selected, 'features'],
    queryFn: () =>
      httpClient.request(`/platform/tenants/${selected ?? ''}/features`, {
        schema: TenantFeaturesResponseSchema,
      }),
    enabled: selected !== null,
    retry: false,
  });
  const customFields = useQuery({
    queryKey: ['platform', 'tenant', selected, 'custom-fields'],
    queryFn: () =>
      httpClient.request(`/platform/tenants/${selected ?? ''}/custom-fields`, {
        schema: TenantCustomFieldsResponseSchema,
      }),
    enabled: selected !== null,
    retry: false,
  });
  const experience = useQuery({
    queryKey: ['platform', 'tenant', selected, 'experience'],
    queryFn: () =>
      httpClient.request(`/platform/tenants/${selected ?? ''}/experience`, {
        schema: TenantExperienceResponseSchema,
      }),
    enabled: selected !== null,
    retry: false,
  });
  const plans = useQuery({
    queryKey: ['platform', 'plans', 'provisioning'],
    queryFn: () =>
      httpClient.request('/platform/plans?status=ACTIVE&limit=100', {
        schema: PlanListResponseSchema,
      }),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: ({
      url,
      body,
      method = 'POST',
    }: {
      url: string;
      body: unknown;
      method?: 'POST' | 'PATCH';
    }) => httpClient.request(url, { method, body, schema: z.looseObject({}) }),
    onSuccess: async () => {
      setNotice('Opera\u00e7\u00e3o conclu\u00edda com sucesso.');
      setCreating(false);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['platform', 'tenants'] }),
        client.invalidateQueries({ queryKey: ['platform', 'tenant', selected] }),
      ]);
    },
  });
  const save = async (body: z.infer<typeof UpdatePlatformTenantRequestSchema>) => {
    if (selected === null) return;
    await mutation.mutateAsync({ url: `/platform/tenants/${selected}`, body, method: 'PATCH' });
  };
  const provision = async (body: z.infer<typeof CreatePlatformTenantRequestSchema>) => {
    await mutation.mutateAsync({ url: '/platform/tenants', body });
  };
  const requestAction = (label: string, suffix: string, description: string) => {
    if (selected === null) return;
    setConfirmation({
      title: `${label}?`,
      description,
      confirmLabel: label,
      requiresReason: true,
      variant: suffix === 'deactivate' ? 'danger' : 'default',
      onConfirm: async (reason) => {
        await mutation.mutateAsync({
          url: suffix.startsWith('subscriptions/')
            ? `/platform/${suffix}`
            : `/platform/tenants/${selected}/${suffix}`,
          body: { reason, ...(suffix === 'deactivate' ? { confirm: true } : {}) },
        });
      },
    });
  };
  const requestFeatureChange = (code: string, enabled: boolean) => {
    if (selected === null) return;
    setConfirmation({
      title: enabled ? 'Habilitar funcionalidade?' : 'Desabilitar funcionalidade?',
      description: enabled
        ? 'A configura\u00e7\u00e3o ser\u00e1 aplicada somente a este estabelecimento.'
        : 'A configura\u00e7\u00e3o ser\u00e1 desabilitada somente para este estabelecimento.',
      confirmLabel: enabled ? 'Habilitar' : 'Desabilitar',
      requiresReason: false,
      variant: enabled ? 'default' : 'danger',
      onConfirm: async () => {
        await mutation.mutateAsync({
          url: `/platform/tenants/${selected}/features`,
          method: 'PATCH',
          body: { features: [{ code, enabled }] },
        });
        await client.invalidateQueries({ queryKey: ['platform', 'tenant', selected, 'features'] });
      },
    });
  };
  return (
    <section aria-labelledby="tenant-title">
      <PageHeader
        title="Estabelecimentos"
        description="Gerencie estabelecimentos, acessos e assinaturas da plataforma."
        action={
          <button
            type="button"
            onClick={() => {
              setCreating(true);
            }}
          >
            + Novo estabelecimento
          </button>
        }
      />
      {notice !== null && <p className="success-message">{notice}</p>}
      {creating ? (
        <>
          <button
            className="platform-backdrop"
            aria-label="Fechar formulario"
            onClick={() => {
              setCreating(false);
            }}
            type="button"
          />
          <aside
            className="platform-drawer"
            aria-label="Novo estabelecimento"
            role="dialog"
            aria-modal="true"
          >
            <button
              className="platform-drawer-close"
              aria-label="Fechar"
              onClick={() => {
                setCreating(false);
              }}
              type="button"
            >
              ×
            </button>
            <TenantProvisionForm
              busy={mutation.isPending}
              error={mutation.error instanceof Error ? mutation.error.message : null}
              plans={plans.data?.items ?? []}
              onProvision={provision}
            />
          </aside>
        </>
      ) : null}
      <div className="platform-filter-bar">
        <label>
          Busca
          <input
            value={search}
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
            placeholder="Nome ou slug"
          />
        </label>
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
            <option value="SUSPENDED">Suspenso</option>
            <option value="INACTIVE">Inativo</option>
            <option value="PENDING">Pendente</option>
          </select>
        </label>
      </div>
      {tenants.isPending ? (
        <div className="platform-table-skeleton">
          <i className="platform-skeleton" />
          <i className="platform-skeleton" />
          <i className="platform-skeleton" />
        </div>
      ) : tenants.error instanceof Error ? (
        <ErrorState
          message={tenants.error.message}
          retry={() => {
            void tenants.refetch();
          }}
        />
      ) : tenants.data === undefined || tenants.data.items.length === 0 ? (
        <div className="platform-empty">
          <h3>Nenhum estabelecimento encontrado</h3>
          <p>
            {search || status
              ? 'Nenhum estabelecimento corresponde aos filtros atuais.'
              : 'Cadastre o primeiro estabelecimento da plataforma.'}
          </p>
          <button
            onClick={() => {
              setCreating(true);
            }}
            type="button"
          >
            Novo estabelecimento
          </button>
        </div>
      ) : (
        <>
          <div className="platform-table-wrap">
            <table className="platform-table">
              <thead>
                <tr>
                  <th>Estabelecimento</th>
                  <th>Plano</th>
                  <th>Assinatura</th>
                  <th>Status</th>
                  <th>Criado em</th>
                  <th>
                    <span className="sr-only">Acoes</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tenants.data.items.map((tenant) => (
                  <tr
                    key={tenant.publicId}
                    onClick={() => {
                      setSelected(tenant.publicId);
                    }}
                  >
                    <td>
                      <strong>{tenant.displayName}</strong>
                      <span>{tenant.slug}</span>
                    </td>
                    <td>
                      <strong>{tenant.subscription?.plan.name ?? 'Sem plano'}</strong>
                      <span>
                        {tenant.subscription ? formatCycle(tenant.subscription.billingCycle) : ''}
                      </span>
                    </td>
                    <td>
                      <StatusBadge value={tenant.subscription?.status ?? 'INACTIVE'} />
                    </td>
                    <td>
                      <StatusBadge value={tenant.status} />
                    </td>
                    <td>{formatDate(tenant.createdAt)}</td>
                    <td>
                      <button
                        aria-label={`Ver detalhes de ${tenant.displayName}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelected(tenant.publicId);
                        }}
                        type="button"
                      >
                        •••
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            totalPages={tenants.data.page.totalPages}
            total={tenants.data.page.total}
            limit={tenants.data.page.limit}
            onPage={setPage}
          />
        </>
      )}
      {selected !== null ? (
        <>
          <button
            className="platform-backdrop"
            aria-label="Fechar detalhes"
            onClick={() => {
              setSelected(null);
            }}
            type="button"
          />
          <article className="platform-drawer platform-drawer--detail">
            <button
              className="platform-drawer-close"
              aria-label="Fechar"
              onClick={() => {
                setSelected(null);
              }}
              type="button"
            >
              ×
            </button>
            {detail.isPending ? (
              <div className="platform-detail-loading">
                <i className="platform-skeleton" />
                <p>Carregando estabelecimento…</p>
              </div>
            ) : detail.error instanceof Error ? (
              <ErrorState
                message={detail.error.message}
                retry={() => {
                  void detail.refetch();
                }}
              />
            ) : detail.data === undefined ? null : (
              <>
            <h3>{detail.data.tenant.displayName}</h3>
            <StatusBadge value={detail.data.tenant.status} />
            <div aria-label="Abas do estabelecimento" className="form-actions" role="tablist">
              <button aria-selected="true" role="tab" type="button">
                Perfil do negócio
              </button>
            </div>
            <section aria-label="Perfil do negócio" role="tabpanel">
              <h4>Perfil do negócio</h4>
              {experience.isPending ? (
                <p>Carregando perfil…</p>
              ) : experience.error instanceof Error ? (
                <p className="form-error">Não foi possível carregar o perfil efetivo.</p>
              ) : experience.data === undefined ? null : (
                <>
                  <p>{`Perfil selecionado: ${experience.data.profile}`}</p>
                  <dl className="platform-details">
                    <div>
                      <dt>Cor primária</dt>
                      <dd>{experience.data.branding.primaryColor}</dd>
                    </div>
                    <div>
                      <dt>Fonte</dt>
                      <dd>{experience.data.branding.fontFamily}</dd>
                    </div>
                    <div>
                      <dt>Profissional</dt>
                      <dd>{experience.data.terminology.professional.plural}</dd>
                    </div>
                    <div>
                      <dt>Cliente</dt>
                      <dd>{experience.data.terminology.customer.plural}</dd>
                    </div>
                    <div>
                      <dt>Serviço</dt>
                      <dd>{experience.data.terminology.service.plural}</dd>
                    </div>
                    <div>
                      <dt>Agendamento</dt>
                      <dd>{experience.data.terminology.appointment.plural}</dd>
                    </div>
                  </dl>
                  <p>{`Funcionalidades efetivas: ${String(features.data?.features.filter((feature) => feature.enabled).length ?? 0)}`}</p>
                  <p>{`Campos configuráveis: ${String(customFields.data?.fields.length ?? 0)}`}</p>
                </>
              )}
            </section>
            <dl className="platform-details">
              <div>
                <dt>{'Raz\u00e3o social'}</dt>
                <dd>{detail.data.tenant.legalName}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{detail.data.tenant.status}</dd>
              </div>
              <div>
                <dt>{'Propriet\u00e1rio'}</dt>
                <dd>{detail.data.owner?.email ?? 'Sem propriet\u00e1rio cadastrado'}</dd>
              </div>
              <div>
                <dt>Plano</dt>
                <dd>{detail.data.subscription?.plan.name ?? 'Sem assinatura'}</dd>
              </div>
              <div>
                <dt>{'Assinatura'}</dt>
                <dd>{detail.data.subscription?.status ?? 'Sem assinatura'}</dd>
              </div>
              <div>
                <dt>{'Unidades e membros'}</dt>
                <dd>{`${String(detail.data.counts.units)} / ${String(detail.data.counts.members)}`}</dd>
              </div>
              <div>
                <dt>{'Configura\u00e7\u00f5es'}</dt>
                <dd>{`${String(detail.data.settings.defaultAppointmentIntervalMinutes)} min · ${detail.data.settings.timeFormat}`}</dd>
              </div>
            </dl>
            <section className="platform-subscription-actions">
              <h4>Gestão da assinatura</h4>
              {detail.data.subscription === null ? (
                <p className="muted">
                  Este estabelecimento ainda não possui uma assinatura efetiva.
                </p>
              ) : (
                <>
                  <div className="platform-form">
                    <label>
                      Novo plano
                      <select
                        value={subscriptionPlan}
                        onChange={(event) => {
                          setSubscriptionPlan(event.target.value);
                        }}
                      >
                        <option value="">Manter plano atual</option>
                        {(plans.data?.items ?? []).map((plan) => (
                          <option key={plan.publicId} value={plan.publicId}>
                            {plan.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Periodicidade futura
                      <select
                        value={subscriptionCycle}
                        onChange={(event) => {
                          setSubscriptionCycle(event.target.value as typeof subscriptionCycle);
                        }}
                      >
                        <option value="">Recomendada pelo novo plano</option>
                        <option value="MONTHLY">Mensal</option>
                        <option value="QUARTERLY">Trimestral</option>
                        <option value="SEMIANNUAL">Semestral</option>
                        <option value="ANNUAL">Anual</option>
                      </select>
                    </label>
                    <button
                      disabled={mutation.isPending || subscriptionPlan === ''}
                      onClick={() => {
                        const subscription = detail.data.subscription;
                        if (subscription === null || subscriptionPlan === '') return;
                        void mutation.mutateAsync({
                          url: `/platform/subscriptions/${subscription.publicId}/change-plan`,
                          body: {
                            planPublicId: subscriptionPlan,
                            ...(subscriptionCycle === ''
                              ? {}
                              : { billingCycle: subscriptionCycle }),
                            reason: 'Alteração pelo detalhe do estabelecimento',
                          },
                        });
                      }}
                      type="button"
                    >
                      Trocar plano
                    </button>
                  </div>
                  <div className="form-actions">
                    {(['suspend', 'reactivate', 'cancel'] as const).map((action) => (
                      <button
                        key={action}
                        disabled={mutation.isPending}
                        onClick={() => {
                          const subscription = detail.data.subscription;
                          if (subscription === null) return;
                          requestAction(
                            action === 'suspend'
                              ? 'Suspender assinatura'
                              : action === 'reactivate'
                                ? 'Reativar assinatura'
                                : 'Cancelar assinatura',
                            `subscriptions/${subscription.publicId}/${action}`,
                            'A alteração comercial será registrada no histórico.',
                          );
                        }}
                        type="button"
                      >
                        {action === 'suspend'
                          ? 'Suspender'
                          : action === 'reactivate'
                            ? 'Reativar'
                            : 'Cancelar'}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </section>
            <h4>{'Unidades'}</h4>
            {detail.data.units.length === 0 ? (
              <p>{'Nenhuma unidade cadastrada.'}</p>
            ) : (
              <ul>
                {detail.data.units.map((unit) => (
                  <li key={unit.publicId}>{`${unit.name} (${unit.status})`}</li>
                ))}
              </ul>
            )}
            <h4>{'Hist\u00f3rico comercial'}</h4>
            {detail.data.subscriptionHistory.length === 0 ? (
              <p>{'Nenhum evento comercial dispon\u00edvel.'}</p>
            ) : (
              <ul>
                {detail.data.subscriptionHistory.map((event) => (
                  <li key={event.publicId}>{`${event.action} — ${event.createdAt}`}</li>
                ))}
              </ul>
            )}
            <h4>{'Editar estabelecimento'}</h4>
            <TenantEditForm
              busy={mutation.isPending}
              tenant={{
                legalName: detail.data.tenant.legalName,
                displayName: detail.data.tenant.displayName,
                slug: detail.data.tenant.slug,
                timezone: detail.data.tenant.timezone,
                locale: detail.data.tenant.locale,
                currency: detail.data.tenant.currency,
              }}
              onSave={save}
            />
            <h4>{'Funcionalidades'}</h4>
            {features.isPending ? (
              <p>{'Carregando funcionalidades\u2026'}</p>
            ) : features.error instanceof Error ? (
              <p className="form-error">
                {'N\u00e3o foi poss\u00edvel carregar as funcionalidades.'}
              </p>
            ) : features.data === undefined ? null : (
              <div className="data-list" aria-label="Funcionalidades do estabelecimento">
                {features.data.features.map((feature) => (
                  <div className="data-row" key={feature.code}>
                    <span>{feature.code}</span>
                    <span>
                      {feature.recommended ? 'Recomendada pelo perfil' : 'N\u00e3o recomendada'}
                    </span>
                    <span>
                      {feature.source === 'OVERRIDE' ? 'Override ativo' : 'Padr\u00e3o do perfil'}
                    </span>
                    <button
                      disabled={mutation.isPending}
                      onClick={() => {
                        requestFeatureChange(feature.code, !feature.enabled);
                      }}
                      type="button"
                    >
                      {feature.enabled ? 'Desabilitar' : 'Habilitar'}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <h4>{'Campos configuráveis'}</h4>
            <form
              className="platform-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (selected === null) return;
                const values = new FormData(event.currentTarget);
                const type = formText(values, 'customFieldType');
                const options = formText(values, 'customFieldOptions')
                  .split(',')
                  .map((option) => option.trim())
                  .filter((option) => option !== '');
                void mutation
                  .mutateAsync({
                    url: `/platform/tenants/${selected}/custom-fields`,
                    body: {
                      key: formText(values, 'customFieldKey').trim(),
                      label: formText(values, 'customFieldLabel').trim(),
                      description: formText(values, 'customFieldDescription').trim() || null,
                      type,
                      scope: formText(values, 'customFieldScope'),
                      required: values.get('customFieldRequired') === 'on',
                      active: true,
                      order: Number(values.get('customFieldOrder') ?? 0),
                      ...(type === 'SELECT' || type === 'MULTISELECT' ? { options } : {}),
                    },
                  })
                  .then(async () => {
                    event.currentTarget.reset();
                    await client.invalidateQueries({
                      queryKey: ['platform', 'tenant', selected, 'custom-fields'],
                    });
                  });
              }}
            >
              <label>
                Chave
                <input name="customFieldKey" pattern="[a-z][a-z0-9_]{1,62}" required />
              </label>
              <label>
                Rótulo
                <input name="customFieldLabel" required />
              </label>
              <label>
                Escopo
                <select name="customFieldScope">
                  <option value="TENANT">Tenant</option>
                  <option value="PROFESSIONAL">Profissional</option>
                  <option value="CUSTOMER">Cliente</option>
                  <option value="APPOINTMENT">Agendamento</option>
                </select>
              </label>
              <label>
                Tipo
                <select name="customFieldType">
                  <option value="TEXT">Texto</option>
                  <option value="TEXTAREA">Texto longo</option>
                  <option value="NUMBER">Número</option>
                  <option value="BOOLEAN">Booleano</option>
                  <option value="DATE">Data</option>
                  <option value="SELECT">Lista</option>
                  <option value="MULTISELECT">Múltipla escolha</option>
                </select>
              </label>
              <label>
                Opções (separadas por vírgula)
                <input name="customFieldOptions" />
              </label>
              <label>
                Ordem
                <input name="customFieldOrder" type="number" min="0" defaultValue="0" />
              </label>
              <label>
                <input name="customFieldRequired" type="checkbox" /> Obrigatório
              </label>
              <button disabled={mutation.isPending} type="submit">
                Criar campo
              </button>
            </form>
            {customFields.isPending ? (
              <p>{'Carregando campos…'}</p>
            ) : customFields.error instanceof Error ? (
              <p className="form-error">{'Não foi possível carregar os campos.'}</p>
            ) : customFields.data === undefined ? null : (
              <div className="data-list">
                {customFields.data.fields.map((field) => (
                  <div className="data-row" key={field.publicId}>
                    <span>{`${field.scope}: ${field.label} (${field.type})`}</span>
                    <span>{field.source === 'PROFILE' ? 'Perfil' : 'Override'}</span>
                    <span>{field.active ? 'Ativo' : 'Inativo'}</span>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (selected === null) return;
                        const values = new FormData(event.currentTarget);
                        void mutation
                          .mutateAsync({
                            url: `/platform/tenants/${selected}/custom-fields/${field.publicId}`,
                            method: 'PATCH',
                            body: {
                              key: field.key,
                              label: formText(values, 'label').trim(),
                              description: field.description,
                              type: field.type,
                              scope: field.scope,
                              required: field.required,
                              active: field.active,
                              order: Number(values.get('order')),
                              ...(field.options === undefined ? {} : { options: field.options }),
                              ...(field.validation === undefined
                                ? {}
                                : { validation: field.validation }),
                            },
                          })
                          .then(async () => {
                            await client.invalidateQueries({
                              queryKey: ['platform', 'tenant', selected, 'custom-fields'],
                            });
                          });
                      }}
                    >
                      <input
                        aria-label={`Rótulo de ${field.label}`}
                        defaultValue={field.label}
                        name="label"
                      />
                      <input
                        aria-label={`Ordem de ${field.label}`}
                        defaultValue={field.order}
                        min="0"
                        name="order"
                        type="number"
                      />
                      <button disabled={mutation.isPending} type="submit">
                        Salvar
                      </button>
                    </form>
                    <button
                      disabled={mutation.isPending}
                      onClick={() => {
                        setConfirmation({
                          title: field.active ? 'Desativar campo?' : 'Ativar campo?',
                          description: 'A alteração será aplicada somente a este estabelecimento.',
                          confirmLabel: field.active ? 'Desativar' : 'Ativar',
                          requiresReason: false,
                          variant: field.active ? 'danger' : 'default',
                          onConfirm: async () => {
                            await mutation.mutateAsync({
                              url: `/platform/tenants/${selected ?? ''}/custom-fields/${field.publicId}/${field.active ? 'deactivate' : 'activate'}`,
                              body: {},
                            });
                            await client.invalidateQueries({
                              queryKey: ['platform', 'tenant', selected, 'custom-fields'],
                            });
                          },
                        });
                      }}
                      type="button"
                    >
                      {field.active ? 'Desativar' : 'Ativar'}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {mutation.error instanceof Error && (
              <p className="form-error">{mutation.error.message}</p>
            )}
            <div className="form-actions">
              <button
                disabled={mutation.isPending || detail.data.tenant.status !== 'ACTIVE'}
                onClick={() => {
                  requestAction(
                    'Suspender',
                    'suspend',
                    'O estabelecimento ficará suspenso até ser reativado.',
                  );
                }}
                type="button"
              >
                Suspender
              </button>
              <button
                disabled={mutation.isPending || detail.data.tenant.status !== 'SUSPENDED'}
                onClick={() => {
                  requestAction(
                    'Reativar',
                    'reactivate',
                    'O estabelecimento voltará a operar normalmente.',
                  );
                }}
                type="button"
              >
                Reativar
              </button>
              <button
                disabled={mutation.isPending || detail.data.tenant.status === 'INACTIVE'}
                onClick={() => {
                  requestAction('Desativar', 'deactivate', 'O estabelecimento será desativado.');
                }}
                type="button"
              >
                Desativar
              </button>
            </div>
              </>
            )}
          </article>
        </>
      ) : null}
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
