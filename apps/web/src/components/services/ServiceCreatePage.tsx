import {
  CreateServiceRequestSchema,
  ServiceCategoryListResponseSchema,
  ServicePublicSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { ServiceForm, type ServiceSubmission } from './ServiceForm.js';
import { httpClient } from '../../lib/http.js';
import { PageHeader } from '../ui/AppUi.js';

/** Cadastro no corpo da página: o mesmo formulário do detalhe, sem drawer. */
export function ServiceCreatePage({
  tenantPublicId,
  terminology = 'Serviço',
}: {
  tenantPublicId: string;
  terminology?: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
      <article className="app-card service-editor-card">
        <ServiceForm
          busy={create.isPending}
          error={create.error instanceof Error ? create.error.message : null}
          terminology={terminology}
          categories={categories.data?.items ?? []}
          submitLabel={`Criar ${terminology.toLowerCase()}`}
          onCancel={() => void navigate('/app/servicos')}
          onSave={(value) => create.mutateAsync(value).then(() => undefined)}
        />
      </article>
      <p className="muted">
        A imagem do {terminology.toLowerCase()} pode ser enviada logo após a criação, na guia
        Apresentação pública.
      </p>
    </section>
  );
}
