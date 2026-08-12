import {
  CreateServiceRequestSchema,
  ServiceCategoryListResponseSchema,
  ServiceListResponseSchema,
  ServicePublicSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ServiceForm, type ServiceSubmission } from './ServiceForm.js';
import { TenantServiceImage } from './TenantServiceImage.js';
import { httpClient } from '../../lib/http.js';
import {
  EmptyState,
  ListSkeleton,
  PageHeader,
  PageToolbar,
  Pagination,
  StatusBadge,
} from '../ui/AppUi.js';

const money = (cents: string) =>
  (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function ServiceModule({
  tenantPublicId,
  terminology = 'Serviço',
}: {
  tenantPublicId: string;
  terminology?: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState('');
  const [category, setCategory] = useState('');
  const [creating, setCreating] = useState(false);
  const services = useQuery({
    queryKey: ['tenant', tenantPublicId, 'services', page, search, active],
    queryFn: () => {
      const q = new URLSearchParams({ page: String(page), limit: '10' });
      if (search.trim()) q.set('search', search.trim());
      if (active) q.set('active', active);
      return httpClient.request(`/tenant/services?${q}`, {
        schema: ServiceListResponseSchema,
        tenantPublicId,
      });
    },
    retry: false,
  });
  const categories = useQuery({
    queryKey: ['tenant', tenantPublicId, 'service-categories'],
    queryFn: () =>
      httpClient.request('/tenant/service-categories?limit=100&active=true', {
        schema: ServiceCategoryListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const create = useMutation({
    mutationFn: (body: ServiceSubmission) =>
      httpClient.request('/tenant/services', {
        method: 'POST',
        body: CreateServiceRequestSchema.parse(body),
        schema: ServicePublicSchema,
        tenantPublicId,
      }),
    onSuccess: async (service) => {
      await queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'services'] });
      void navigate(`/app/servicos/${service.publicId}`);
    },
  });
  const items =
    services.data?.items.filter(
      (service) => category === '' || service.categoryPublicId === category,
    ) ?? [];
  return (
    <section className="sessions-panel service-catalog">
      <PageHeader
        eyebrow="Catálogo"
        title={`${terminology}s`}
        description="Gerencie o que seus clientes podem agendar."
        actions={
          <button className="primary-button" type="button" onClick={() => { setCreating(true); }}>
            + Novo serviço
          </button>
        }
      />
      {creating && (
        <div className="app-drawer">
          <ServiceForm
            busy={create.isPending}
            error={create.error instanceof Error ? 'Não foi possível salvar o serviço.' : null}
            terminology={terminology}
            categories={categories.data?.items ?? []}
            onSave={(value) => create.mutateAsync(value).then(() => undefined)}
          />
          <button className="secondary-button" type="button" onClick={() => { setCreating(false); }}>
            Cancelar
          </button>
        </div>
      )}
      <PageToolbar>
        <label className="ds-field--wide">
          Busca
          <input
            value={search}
            placeholder="Buscar por nome"
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
          />
        </label>
        <label>
          Categoria
          <select value={category} onChange={(event) => { setCategory(event.target.value); }}>
            <option value="">Todas</option>
            {categories.data?.items.map((item) => (
              <option key={item.publicId} value={item.publicId}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={active}
            onChange={(event) => {
              setPage(1);
              setActive(event.target.value);
            }}
          >
            <option value="">Todos</option>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
          </select>
        </label>
      </PageToolbar>
      {services.isPending ? (
        <ListSkeleton rows={6} />
      ) : services.error instanceof Error ? (
        <EmptyState
          title="Não foi possível carregar os serviços."
          description="Tente novamente."
          action={<button onClick={() => void services.refetch()}>Tentar novamente</button>}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="Crie seu primeiro serviço"
          description="Cadastre o que seus clientes poderão agendar."
          action={<button onClick={() => { setCreating(true); }}>+ Criar serviço</button>}
        />
      ) : (
        <>
          <div className="service-catalog-list">
            {items.map((service) => (
              <button
                key={service.publicId}
                className="service-catalog-row"
                type="button"
                onClick={() => void navigate(`/app/servicos/${service.publicId}`)}
              >
                <TenantServiceImage
                  alt={service.imageAlt ?? service.name}
                  servicePublicId={service.publicId}
                  tenantPublicId={tenantPublicId}
                />
                <span>
                  <strong>{service.name}</strong>
                  <small>
                    {service.categoryName ?? 'Sem categoria'} · {service.enabledProfessionalCount ?? 0}{' '}
                    profissional(is)
                  </small>
                </span>
                <span>
                  <strong>{money(service.priceCents)}</strong>
                  <small>{service.durationMinutes} min</small>
                </span>
                <StatusBadge active={service.active}>
                  {service.active ? 'Ativo' : 'Inativo'}
                </StatusBadge>
                <i aria-hidden="true">›</i>
              </button>
            ))}
          </div>
          <Pagination
            page={services.data?.page.page ?? 1}
            totalPages={services.data?.page.totalPages ?? 1}
            onPrevious={() => { setPage((value) => value - 1); }}
            onNext={() => { setPage((value) => value + 1); }}
          />
        </>
      )}
    </section>
  );
}
