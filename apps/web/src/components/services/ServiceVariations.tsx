import {
  CreateServiceVariationRequestSchema,
  ServiceVariationPublicSchema,
  ServiceVariationsResponseSchema,
  ServiceVariationStatusResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';
export function ServiceVariations({
  tenantPublicId,
  servicePublicId,
}: {
  tenantPublicId: string;
  servicePublicId: string;
}) {
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [duration, setDuration] = useState('');
  const [price, setPrice] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const url = `/tenant/services/${servicePublicId}/variations`;
  const variations = useQuery({
    queryKey: ['service-variations', url],
    queryFn: () =>
      httpClient.request(url, { schema: ServiceVariationsResponseSchema, tenantPublicId }),
  });
  const refresh = () => client.invalidateQueries({ queryKey: ['service-variations', url] });
  const reset = () => {
    setEditing(null);
    setName('');
    setDuration('');
    setPrice('');
  };
  const save = useMutation({
    mutationFn: () =>
      httpClient.request(editing === null ? url : `${url}/${editing}`, {
        method: editing === null ? 'POST' : 'PATCH',
        body: CreateServiceVariationRequestSchema.parse({
          name,
          durationMinutes: Number(duration),
          priceCents: Number(price),
          active: true,
        }),
        schema: ServiceVariationPublicSchema,
        tenantPublicId,
      }),
    onSuccess: () => {
      void refresh();
      reset();
    },
  });
  const status = useMutation({
    mutationFn: (item: { publicId: string; active: boolean }) =>
      httpClient.request(`${url}/${item.publicId}/${item.active ? 'activate' : 'deactivate'}`, {
        method: 'POST',
        schema: ServiceVariationStatusResponseSchema,
        tenantPublicId,
      }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (publicId: string) =>
      httpClient.request(`${url}/${publicId}`, {
        method: 'DELETE',
        schema: ServiceVariationStatusResponseSchema,
        tenantPublicId,
      }),
    onSuccess: refresh,
  });
  return (
    <section className="platform-form">
      <h4>Variações</h4>
      <input
        placeholder="Nome da variação"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
        }}
      />
      <input
        min="1"
        placeholder="Duração"
        type="number"
        value={duration}
        onChange={(e) => {
          setDuration(e.target.value);
        }}
      />
      <input
        min="0"
        placeholder="Preço em centavos"
        type="number"
        value={price}
        onChange={(e) => {
          setPrice(e.target.value);
        }}
      />
      <button
        disabled={name === '' || duration === '' || price === '' || save.isPending}
        type="button"
        onClick={() => void save.mutateAsync()}
      >
        {editing === null ? 'Adicionar' : 'Salvar'}
      </button>
      {editing !== null && (
        <button type="button" onClick={reset}>
          Cancelar
        </button>
      )}
      {variations.data?.items.map((x) => (
        <div key={x.publicId}>
          <span>{`${x.name} · ${String(x.durationMinutes)} min · ${String(x.priceCents)}`}</span>
          <span>{x.active ? ' Ativo' : ' Inativo'}</span>
          <button
            type="button"
            onClick={() => {
              setEditing(x.publicId);
              setName(x.name);
              setDuration(String(x.durationMinutes));
              setPrice(String(x.priceCents));
            }}
          >
            Editar
          </button>
          <button
            type="button"
            onClick={() => void status.mutateAsync({ publicId: x.publicId, active: !x.active })}
          >
            {x.active ? 'Desativar' : 'Ativar'}
          </button>
          <button type="button" onClick={() => void remove.mutateAsync(x.publicId)}>
            Remover
          </button>
        </div>
      ))}
    </section>
  );
}
