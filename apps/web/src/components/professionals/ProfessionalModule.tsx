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
import { TenantProfessionalPhoto } from './TenantProfessionalPhoto.js';
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
    <section className="sessions-panel professional-workspace">
      <header className="professional-workspace-header">
        <div><p className="eyebrow">Equipe</p><h2>{`${terminology}s`}</h2><p>Gerencie perfis, serviços, jornada e disponibilidade da equipe.</p></div>
      <button className="primary-button"
        type="button"
        onClick={() => {
          setCreating((value) => !value);
        }}
      >
        {creating ? 'Fechar criação' : `Adicionar ${terminology.toLowerCase()}`}
      </button>
      </header>
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
        <div className="professional-card-grid">
        {list.data?.items.map((professional) => (
          <button
            className={`professional-card${selected === professional.publicId ? ' selected' : ''}`}
            key={professional.publicId}
            type="button"
            onClick={() => {
              setSelected(professional.publicId);
            }}
          >
            <TenantProfessionalPhoto name={professional.publicName} professionalPublicId={professional.publicId} tenantPublicId={tenantPublicId} />
            <span><strong>{professional.publicName}</strong><small>{professional.specialties.length > 0 ? professional.specialties.join(' · ') : 'Sem especialidades'}</small></span>
            <span className={`status-badge ${professional.active ? 'status-active' : 'status-muted'}`}>{professional.active ? 'Ativo' : 'Inativo'}</span>
          </button>
        ))}
        {list.data?.items.length === 0 ? <div className="empty-state"><strong>Nenhum profissional cadastrado</strong><span>Adicione o primeiro perfil da sua equipe.</span></div> : null}
        </div>
      )}
      {detail.data !== undefined && (
        <article className="professional-detail">
          <header className="professional-detail-header">
            <TenantProfessionalPhoto name={detail.data.publicName} professionalPublicId={detail.data.publicId} tenantPublicId={tenantPublicId} size="large" />
            <div><p className="eyebrow">Perfil selecionado</p><h3>{detail.data.publicName}</h3><span className={`status-badge ${detail.data.active ? 'status-active' : 'status-muted'}`}>{detail.data.active ? 'Ativo' : 'Inativo'}</span></div>
            <label className="photo-upload-button">Alterar foto<input accept="image/jpeg,image/png,image/webp" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file !== undefined) void uploadPhoto(file); }} /></label>
          </header>
          <ProfessionalForm
            professional={detail.data}
            busy={mutation.isPending}
            error={mutation.error instanceof Error ? mutation.error.message : null}
            terminology={terminology}
            tenantPublicId={tenantPublicId}
            onSave={save}
          />
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
