import {
  CreateServiceRequestSchema,
  ServiceCategoryListResponseSchema,
  ServicePublicSchema,
  ServiceStatusResponseSchema,
  TenantWhiteLabelResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type ZodType } from 'zod';

import { ServiceForm, type ServiceSubmission } from './ServiceForm.js';
import { ServiceImageUpload } from './ServiceImageUpload.js';
import { TenantServiceImage } from './TenantServiceImage.js';
import { httpClient } from '../../lib/http.js';
import { ProfessionalServiceLinks } from '../professionals/ProfessionalServiceLinks.js';
import { EmptyState, ListSkeleton, StatusBadge } from '../ui/AppUi.js';

const money = (cents: string) =>
  (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export function ServiceProfile({
  tenantPublicId,
  publicId,
  terminology,
}: {
  tenantPublicId: string;
  publicId: string;
  terminology: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'overview' | 'professionals' | 'public'>('overview');
  const [editing, setEditing] = useState(false);
  const detail = useQuery({
    queryKey: ['tenant', tenantPublicId, 'service', publicId],
    queryFn: () =>
      httpClient.request(`/tenant/services/${publicId}`, {
        schema: ServicePublicSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const categories = useQuery({
    queryKey: ['tenant', tenantPublicId, 'service-categories'],
    queryFn: () =>
      httpClient.request('/tenant/service-categories?limit=100', {
        schema: ServiceCategoryListResponseSchema,
        tenantPublicId,
      }),
    enabled: editing || tab === 'public',
    retry: false,
  });
  const publicSite = useQuery({
    queryKey: ['tenant', tenantPublicId, 'white-label'],
    queryFn: () =>
      httpClient.request('/tenant/white-label', {
        schema: TenantWhiteLabelResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const mutate = useMutation({
    mutationFn: ({
      url,
      method,
      body,
      schema,
    }: {
      url: string;
      method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
      body?: unknown;
      schema?: ZodType;
    }) =>
      httpClient.request(url, {
        method,
        ...(body === undefined ? {} : { body }),
        schema: schema ?? ServicePublicSchema,
        tenantPublicId,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'service', publicId] }),
  });
  if (detail.isPending)
    return (
      <section className="sessions-panel">
        <ListSkeleton rows={6} />
      </section>
    );
  if (detail.error instanceof Error || detail.data === undefined)
    return (
      <section className="sessions-panel">
        <EmptyState
          title="Não foi possível carregar este serviço."
          description="Ele pode não existir ou não estar disponível neste estabelecimento."
          action={
            <button onClick={() => void navigate('/app/servicos')}>Voltar ao catálogo</button>
          }
        />
      </section>
    );
  const service = detail.data;
  const publicUrl =
    publicSite.data === undefined
      ? null
      : `/public/${publicSite.data.slug}?service=${service.publicId}`;
  const save = (value: ServiceSubmission) =>
    mutate
      .mutateAsync({
        url: `/tenant/services/${publicId}`,
        method: 'PATCH',
        body: CreateServiceRequestSchema.parse(value),
      })
      .then(() => {
        setEditing(false);
      });
  const savePublic = (value: ServiceSubmission) =>
    mutate
      .mutateAsync({
        url: `/tenant/services/${publicId}`,
        method: 'PATCH',
        body: CreateServiceRequestSchema.parse(value),
      })
      .then(() => undefined);
  const changeStatus = (active: boolean) =>
    mutate.mutateAsync({
      url: `/tenant/services/${publicId}/${active ? 'activate' : 'deactivate'}`,
      method: 'POST',
      schema: ServiceStatusResponseSchema,
    });
  const upload = async (file: File) => {
    const body = new FormData();
    body.set('file', file, file.name);
    await mutate.mutateAsync({ url: `/tenant/services/${publicId}/image`, method: 'PUT', body });
  };
  return (
    <section className="sessions-panel service-profile">
      <button className="crm-back-button" onClick={() => void navigate('/app/servicos')}>
        ← Serviços
      </button>
      <header className="service-profile-header">
        {service.imageUrl ? (
          <TenantServiceImage
            alt={service.imageAlt ?? service.name}
            servicePublicId={publicId}
            tenantPublicId={tenantPublicId}
            version={service.updatedAt}
          />
        ) : (
          <div className="service-profile-icon" style={{ background: service.color }}>
            {service.name.slice(0, 1)}
          </div>
        )}
        <div>
          <div className="service-profile-title">
            <h2>{service.name}</h2>
            <StatusBadge active={service.active}>
              {service.active ? 'Ativo' : 'Inativo'}
            </StatusBadge>
          </div>
          <p>
            {service.categoryName ?? 'Sem categoria'} · {service.durationMinutes} min ·{' '}
            {money(service.priceCents)}
          </p>
        </div>
        <div className="crm-quick-actions">
          <button
            className="primary-button"
            onClick={() => {
              setTab('overview');
              setEditing(true);
            }}
          >
            Editar
          </button>
          {publicUrl !== null && (
            <a className="secondary-button" href={publicUrl} target="_blank" rel="noreferrer">
              Ver no site
            </a>
          )}
          <button className="secondary-button" onClick={() => void changeStatus(!service.active)}>
            {service.active ? 'Desativar' : 'Ativar'}
          </button>
        </div>
      </header>
      <nav className="crm-tabs">
        {(
          [
            ['overview', 'Visão geral'],
            ['professionals', 'Profissionais'],
            ['public', 'Apresentação pública'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => {
              setTab(id);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === 'overview' && editing && (
        <article className="app-card service-editor-card">
          <p className="ds-eyebrow">Editar informações</p>
          <ServiceForm
            service={service}
            busy={mutate.isPending}
            error={mutate.error instanceof Error ? 'Não foi possível salvar as alterações.' : null}
            terminology={terminology}
            categories={categories.data?.items ?? []}
            fields="operational"
            onCancel={() => {
              setEditing(false);
            }}
            onSave={save}
          />
        </article>
      )}
      {tab === 'overview' && !editing && (
        <div className="service-profile-grid">
          <article className="app-card">
            <p className="ds-eyebrow">Informações</p>
            <dl className="platform-details">
              <div>
                <dt>Preço padrão</dt>
                <dd>{money(service.priceCents)}</dd>
              </div>
              <div>
                <dt>Duração padrão</dt>
                <dd>{service.durationMinutes} minutos</dd>
              </div>
              <div>
                <dt>Pausa após atendimento</dt>
                <dd>
                  {service.hasPostServiceBreak
                    ? `${String(service.postServiceBreakMinutes)} min`
                    : 'Sem pausa'}
                </dd>
              </div>
              <div>
                <dt>Profissionais habilitados</dt>
                <dd>{service.enabledProfessionalCount ?? 0}</dd>
              </div>
            </dl>
          </article>
          <article className="app-card">
            <p className="ds-eyebrow">Organização</p>
            <dl className="platform-details">
              <div>
                <dt>Categoria</dt>
                <dd>{service.categoryName ?? 'Sem categoria'}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{service.active ? 'Ativo' : 'Inativo'}</dd>
              </div>
              <div>
                <dt>Cor na agenda</dt>
                <dd>
                  <span
                    aria-hidden="true"
                    className="service-color-dot"
                    style={{ background: service.color }}
                  />
                  {service.color}
                </dd>
              </div>
              <div>
                <dt>Ordem de exibição</dt>
                <dd>{service.sortOrder}</dd>
              </div>
            </dl>
          </article>
        </div>
      )}
      {tab === 'professionals' && (
        <ProfessionalServiceLinks tenantPublicId={tenantPublicId} servicePublicId={publicId} />
      )}{' '}
      {tab === 'public' && (
        <div className="service-profile-grid">
          <article className="app-card">
            <ServiceImageUpload
              busy={mutate.isPending}
              hasImage={service.imageUrl !== null}
              onUpload={upload}
              onRemove={() =>
                mutate
                  .mutateAsync({ url: `/tenant/services/${publicId}/image`, method: 'DELETE' })
                  .then(() => undefined)
              }
              preview={
                service.imageUrl === null ? null : (
                  <TenantServiceImage
                    alt={service.imageAlt ?? service.name}
                    servicePublicId={publicId}
                    tenantPublicId={tenantPublicId}
                    version={service.updatedAt}
                  />
                )
              }
            />
          </article>
          <article className="app-card service-public-preview">
            <p className="ds-eyebrow">Como o cliente vê</p>
            <div className="service-preview-card">
              {service.imageUrl === null ? (
                <div className="service-preview-image is-empty" aria-hidden="true">
                  Sem imagem
                </div>
              ) : (
                <TenantServiceImage
                  alt={service.imageAlt ?? service.name}
                  servicePublicId={publicId}
                  tenantPublicId={tenantPublicId}
                  version={service.updatedAt}
                />
              )}
              <div>
                <strong>{service.name}</strong>
                <small>
                  {service.categoryName ?? 'Sem categoria'} · {service.durationMinutes} min
                </small>
                <p>{service.description ?? 'Sem descrição pública cadastrada.'}</p>
                <strong>{money(service.priceCents)}</strong>
              </div>
            </div>
            <p className="muted">
              {service.active
                ? 'Disponível para novos agendamentos quando houver profissional habilitado.'
                : 'Inativo: não aparece para novos agendamentos.'}
            </p>
          </article>
          <article className="app-card service-editor-card service-field--wide">
            <p className="ds-eyebrow">Textos públicos</p>
            <ServiceForm
              service={service}
              busy={mutate.isPending}
              error={
                mutate.error instanceof Error ? 'Não foi possível salvar as alterações.' : null
              }
              terminology={terminology}
              categories={categories.data?.items ?? []}
              fields="public"
              submitLabel="Salvar apresentação"
              onSave={savePublic}
            />
          </article>
        </div>
      )}
    </section>
  );
}
