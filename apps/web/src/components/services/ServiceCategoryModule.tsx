import {
  CreateServiceCategoryRequestSchema,
  ServiceCategoryListResponseSchema,
  ServiceCategoryPublicSchema,
  ServiceCategoryStatusResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { type ZodType } from 'zod';

import { ServiceCategoryForm } from './ServiceCategoryForm.js';
import { httpClient } from '../../lib/http.js';
import { EmptyState, ListSkeleton, PageHeader, StatusBadge } from '../ui/AppUi.js';

export function ServiceCategoryModule({ tenantPublicId }: { tenantPublicId: string }) {
  const client = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const list = useQuery({
    queryKey: ['tenant', tenantPublicId, 'service-categories'],
    queryFn: () =>
      httpClient.request('/tenant/service-categories?limit=100', {
        schema: ServiceCategoryListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const detail = useQuery({
    queryKey: ['tenant', tenantPublicId, 'service-category', selected],
    queryFn: () =>
      httpClient.request(`/tenant/service-categories/${selected ?? ''}`, {
        schema: ServiceCategoryPublicSchema,
        tenantPublicId,
      }),
    enabled: selected !== null,
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: ({
      url,
      method,
      body,
      schema,
    }: {
      url: string;
      method: 'POST' | 'PATCH';
      body?: unknown;
      schema?: ZodType;
    }) =>
      httpClient.request(url, {
        method,
        ...(body === undefined ? {} : { body }),
        schema: schema ?? ServiceCategoryPublicSchema,
        tenantPublicId,
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'service-categories'] }),
  });
  const save = async (value: unknown) => {
    const output = await mutation.mutateAsync({
      url:
        selected === null ? '/tenant/service-categories' : `/tenant/service-categories/${selected}`,
      method: selected === null ? 'POST' : 'PATCH',
      body: CreateServiceCategoryRequestSchema.parse(value),
    });
    setSelected(ServiceCategoryPublicSchema.parse(output).publicId);
    setCreating(false);
  };
  return (
    <section className="sessions-panel category-catalog">
      <PageHeader
        eyebrow="Catálogo"
        title="Categorias"
        description="Organize a apresentação dos serviços."
        actions={
          <button className="primary-button" onClick={() => { setCreating(true); }}>
            + Nova categoria
          </button>
        }
      />
      {creating && (
        <div className="app-drawer">
          <ServiceCategoryForm
            busy={mutation.isPending}
            error={mutation.error instanceof Error ? 'Não foi possível salvar a categoria.' : null}
            onSave={save}
          />
          <button className="secondary-button" onClick={() => { setCreating(false); }}>
            Cancelar
          </button>
        </div>
      )}
      {list.isPending ? (
        <ListSkeleton rows={5} />
      ) : list.data?.items.length === 0 ? (
        <EmptyState
          title="Nenhuma categoria cadastrada"
          description="Crie categorias para organizar o catálogo público."
          action={<button onClick={() => { setCreating(true); }}>+ Criar categoria</button>}
        />
      ) : (
        <div className="service-catalog-list">
          {list.data?.items.map((item) => (
            <button
              className="service-catalog-row"
              key={item.publicId}
              onClick={() => {
                setSelected(item.publicId);
                setCreating(false);
              }}
            >
              <i style={{ background: item.color }} />
              <span>
                <strong>{item.name}</strong>
                <small>Ordem {item.sortOrder}</small>
              </span>
              <StatusBadge active={item.active}>{item.active ? 'Ativa' : 'Inativa'}</StatusBadge>
              <i>›</i>
            </button>
          ))}
        </div>
      )}
      {detail.data && (
        <div className="app-drawer">
          <div className="drawer-header">
            <h3>Editar categoria</h3>
            <button className="secondary-button" onClick={() => { setSelected(null); }}>
              Fechar
            </button>
          </div>
          <ServiceCategoryForm
            category={detail.data}
            busy={mutation.isPending}
            error={mutation.error instanceof Error ? 'Não foi possível salvar a categoria.' : null}
            onSave={save}
          />
          <button
            className="secondary-button"
            disabled={mutation.isPending}
            onClick={() =>
              void mutation.mutateAsync({
                url: `/tenant/service-categories/${detail.data.publicId}/${detail.data.active ? 'deactivate' : 'activate'}`,
                method: 'POST',
                schema: ServiceCategoryStatusResponseSchema,
              })
            }
          >
            {detail.data.active ? 'Desativar' : 'Ativar'}
          </button>
        </div>
      )}
    </section>
  );
}
