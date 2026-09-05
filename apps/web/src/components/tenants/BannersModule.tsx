import {
  SuccessResponseSchema,
  TenantMediaAssetSchema,
  TenantMediaListResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { environment } from '../../config/environment.js';
import { httpClient } from '../../lib/http.js';
import { BrandAssetDropzone } from '../branding/BrandAssetDropzone.js';

type BannerKind = 'BANNER_DESKTOP' | 'BANNER_MOBILE';

export function BannersModule({ tenantPublicId }: { tenantPublicId: string }) {
  const client = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const queryKey = ['tenant', tenantPublicId, 'media'];
  const media = useQuery({
    queryKey,
    queryFn: () =>
      httpClient.request('/tenant/media', {
        schema: TenantMediaListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const settings = media;
  const refresh = async () => {
    await client.invalidateQueries({ queryKey });
  };
  const upload = useMutation({
    mutationFn: ({ kind, file }: { kind: BannerKind; file: File }) => {
      const body = new FormData();
      body.set('file', file, file.name);
      return httpClient.request(`/tenant/media/${kind}`, {
        method: 'POST',
        body,
        schema: TenantMediaAssetSchema,
        tenantPublicId,
      });
    },
    onSuccess: async () => {
      setNotice('Banner atualizado e publicado.');
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (publicId: string) =>
      httpClient.request(`/tenant/media/${publicId}`, {
        method: 'DELETE',
        schema: SuccessResponseSchema,
        tenantPublicId,
      }),
    onSuccess: async () => {
      setNotice('Banner removido.');
      await refresh();
    },
  });
  if (settings.isPending) return <section className="module-loading">Carregando banners…</section>;
  if (media.error instanceof Error || media.data === undefined)
    return (
      <section className="area-error-state">
        <h2>Não foi possível carregar os banners.</h2>
      </section>
    );
  const asset = (kind: BannerKind) => media.data.assets.find((item) => item.kind === kind);
  const hasBanners = asset('BANNER_DESKTOP') !== undefined || asset('BANNER_MOBILE') !== undefined;
  const url = (kind: BannerKind) => {
    const current = asset(kind);
    return current === undefined ? undefined : `${environment.apiUrl}${current.url}`;
  };
  const removeKind = (kind: BannerKind) => {
    const current = asset(kind);
    if (current !== undefined) remove.mutate(current.publicId);
  };
  return (
    <section className="banner-manager" aria-labelledby="banners-title">
      <div className="module-header">
        <div>
          <p className="eyebrow">Minha empresa</p>
          <h2 id="banners-title">Banners</h2>
          <p>
            Use banners para divulgar promoções, novidades e campanhas na página inicial do seu
            estabelecimento.
          </p>
        </div>
        <a className="primary-button" href="#banner-uploads">
          + Novo banner
        </a>
      </div>
      {notice === null ? null : <p className="success-message">{notice}</p>}
      {!hasBanners ? (
        <div className="empty-state" role="status">
          <p>Nenhum banner cadastrado ainda.</p>
          <a className="secondary-button" href="#banner-uploads">
            Adicionar banner
          </a>
        </div>
      ) : null}
      {upload.error instanceof Error || remove.error instanceof Error ? (
        <p className="form-error">
          {upload.error instanceof Error
            ? upload.error.message
            : remove.error instanceof Error
              ? remove.error.message
              : ''}
        </p>
      ) : null}
      <div className="banner-manager-grid" id="banner-uploads">
        <BrandAssetDropzone
          title="Banner para desktop"
          description="Recomendado: proporção 16:6, até 4096 px. O conteúdo central permanece visível em telas largas."
          previewUrl={url('BANNER_DESKTOP')}
          busy={upload.isPending || remove.isPending}
          onUpload={(file) => {
            upload.mutate({ kind: 'BANNER_DESKTOP', file });
          }}
          onRemove={
            asset('BANNER_DESKTOP') === undefined
              ? undefined
              : () => {
                  removeKind('BANNER_DESKTOP');
                }
          }
        />
        <BrandAssetDropzone
          title="Banner para celular"
          description="Recomendado: proporção 4:5. Esta imagem evita cortes inadequados no celular."
          previewUrl={url('BANNER_MOBILE')}
          busy={upload.isPending || remove.isPending}
          onUpload={(file) => {
            upload.mutate({ kind: 'BANNER_MOBILE', file });
          }}
          onRemove={
            asset('BANNER_MOBILE') === undefined
              ? undefined
              : () => {
                  removeKind('BANNER_MOBILE');
                }
          }
        />
      </div>
      <aside className="brand-info-alert">
        <strong>Exibição responsiva</strong>
        <span>
          A página pública usa automaticamente a imagem correta para desktop ou celular. Cada novo
          upload substitui com segurança o banner anterior daquele formato.
        </span>
      </aside>
    </section>
  );
}
