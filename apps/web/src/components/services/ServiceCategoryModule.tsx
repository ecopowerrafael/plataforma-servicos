import {
  CreateServiceCategoryRequestSchema,
  ServiceCategoryListResponseSchema,
  ServiceCategoryPublicSchema,
  ServiceCategoryStatusResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';
import { ConfirmationDialog, type ConfirmationRequest } from '../ConfirmationDialog.js';
import { ServiceCategoryForm } from './ServiceCategoryForm.js';

export function ServiceCategoryModule({ tenantPublicId }: { tenantPublicId: string }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
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
  const mutation = useMutation<
    unknown,
    Error,
    { url: string; method: 'POST' | 'PATCH'; body?: unknown; status?: boolean }
  >({
    mutationFn: (input) =>
      input.status === true || input.status === false
        ? httpClient.request(input.url, {
            method: 'POST',
            schema: ServiceCategoryStatusResponseSchema,
            tenantPublicId,
          })
        : httpClient.request(input.url, {
            method: input.method,
            body: input.body,
            schema: ServiceCategoryPublicSchema,
            tenantPublicId,
          }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['tenant', tenantPublicId, 'service-categories'],
      });
      await queryClient.invalidateQueries({
        queryKey: ['tenant', tenantPublicId, 'service-category', selected],
      });
    },
  });
  const save = async (value: Parameters<typeof CreateServiceCategoryRequestSchema.parse>[0]) => {
    const result = await mutation.mutateAsync({
      url:
        selected === null ? '/tenant/service-categories' : `/tenant/service-categories/${selected}`,
      method: selected === null ? 'POST' : 'PATCH',
      body: CreateServiceCategoryRequestSchema.parse(value),
    });
    setSelected(ServiceCategoryPublicSchema.parse(result).publicId);
    setCreating(false);
  };
  const status = (active: boolean) => {
    if (selected === null) return;
    setConfirmation({
      title: active ? 'Ativar categoria?' : 'Desativar categoria?',
      description: active
        ? 'A categoria voltar\u00e1 a estar dispon\u00edvel.'
        : 'A categoria n\u00e3o poder\u00e1 ser atribu\u00edda a novos servi\u00e7os.',
      confirmLabel: active ? 'Ativar' : 'Desativar',
      requiresReason: false,
      variant: active ? 'default' : 'danger',
      onConfirm: async () => {
        await mutation.mutateAsync({
          url: `/tenant/service-categories/${selected}/${active ? 'activate' : 'deactivate'}`,
          method: 'POST',
          status: active,
        });
      },
    });
  };
  return (
    <section className="sessions-panel">
      <p className="eyebrow">Catálogo</p>
      <h2>Categorias de serviços</h2>
      <button
        type="button"
        onClick={() => {
          setCreating((value) => !value);
        }}
      >
        {creating ? 'Fechar criação' : 'Criar categoria'}
      </button>
      {creating && (
        <ServiceCategoryForm
          busy={mutation.isPending}
          error={mutation.error instanceof Error ? mutation.error.message : null}
          onSave={save}
        />
      )}
      {list.isPending ? (
        <p>Carregando categorias\u2026</p>
      ) : (
        list.data?.items.map((category) => (
          <button
            className="data-row"
            key={category.publicId}
            type="button"
            onClick={() => {
              setSelected(category.publicId);
              setCreating(false);
            }}
          >
            <span>{category.name}</span>
            <span>{category.active ? 'Ativa' : 'Inativa'}</span>
          </button>
        ))
      )}
      {detail.data !== undefined && (
        <article className="sessions-panel">
          <h3>{detail.data.name}</h3>
          <ServiceCategoryForm
            category={detail.data}
            busy={mutation.isPending}
            error={mutation.error instanceof Error ? mutation.error.message : null}
            onSave={save}
          />
          <button
            disabled={mutation.isPending || detail.data.active}
            type="button"
            onClick={() => {
              status(true);
            }}
          >
            Ativar
          </button>
          <button
            disabled={mutation.isPending || !detail.data.active}
            type="button"
            onClick={() => {
              status(false);
            }}
          >
            Desativar
          </button>
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
