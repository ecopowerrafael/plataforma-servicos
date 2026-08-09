import {
  CreateProfessionalRequestSchema,
  ProfessionalListResponseSchema,
  ProfessionalPublicSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ProfessionalForm } from './ProfessionalForm.js';
import { ProfessionalSchedule } from './ProfessionalSchedule.js';
import { ProfessionalServiceLinks } from './ProfessionalServiceLinks.js';
import { ProfessionalUnavailability } from './ProfessionalUnavailability.js';
import { ProfessionalUnitLinks } from './ProfessionalUnitLinks.js';
import { httpClient } from '../../lib/http.js';

export function ProfessionalModule({
  tenantPublicId,
  terminology,
}: {
  tenantPublicId: string;
  terminology: string;
}) {
  const client = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const list = useQuery({
    queryKey: ['tenant', tenantPublicId, 'professionals'],
    queryFn: () =>
      httpClient.request('/tenant/professionals?limit=100', {
        schema: ProfessionalListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const detail = useQuery({
    queryKey: ['tenant', tenantPublicId, 'professional', selected],
    queryFn: () =>
      httpClient.request(`/tenant/professionals/${selected ?? ''}`, {
        schema: ProfessionalPublicSchema,
        tenantPublicId,
      }),
    enabled: selected !== null,
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (input: { url: string; method: 'POST' | 'PATCH'; body: unknown }) =>
      httpClient.request(input.url, {
        method: input.method,
        body: input.body,
        schema: ProfessionalPublicSchema,
        tenantPublicId,
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'professionals'] }),
  });
  const save = async (value: unknown) => {
    const out = await mutation.mutateAsync({
      url: selected === null ? '/tenant/professionals' : `/tenant/professionals/${selected}`,
      method: selected === null ? 'POST' : 'PATCH',
      body: CreateProfessionalRequestSchema.parse(value),
    });
    setSelected(out.publicId);
    setCreating(false);
  };
  const uploadPhoto = async (file: File) => {
    if (selected === null) return;
    const body = new FormData();
    body.set('file', file, file.name);
    await httpClient.request(`/tenant/professionals/${selected}/photo`, {
      method: 'PUT',
      body,
      schema: ProfessionalPublicSchema,
      tenantPublicId,
    });
    await client.invalidateQueries({
      queryKey: ['tenant', tenantPublicId, 'professional', selected],
    });
  };
  return (
    <section className="sessions-panel">
      <p className="eyebrow">Equipe</p>
      <h2>{`${terminology}s`}</h2>
      <button
        type="button"
        onClick={() => {
          setCreating((value) => !value);
        }}
      >
        {creating ? 'Fechar cria\u00e7\u00e3o' : `Criar ${terminology.toLowerCase()}`}
      </button>
      {creating && (
        <ProfessionalForm
          busy={mutation.isPending}
          error={mutation.error instanceof Error ? mutation.error.message : null}
          terminology={terminology}
          tenantPublicId={tenantPublicId}
          onSave={save}
        />
      )}
      {list.isPending ? (
        <p>Carregando profissionais\u2026</p>
      ) : (
        list.data?.items.map((professional) => (
          <button
            className="data-row"
            key={professional.publicId}
            type="button"
            onClick={() => {
              setSelected(professional.publicId);
            }}
          >
            <span>{professional.publicName}</span>
            <span>{professional.active ? 'Ativo' : 'Inativo'}</span>
          </button>
        ))
      )}
      {detail.data !== undefined && (
        <article className="sessions-panel">
          <h3>{detail.data.publicName}</h3>
          <ProfessionalForm
            professional={detail.data}
            busy={mutation.isPending}
            error={mutation.error instanceof Error ? mutation.error.message : null}
            terminology={terminology}
            tenantPublicId={tenantPublicId}
            onSave={save}
          />
          <label>
            Foto (JPEG, PNG ou WebP)
            <input
              accept="image/jpeg,image/png,image/webp"
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file !== undefined) void uploadPhoto(file);
              }}
            />
          </label>
          <ProfessionalUnitLinks
            tenantPublicId={tenantPublicId}
            professionalPublicId={detail.data.publicId}
          />
          <ProfessionalServiceLinks
            tenantPublicId={tenantPublicId}
            professionalPublicId={detail.data.publicId}
          />
          <ProfessionalSchedule
            tenantPublicId={tenantPublicId}
            professionalPublicId={detail.data.publicId}
          />
          <ProfessionalUnavailability
            tenantPublicId={tenantPublicId}
            professionalPublicId={detail.data.publicId}
          />
        </article>
      )}
    </section>
  );
}
