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
    enabled: editing,
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
      {tab === 'overview' && (
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
            <p className="ds-eyebrow">Descrição</p>
            <p>{service.description ?? 'Sem descrição pública cadastrada.'}</p>
          </article>
        </div>
      )}
      {tab === 'professionals' && (
        <ProfessionalServiceLinks tenantPublicId={tenantPublicId} servicePublicId={publicId} />
      )}{' '}
      {tab === 'public' && (
        <div className="service-profile-grid">
          <article className="app-card">
            <h3>Como aparece no booking</h3>
            <p>Nome, categoria, preço, duração e imagem usam os mesmos dados do catálogo.</p>
            <p>
              {service.active
                ? 'Este serviço está disponível para novos agendamentos quando houver profissional habilitado.'
                : 'Este serviço está inativo e não fica disponível para novos agendamentos.'}
            </p>
          </article>
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
            />
          </article>
        </div>
      )}
      {editing && (
        <div className="app-drawer">
          <div className="drawer-header">
            <h3>Editar {terminology.toLowerCase()}</h3>
            <button
              className="secondary-button"
              onClick={() => {
                setEditing(false);
              }}
            >
              Fechar
            </button>
          </div>
          <ServiceForm
            service={service}
            busy={mutate.isPending}
            error={mutate.error instanceof Error ? 'Não foi possível salvar as alterações.' : null}
            terminology={terminology}
            categories={categories.data?.items ?? []}
            onSave={save}
          />
        </div>
      )}
    </section>
  );
}
