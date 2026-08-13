import {
  CreateServiceRequestSchema,
  ServiceCategoryListResponseSchema,
  ServicePublicSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ServiceForm, type ServiceSubmission } from './ServiceForm.js';
import { httpClient } from '../../lib/http.js';
import { PageHeader } from '../ui/AppUi.js';

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxBytes = 5 * 1024 * 1024;

/**
 * Cadastro em página inteira. A imagem é escolhida aqui e enviada logo após a
 * criação, quando já existe o publicId exigido pelo endpoint de upload.
 */
export function ServiceCreatePage({
  tenantPublicId,
  terminology = 'Serviço',
}: {
  tenantPublicId: string;
  terminology?: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [imageWarning, setImageWarning] = useState<string | null>(null);

  const previewRef = useRef<string | null>(null);
  // A pré-visualização acompanha a escolha do arquivo; o effect só libera a URL ao sair.
  const setSelection = (next: File | null) => {
    if (previewRef.current !== null) URL.revokeObjectURL(previewRef.current);
    previewRef.current = next === null ? null : URL.createObjectURL(next);
    setFile(next);
    setPreview(previewRef.current);
  };
  useEffect(
    () => () => {
      if (previewRef.current !== null) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

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
    mutationFn: async (body: ServiceSubmission) => {
      const service = await httpClient.request('/tenant/services', {
        method: 'POST',
        body: CreateServiceRequestSchema.parse(body),
        schema: ServicePublicSchema,
        tenantPublicId,
      });
      if (file !== null) {
        // O serviço já existe: uma falha aqui não desfaz o cadastro.
        try {
          const form = new FormData();
          form.set('file', file, file.name);
          await httpClient.request(`/tenant/services/${service.publicId}/image`, {
            method: 'PUT',
            body: form,
            schema: ServicePublicSchema,
            tenantPublicId,
          });
        } catch {
          return { service, imageFailed: true };
        }
      }
      return { service, imageFailed: false };
    },
    onSuccess: async ({ service, imageFailed }) => {
      await queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'services'] });
      if (imageFailed) {
        setImageWarning(
          'O serviço foi criado, mas a imagem não pôde ser enviada. Envie novamente na guia Apresentação pública.',
        );
        return;
      }
      void navigate(`/app/servicos/${service.publicId}`);
    },
  });
  const created = create.data?.service;

  const choose = (selected: File | undefined) => {
    if (selected === undefined) return;
    if (!allowedTypes.has(selected.type) || selected.size > maxBytes) {
      setFileError('Selecione uma imagem JPEG, PNG ou WebP de até 5 MB.');
      return;
    }
    setFileError(null);
    setSelection(selected);
  };

  return (
    <section className="sessions-panel service-editor">
      <button className="crm-back-button" onClick={() => void navigate('/app/servicos')}>
        ← {terminology}s
      </button>
      <PageHeader
        eyebrow="Catálogo"
        title={`Novo ${terminology.toLowerCase()}`}
        description="Defina os dados operacionais e a apresentação pública deste atendimento."
      />
      {imageWarning !== null && created !== undefined ? (
        <div className="app-card service-image-warning" role="alert">
          <strong>{imageWarning}</strong>
          <button
            className="primary-button"
            type="button"
            onClick={() => void navigate(`/app/servicos/${created.publicId}`)}
          >
            Abrir {terminology.toLowerCase()}
          </button>
        </div>
      ) : null}
      <article className="app-card service-editor-card">
        <ServiceForm
          busy={create.isPending}
          error={create.error instanceof Error ? create.error.message : null}
          categories={categories.data?.items ?? []}
          submitLabel={`Criar ${terminology.toLowerCase()}`}
          imageSlot={
            <div className="service-image-picker">
              <div className="service-image-frame">
                {preview === null ? (
                  <div className="service-image-empty">
                    <span aria-hidden="true">🖼</span>
                    <strong>Sem imagem</strong>
                    <small>JPG, PNG ou WebP de até 5 MB.</small>
                  </div>
                ) : (
                  <img alt="Pré-visualização da imagem" src={preview} />
                )}
              </div>
              <div className="service-image-actions">
                <label className="secondary-button service-image-button">
                  {file === null ? 'Escolher imagem' : 'Trocar imagem'}
                  <input
                    accept="image/jpeg,image/png,image/webp"
                    type="file"
                    onChange={(event) => {
                      choose(event.target.files?.[0]);
                    }}
                  />
                </label>
                {file !== null ? (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      setSelection(null);
                    }}
                  >
                    Remover
                  </button>
                ) : null}
              </div>
              {fileError !== null ? (
                <p className="form-error" role="alert">
                  {fileError}
                </p>
              ) : null}
              <small className="muted">
                A imagem é enviada automaticamente assim que o {terminology.toLowerCase()} for
                criado.
              </small>
            </div>
          }
          onCancel={() => void navigate('/app/servicos')}
          onSave={(value) => create.mutateAsync(value).then(() => undefined)}
        />
      </article>
    </section>
  );
}
