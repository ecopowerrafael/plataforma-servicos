import {
  CreateServiceRequestSchema,
  ServiceListResponseSchema,
  ServicePublicSchema,
  ServiceStatusResponseSchema,
  ServiceCategoryListResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { type z } from 'zod';

import { httpClient } from '../../lib/http.js';
import { ConfirmationDialog, type ConfirmationRequest } from '../ConfirmationDialog.js';
import { ServiceForm, type ServiceSubmission } from './ServiceForm.js';
import { ServiceImageUpload } from './ServiceImageUpload.js';
import { ServiceVariations } from './ServiceVariations.js';
import { TenantServiceImage } from './TenantServiceImage.js';
import { ProfessionalServiceLinks } from '../professionals/ProfessionalServiceLinks.js';
import { PageToolbar, StatusBadge } from '../ui/AppUi.js';

export function ServiceModule({
  tenantPublicId,
  terminology = 'Servi\u00e7o',
}: {
  tenantPublicId: string;
  terminology?: string;
}) {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const services = useQuery({
    queryKey: ['tenant', tenantPublicId, 'services', page, search, active],
    queryFn: () => {
      const query = new URLSearchParams({ page: String(page), limit: '10' });
      if (search.trim() !== '') query.set('search', search.trim());
      if (active !== '') query.set('active', active);
      return httpClient.request(`/tenant/services?${query.toString()}`, {
        schema: ServiceListResponseSchema,
        tenantPublicId,
      });
    },
    retry: false,
  });
  const detail = useQuery({
    queryKey: ['tenant', tenantPublicId, 'service', selected],
    queryFn: () =>
      httpClient.request(`/tenant/services/${selected ?? ''}`, {
        schema: ServicePublicSchema,
        tenantPublicId,
      }),
    enabled: selected !== null,
    retry: false,
  });
  const categories = useQuery({
    queryKey: ['tenant', tenantPublicId, 'service-categories', 'active'],
    queryFn: () =>
      httpClient.request('/tenant/service-categories?limit=100&active=true', {
        schema: ServiceCategoryListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: ({
      url,
      method = 'POST',
      body,
      schema = ServicePublicSchema,
    }: {
      url: string;
      method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      body?: unknown;
      schema?: z.ZodType;
    }) =>
      httpClient.request(url, {
        method,
        ...(body === undefined ? {} : { body }),
        schema,
        tenantPublicId,
      }),
    onSuccess: async () => {
      setNotice('Opera\u00e7\u00e3o conclu\u00edda com sucesso.');
      await Promise.all([
        client.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'services'] }),
        client.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'service', selected] }),
      ]);
    },
  });
  const save = async (value: ServiceSubmission) => {
    const result = await mutation.mutateAsync({
      url: selected === null ? '/tenant/services' : `/tenant/services/${selected}`,
      method: selected === null ? 'POST' : 'PATCH',
      body: CreateServiceRequestSchema.parse(value),
    });
    const parsed = ServicePublicSchema.parse(result);
    setSelected(parsed.publicId);
    setCreating(false);
  };
  const updateImage = async (file: File) => {
    if (selected === null) return;
    const body = new FormData();
    body.set('file', file, file.name);
    await mutation.mutateAsync({ url: `/tenant/services/${selected}/image`, method: 'PUT', body });
  };
  const removeImage = async () => {
    if (selected === null) return;
    await mutation.mutateAsync({ url: `/tenant/services/${selected}/image`, method: 'DELETE' });
  };
  const requestRemoveImage = () => {
    setConfirmation({
      title: 'Remover imagem?',
      description: 'A imagem principal ser\u00e1 removida deste item.',
      confirmLabel: 'Remover imagem',
      requiresReason: false,
      variant: 'danger',
      onConfirm: removeImage,
    });
    return Promise.resolve();
  };
  const requestStatus = (enabled: boolean) => {
    if (selected === null) return;
    setConfirmation({
      title: enabled
        ? `Ativar ${terminology.toLowerCase()}?`
        : `Desativar ${terminology.toLowerCase()}?`,
      description: enabled
        ? 'O item voltar\u00e1 a ficar dispon\u00edvel.'
        : 'O item deixar\u00e1 de ficar dispon\u00edvel.',
      confirmLabel: enabled ? 'Ativar' : 'Desativar',
      requiresReason: false,
      variant: enabled ? 'default' : 'danger',
      onConfirm: async () => {
        await mutation.mutateAsync({
          url: `/tenant/services/${selected}/${enabled ? 'activate' : 'deactivate'}`,
          schema: ServiceStatusResponseSchema,
        });
      },
    });
  };
  return (
    <section aria-labelledby="service-title" className="sessions-panel">
      <p className="eyebrow">Cat\u00e1logo</p>
      <h2 id="service-title">{`${terminology}s`}</h2>
      {notice !== null && <p className="success-message">{notice}</p>}
      <button
        onClick={() => {
          setCreating((value) => !value);
        }}
        type="button"
      >
        {creating ? 'Fechar cria\u00e7\u00e3o' : `Criar ${terminology.toLowerCase()}`}
      </button>
      {creating && (
        <ServiceForm
          busy={mutation.isPending}
          error={mutation.error instanceof Error ? mutation.error.message : null}
          terminology={terminology}
          categories={categories.data?.items ?? []}
          onSave={save}
        />
      )}
      <PageToolbar>
        <label>
          Busca
          <input
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
            placeholder={`Nome do ${terminology.toLowerCase()}`}
            value={search}
          />
        </label>
        <label>
          Status
          <select
            onChange={(event) => {
              setPage(1);
              setActive(event.target.value);
            }}
            value={active}
          >
            <option value="">Todos</option>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
          </select>
        </label>
      </PageToolbar>
      {services.isPending ? (
        <p>{`Carregando ${terminology.toLowerCase()}s\u2026`}</p>
      ) : services.error instanceof Error ? (
        <p className="form-error">{`N\u00e3o foi poss\u00edvel carregar ${terminology.toLowerCase()}s.`}</p>
      ) : services.data === undefined || services.data.items.length === 0 ? (
        <p>Nenhum item encontrado.</p>
      ) : (
        <>
          <div className="data-list">
            {services.data.items.map((service) => (
              <button
                className="data-row"
                key={service.publicId}
                onClick={() => {
                  setSelected(service.publicId);
                  setCreating(false);
                }}
                type="button"
              >
                <TenantServiceImage
                  alt={service.imageAlt ?? service.name}
                  servicePublicId={service.publicId}
                  tenantPublicId={tenantPublicId}
                />
                <span>{service.name}</span>
                <span>{`${String(service.durationMinutes)} min`}</span>
                <StatusBadge active={service.active}>
                  {service.active ? 'Ativo' : 'Inativo'}
                </StatusBadge>
              </button>
            ))}
          </div>
          <div className="form-actions">
            <button
              disabled={page <= 1}
              onClick={() => {
                setPage((value) => value - 1);
              }}
              type="button"
            >
              Anterior
            </button>
            <span>{`P\u00e1gina ${String(services.data.page.page)} de ${String(services.data.page.totalPages)}`}</span>
            <button
              disabled={page >= services.data.page.totalPages}
              onClick={() => {
                setPage((value) => value + 1);
              }}
              type="button"
            >
              Pr\u00f3xima
            </button>
          </div>
          <ProfessionalServiceLinks
            tenantPublicId={tenantPublicId}
            servicePublicId={selected ?? ''}
          />
        </>
      )}
      {detail.data !== undefined && (
        <article className="sessions-panel">
          <h3>{detail.data.name}</h3>
          {detail.data.imageUrl !== null && (
            <TenantServiceImage
              alt={detail.data.imageAlt ?? detail.data.name}
              servicePublicId={detail.data.publicId}
              tenantPublicId={tenantPublicId}
            />
          )}
          <dl className="platform-details">
            <div>
              <dt>Dura\u00e7\u00e3o</dt>
              <dd>{`${String(detail.data.durationMinutes)} minutos`}</dd>
            </div>
            <div>
              <dt>Pausa</dt>
              <dd>
                {detail.data.hasPostServiceBreak
                  ? `${String(detail.data.postServiceBreakMinutes)} minutos`
                  : 'Sem pausa'}
              </dd>
            </div>
            <div>
              <dt>Pre\u00e7o</dt>
              <dd>{detail.data.priceCents}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{detail.data.active ? 'Ativo' : 'Inativo'}</dd>
            </div>
          </dl>
          <ServiceForm
            busy={mutation.isPending}
            error={mutation.error instanceof Error ? mutation.error.message : null}
            service={detail.data}
            terminology={terminology}
            categories={categories.data?.items ?? []}
            onSave={save}
          />
          <ServiceImageUpload
            busy={mutation.isPending}
            hasImage={detail.data.imageUrl !== null}
            onRemove={requestRemoveImage}
            onUpload={updateImage}
          />
          <ServiceVariations
            servicePublicId={detail.data.publicId}
            tenantPublicId={tenantPublicId}
          />
          <div className="form-actions">
            <button
              disabled={mutation.isPending || detail.data.active}
              onClick={() => {
                requestStatus(true);
              }}
              type="button"
            >
              Ativar
            </button>
            <button
              disabled={mutation.isPending || !detail.data.active}
              onClick={() => {
                requestStatus(false);
              }}
              type="button"
            >
              Desativar
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
