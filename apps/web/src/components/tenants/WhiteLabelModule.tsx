import {
  SuccessResponseSchema,
  TenantMediaAssetSchema,
  TenantPublicSiteSchema,
  TenantWhiteLabelResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { environment } from '../../config/environment.js';
import { httpClient } from '../../lib/http.js';
import { deriveBrandPalette, type BrandThemeCode } from '../branding/brand-studio.js';
import { BrandAssetDropzone } from '../branding/BrandAssetDropzone.js';
import { BrandColorPicker } from '../branding/BrandColorPicker.js';
import { BrandPreview } from '../branding/BrandPreview.js';
import { BrandThemePicker } from '../branding/BrandThemePicker.js';

type AssetKind = 'LOGO' | 'APP_ICON' | 'SPLASH';

export function WhiteLabelModule({ tenantPublicId }: { tenantPublicId: string }) {
  const client = useQueryClient();
  const queryKey = ['tenant', tenantPublicId, 'white-label'];
  const settings = useQuery({
    queryKey,
    queryFn: () =>
      httpClient.request('/tenant/white-label', {
        schema: TenantWhiteLabelResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const [themeOverride, setThemeOverride] = useState<BrandThemeCode | null>(null);
  const [colorOverride, setColorOverride] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'mobile' | 'desktop'>('mobile');
  const [notice, setNotice] = useState<string | null>(null);
  const theme = themeOverride ?? settings.data?.site.theme ?? 'CLASSIC';
  const color = colorOverride ?? settings.data?.branding.primaryColor ?? '#2457D6';
  const dirty = themeOverride !== null || colorOverride !== null;
  const refresh = async () => {
    await client.invalidateQueries({ queryKey });
  };
  const save = useMutation({
    mutationFn: async () => {
      const palette = deriveBrandPalette(color);
      await httpClient.request('/tenant/branding', {
        method: 'PATCH',
        tenantPublicId,
        body: { ...palette, useProfileDefaults: false },
        schema: TenantWhiteLabelResponseSchema,
      });
      await httpClient.request('/tenant/public-site', {
        method: 'PATCH',
        tenantPublicId,
        body: { theme },
        schema: TenantPublicSiteSchema,
      });
    },
    onSuccess: async () => {
      setThemeOverride(null);
      setColorOverride(null);
      setNotice('Identidade visual atualizada.');
      await refresh();
    },
  });
  const upload = useMutation({
    mutationFn: ({ kind, file }: { kind: AssetKind; file: File }) => {
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
      setNotice('Imagem atualizada com sucesso.');
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
      setNotice('Imagem removida.');
      await refresh();
    },
  });
  const assets = useMemo(
    () => new Map(settings.data?.assets.map((asset) => [asset.kind, asset])),
    [settings.data?.assets],
  );
  const assetUrl = (kind: AssetKind) => {
    const asset = assets.get(kind);
    return asset === undefined ? undefined : `${environment.apiUrl}${asset.url}`;
  };
  const removeKind = (kind: AssetKind) => {
    const asset = assets.get(kind);
    if (asset !== undefined) remove.mutate(asset.publicId);
  };
  if (settings.isPending)
    return (
      <section className="module-loading" aria-busy="true">
        Abrindo Brand Studio…
      </section>
    );
  if (settings.error instanceof Error || settings.data === undefined)
    return (
      <section className="area-error-state">
        <h2>Não foi possível carregar o Brand Studio.</h2>
        <button
          type="button"
          onClick={() => {
            void settings.refetch();
          }}
        >
          Tentar novamente
        </button>
      </section>
    );
  return (
    <section className="brand-studio" aria-labelledby="brand-studio-title">
      <div className="module-header brand-studio-header">
        <div>
          <p className="eyebrow">Minha empresa</p>
          <h2 id="brand-studio-title">Brand Studio</h2>
          <p>
            Crie uma experiência com a personalidade do seu negócio e acompanhe o resultado em tempo
            real.
          </p>
        </div>
        <a
          className="secondary-button"
          href={`/public/${settings.data.slug}`}
          target="_blank"
          rel="noreferrer"
        >
          Abrir página pública
        </a>
      </div>
      {notice === null ? null : <p className="success-message">{notice}</p>}
      {save.error instanceof Error ||
      upload.error instanceof Error ||
      remove.error instanceof Error ? (
        <p className="form-error">
          {save.error instanceof Error
            ? save.error.message
            : upload.error instanceof Error
              ? upload.error.message
              : remove.error instanceof Error
                ? remove.error.message
                : 'Não foi possível concluir a alteração.'}
        </p>
      ) : null}
      <div className="brand-studio-layout">
        <div className="brand-editor">
          <section className="brand-settings-card">
            <span className="brand-section-number">01</span>
            <h3>Logo</h3>
            <p>Use uma imagem nítida, preferencialmente com fundo transparente.</p>
            <BrandAssetDropzone
              title="Logo do estabelecimento"
              description="Será exibido na página pública e no aplicativo."
              previewUrl={assetUrl('LOGO')}
              busy={upload.isPending || remove.isPending}
              onUpload={(file) => {
                upload.mutate({ kind: 'LOGO', file });
              }}
              onRemove={
                assets.has('LOGO')
                  ? () => {
                      removeKind('LOGO');
                    }
                  : undefined
              }
            />
          </section>
          <section className="brand-settings-card">
            <span className="brand-section-number">02</span>
            <h3>Escolha um tema</h3>
            <p>Três direções visuais com composições realmente diferentes.</p>
            <BrandThemePicker
              value={theme}
              onChange={(value) => {
                setThemeOverride(value);
              }}
            />
          </section>
          <section className="brand-settings-card">
            <span className="brand-section-number">03</span>
            <BrandColorPicker
              value={color}
              onChange={(value) => {
                setColorOverride(value);
              }}
            />
          </section>
          <section className="brand-settings-card">
            <span className="brand-section-number">04</span>
            <h3>Tela de abertura</h3>
            <p>
              A tela de abertura é a imagem exibida por alguns instantes quando seu aplicativo é
              aberto.
            </p>
            <div className="brand-choice-row">
              <button
                className={assets.has('SPLASH') ? 'secondary-button' : 'primary-button'}
                type="button"
                onClick={() => {
                  removeKind('SPLASH');
                }}
              >
                Usar meu logo automaticamente
              </button>
              <span>ou envie uma imagem personalizada</span>
            </div>
            <BrandAssetDropzone
              title="Splash personalizada"
              description="Recomendamos uma imagem vertical com área central livre."
              previewUrl={assetUrl('SPLASH')}
              busy={upload.isPending || remove.isPending}
              onUpload={(file) => {
                upload.mutate({ kind: 'SPLASH', file });
              }}
              onRemove={
                assets.has('SPLASH')
                  ? () => {
                      removeKind('SPLASH');
                    }
                  : undefined
              }
            />
            <div className="brand-device-preview brand-device-preview--splash">
              {(assetUrl('SPLASH') ?? assetUrl('LOGO')) ? (
                <img
                  src={assetUrl('SPLASH') ?? assetUrl('LOGO')}
                  alt="Simulação da tela de abertura"
                />
              ) : (
                <strong>{settings.data.displayName}</strong>
              )}
            </div>
          </section>
          <section className="brand-settings-card">
            <span className="brand-section-number">05</span>
            <h3>Ícone do aplicativo</h3>
            <p>
              Este será o ícone exibido quando seus clientes ou sua equipe adicionarem o aplicativo
              à tela inicial.
            </p>
            <BrandAssetDropzone
              title="Ícone PWA"
              description="Use uma imagem quadrada, simples e legível em tamanho pequeno."
              previewUrl={assetUrl('APP_ICON')}
              busy={upload.isPending || remove.isPending}
              square
              onUpload={(file) => {
                upload.mutate({ kind: 'APP_ICON', file });
              }}
              onRemove={
                assets.has('APP_ICON')
                  ? () => {
                      removeKind('APP_ICON');
                    }
                  : undefined
              }
            />
            <div className="brand-home-screen-preview">
              <div>
                {assetUrl('APP_ICON') === undefined ? (
                  <span>{settings.data.displayName.slice(0, 1)}</span>
                ) : (
                  <img src={assetUrl('APP_ICON')} alt="Ícone instalado" />
                )}
                <small>{settings.data.site.pwaShortName ?? settings.data.displayName}</small>
              </div>
            </div>
          </section>
        </div>
        <aside className="brand-preview-panel">
          <div className="brand-preview-toolbar">
            <strong>Preview em tempo real</strong>
            <div role="tablist" aria-label="Formato do preview">
              <button
                className={previewMode === 'mobile' ? 'primary-button' : 'secondary-button'}
                type="button"
                onClick={() => {
                  setPreviewMode('mobile');
                }}
              >
                Celular
              </button>
              <button
                className={previewMode === 'desktop' ? 'primary-button' : 'secondary-button'}
                type="button"
                onClick={() => {
                  setPreviewMode('desktop');
                }}
              >
                Desktop
              </button>
            </div>
          </div>
          <BrandPreview
            displayName={settings.data.displayName}
            theme={theme}
            color={color}
            logoUrl={assetUrl('LOGO')}
            mode={previewMode}
          />
        </aside>
      </div>
      {dirty ? (
        <div className="brand-action-bar" role="status">
          <span>
            <strong>Alterações não salvas</strong>
            <small>O preview já mostra o novo resultado.</small>
          </span>
          <div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setThemeOverride(null);
                setColorOverride(null);
              }}
            >
              Descartar
            </button>
            <button
              className="primary-button"
              disabled={save.isPending || !/^#[0-9A-Fa-f]{6}$/u.test(color)}
              type="button"
              onClick={() => {
                save.mutate();
              }}
            >
              {save.isPending ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
