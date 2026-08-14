import { TenantPwaResponseSchema } from '@plataforma/shared';
import { IconCheck, IconDeviceMobile, IconX } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { httpClient, HttpError } from '../../lib/http.js';
import {
  InlineAlert,
  ListSkeleton,
  PageHeader,
  SectionCard,
  StatusBadge,
} from '../ui/AppUi.js';

const CHECKLIST_LABELS: Record<string, string> = {
  appName: 'Nome do aplicativo',
  publicPage: 'Página pública válida',
  icon: 'Ícone do aplicativo enviado',
  iconSquare: 'Ícone quadrado (proporção 1:1)',
  iconMinimumSize: 'Ícone com pelo menos 512×512 px',
  iconDerivatives: 'Versões 192×192 e 512×512 disponíveis',
  branding: 'Identidade visual configurada',
};

export function TenantPwaModule({
  tenantPublicId,
  canManage,
}: {
  tenantPublicId: string;
  canManage: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const queryKey = ['tenant', tenantPublicId, 'pwa'];

  const pwa = useQuery({
    queryKey,
    queryFn: () =>
      httpClient.request('/tenant/pwa', { schema: TenantPwaResponseSchema, tenantPublicId }),
    retry: false,
  });

  const publish = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/pwa/publish', {
        method: 'POST',
        schema: TenantPwaResponseSchema,
        tenantPublicId,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const publishError =
    publish.error instanceof HttpError
      ? publish.error.message
      : publish.error instanceof Error
        ? publish.error.message
        : null;

  const data = pwa.data;
  const published = data?.status === 'PUBLISHED';

  return (
    <div className="ds-stack" aria-label="Aplicativo">
      <PageHeader
        eyebrow="Minha empresa"
        title="Aplicativo"
        description="Seus clientes podem instalar sua página pública como aplicativo no celular."
      />

      {pwa.isPending ? <ListSkeleton rows={3} /> : null}
      {pwa.error instanceof Error ? (
        <InlineAlert
          tone="danger"
          title="Não foi possível carregar o aplicativo"
          action={
            <button className="secondary-button" type="button" onClick={() => void pwa.refetch()}>
              Tentar novamente
            </button>
          }
        >
          Verifique sua conexão e tente novamente.
        </InlineAlert>
      ) : null}

      {data !== undefined && (
        <SectionCard
          title={data.appName}
          description={
            published
              ? 'Aplicativo publicado. Seus clientes veem a opção de instalar na página pública.'
              : 'Seu aplicativo ainda não foi publicado.'
          }
          actions={
            <StatusBadge tone={published ? 'success' : 'muted'}>
              {published ? 'Aplicativo publicado' : 'Rascunho'}
            </StatusBadge>
          }
        >
          {published ? (
            <>
              {data.publishedAt === null ? null : (
                <p className="muted">
                  {`Publicado em ${new Date(data.publishedAt).toLocaleDateString('pt-BR')}.`}
                </p>
              )}
              <InlineAlert tone="info" title="Alterações publicadas">
                Em aplicativos já instalados, algumas mudanças podem levar algum tempo para
                aparecer.
              </InlineAlert>
              <div className="ds-form-actions">
                <a className="primary-button" href={data.publicUrl} target="_blank" rel="noreferrer">
                  Instalar aplicativo
                </a>
                <a
                  className="secondary-button"
                  href={data.publicUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Pré-visualizar
                </a>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void navigate('/app/empresa/marca')}
                >
                  Editar aparência
                </button>
              </div>
            </>
          ) : (
            <>
              <ul className="pwa-checklist">
                {Object.entries(data.checklist).map(([key, done]) => (
                  <li className={done ? 'is-done' : 'is-pending'} key={key}>
                    {done ? (
                      <IconCheck size={16} aria-hidden="true" />
                    ) : (
                      <IconX size={16} aria-hidden="true" />
                    )}
                    {CHECKLIST_LABELS[key] ?? key}
                  </li>
                ))}
              </ul>
              {data.iconMessage === null ? null : (
                <InlineAlert tone="warning" title="Ícone do aplicativo">
                  {data.iconMessage}
                </InlineAlert>
              )}
              <p className="muted">
                Tela de abertura e banner são opcionais e podem ser ajustados depois.
              </p>
              {publishError !== null && (
                <p className="form-error" role="alert">
                  {publishError}
                </p>
              )}
              <div className="ds-form-actions">
                <button
                  className="primary-button"
                  disabled={!canManage || !data.ready || publish.isPending}
                  type="button"
                  onClick={() => {
                    publish.mutate();
                  }}
                >
                  <IconDeviceMobile size={16} aria-hidden="true" />
                  {publish.isPending ? 'Publicando…' : 'Publicar meu aplicativo'}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void navigate('/app/empresa/marca')}
                >
                  Editar aparência
                </button>
              </div>
            </>
          )}
        </SectionCard>
      )}
    </div>
  );
}
