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
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
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
          url: `/platform/tenants/${selected}/${suffix}`,
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
      <p className="eyebrow">{'Gest\u00e3o comercial'}</p>
      <h2 id="tenant-title">Estabelecimentos</h2>
      {notice !== null && <p className="success-message">{notice}</p>}
      <TenantProvisionForm
        busy={mutation.isPending}
        error={mutation.error instanceof Error ? mutation.error.message : null}
        plans={plans.data?.items ?? []}
        onProvision={provision}
      />
      <div className="platform-form">
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
        <p>{'Carregando estabelecimentos\u2026'}</p>
      ) : tenants.error instanceof Error ? (
        <p className="form-error">{'N\u00e3o foi poss\u00edvel carregar os estabelecimentos.'}</p>
      ) : tenants.data === undefined || tenants.data.items.length === 0 ? (
        <p>Nenhum estabelecimento encontrado.</p>
      ) : (
        <>
          <div className="data-list">
            {tenants.data.items.map((tenant) => (
              <button
                className="data-row"
                key={tenant.publicId}
                onClick={() => {
                  setSelected(tenant.publicId);
                }}
                type="button"
              >
                <span>{tenant.displayName}</span>
                <span>{tenant.slug}</span>
                <span>{tenant.status}</span>
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
            <span>{`P\u00e1gina ${String(tenants.data.page.page)} de ${String(tenants.data.page.totalPages)}`}</span>
            <button
              disabled={page >= tenants.data.page.totalPages}
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
      {detail.data !== undefined ? (
        <article className="sessions-panel">
          <h3>{detail.data.tenant.displayName}</h3>
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
        </article>
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
