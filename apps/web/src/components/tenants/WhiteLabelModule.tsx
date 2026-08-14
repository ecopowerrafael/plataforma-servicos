import {
  SuccessResponseSchema,
  TenantMediaAssetSchema,
  TenantPublicSiteSchema,
  TenantWhiteLabelResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { environment } from '../../config/environment.js';
import { HttpError, httpClient } from '../../lib/http.js';
import {
  deriveBrandPalette,
  type BrandPalette,
  type BrandThemeCode,
  type PublicLayoutCode,
} from '../branding/brand-studio.js';
import { BrandAssetCard } from '../branding/BrandAssetCard.js';
import { BrandColorPalette } from '../branding/BrandColorPalette.js';
import { BrandLivePreview } from '../branding/BrandLivePreview.js';
import { BrandThemePicker } from '../branding/BrandThemePicker.js';
import { PublicLayoutPicker } from '../branding/PublicLayoutPicker.js';
import { PageHeader } from '../ui/AppUi.js';

type AssetKind = 'LOGO' | 'APP_ICON' | 'SPLASH';

const PALETTE_KEYS = [
  'primaryColor',
  'secondaryColor',
  'accentColor',
  'backgroundColor',
  'surfaceColor',
  'textColor',
  'mutedTextColor',
  'borderColor',
] as const satisfies readonly (keyof BrandPalette)[];

const HEX = /^#[0-9A-Fa-f]{6}$/u;

export function WhiteLabelModule({ tenantPublicId }: { tenantPublicId: string }) {
  const client = useQueryClient();
  const queryKey = ['tenant', tenantPublicId, 'white-label'];
  const settings = useQuery({
    queryKey,
    queryFn: async () => {
      try {
        return await httpClient.request('/tenant/white-label', {
          schema: TenantWhiteLabelResponseSchema,
          tenantPublicId,
        });
      } catch (error) {
        if (import.meta.env.DEV)
          console.error('[BrandStudio] request failed', {
            request: 'GET /tenant/white-label',
            status: error instanceof HttpError ? error.status : null,
            errorCode: error instanceof HttpError ? error.code : 'UNKNOWN_ERROR',
          });
        throw error;
      }
    },
    retry: false,
  });
  const [themeOverride, setThemeOverride] = useState<BrandThemeCode | null>(null);
  const [layoutOverride, setLayoutOverride] = useState<PublicLayoutCode | null>(null);
  const [paletteOverride, setPaletteOverride] = useState<Partial<BrandPalette>>({});
  const [previewMode, setPreviewMode] = useState<'mobile' | 'desktop'>('mobile');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const theme = themeOverride ?? settings.data?.site.theme ?? 'CLASSIC';
  // Tenants sem escolha explícita permanecem no modelo clássico.
  const layout = layoutOverride ?? settings.data?.site.layout ?? 'CLASSIC';

  const savedPalette = useMemo<BrandPalette>(() => {
    const branding = settings.data?.branding;
    const fallback = deriveBrandPalette('#2457D6', theme);
    if (branding === undefined) return fallback;
    return Object.fromEntries(
      PALETTE_KEYS.map((key) => [key, branding[key]]),
    ) as BrandPalette;
    // O tema entra no fallback apenas quando não há branding salvo.
  }, [settings.data?.branding, theme]);

  const palette = { ...savedPalette, ...paletteOverride };
  const dirty =
    themeOverride !== null || layoutOverride !== null || Object.keys(paletteOverride).length > 0;
  const paletteValid = PALETTE_KEYS.every((key) => HEX.test(palette[key]));

  const refresh = async () => {
    await client.invalidateQueries({ queryKey });
    setPreviewVersion((version) => version + 1);
  };

  const save = useMutation({
    mutationFn: async () => {
      await httpClient.request('/tenant/branding', {
        method: 'PATCH',
        tenantPublicId,
        body: { ...palette, useProfileDefaults: false },
        schema: TenantWhiteLabelResponseSchema,
      });
      await httpClient.request('/tenant/public-site', {
        method: 'PATCH',
        tenantPublicId,
        body: { theme, layout },
        schema: TenantPublicSiteSchema,
      });
    },
    onSuccess: async () => {
      setThemeOverride(null);
      setLayoutOverride(null);
      setPaletteOverride({});
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

  const busy = upload.isPending || remove.isPending;
  const preview = (
    <BrandLivePreview
      slug={settings.data.slug}
      version={previewVersion}
      mode={previewMode}
      onModeChange={setPreviewMode}
    />
  );

  return (
    <section className="brand-studio" aria-labelledby="brand-studio-title">
      <PageHeader
        eyebrow="Minha empresa"
        title="Marca e aparência"
        description="Edite a identidade do seu negócio e veja o resultado na sua página pública real."
        actions={
          <button
            className="secondary-button brand-preview-trigger"
            type="button"
            onClick={() => {
              setPreviewOpen(true);
            }}
          >
            Visualizar página
          </button>
        }
      />
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
            <h3>Identidade</h3>
            <p>Sua logo aparece na página pública e no aplicativo.</p>
            <BrandAssetCard
              title="Logo do estabelecimento"
              description="PNG, JPG ou WebP — de preferência com fundo transparente."
              previewUrl={assetUrl('LOGO')}
              busy={busy}
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
            <h3>Experiência</h3>
            <p>Define a estrutura e a navegação da página pública — não altera as cores.</p>
            <PublicLayoutPicker
              value={layout}
              onChange={(value) => {
                setLayoutOverride(value);
              }}
            />
          </section>

          <section className="brand-settings-card">
            <span className="brand-section-number">03</span>
            <h3>Escolha um tema</h3>
            <p>
              Quatro estilos visuais para adaptar a experiência à identidade do seu negócio.
            </p>
            <BrandThemePicker
              value={theme}
              onChange={(value) => {
                setThemeOverride(value);
                // Trocar o tema carrega os defaults dele; ajustes posteriores
                // sobrescrevem apenas os tokens escolhidos.
                setPaletteOverride(deriveBrandPalette(palette.primaryColor, value));
              }}
            />
          </section>

          <section className="brand-settings-card">
            <span className="brand-section-number">04</span>
            <h3>Personalize as cores</h3>
            <p>Cada cor abaixo é aplicada diretamente na sua página pública.</p>
            <BrandColorPalette
              palette={palette}
              onChange={(key, value) => {
                setPaletteOverride((current) => ({ ...current, [key]: value }));
              }}
              onApplyPreset={(color) => {
                setPaletteOverride(deriveBrandPalette(color, theme));
              }}
              onRestoreTheme={() => {
                setPaletteOverride(deriveBrandPalette(palette.primaryColor, theme));
              }}
            />
          </section>

          <section className="brand-settings-card">
            <span className="brand-section-number">05</span>
            <h3>Aplicativo</h3>
            <p>Imagens usadas quando seus clientes instalam o aplicativo.</p>
            <div className="brand-app-assets">
              <BrandAssetCard
                title="Tela de abertura"
                description="Imagem vertical, com área central livre."
                previewUrl={assetUrl('SPLASH')}
                busy={busy}
                shape="portrait"
                extraAction={
                  assets.has('SPLASH')
                    ? {
                        label: 'Usar meu logo automaticamente',
                        onClick: () => {
                          removeKind('SPLASH');
                        },
                      }
                    : undefined
                }
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
              <BrandAssetCard
                title="Ícone do aplicativo"
                description="Usado quando o aplicativo é adicionado à tela inicial. Quadrado, mínimo 512×512."
                previewUrl={assetUrl('APP_ICON')}
                busy={busy}
                shape="square"
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
            </div>
          </section>
        </div>

        <aside className="brand-preview-panel">{preview}</aside>
      </div>

      {previewOpen ? (
        <div className="brand-preview-sheet" role="dialog" aria-label="Prévia da página pública">
          <button
            className="secondary-button button--sm"
            type="button"
            onClick={() => {
              setPreviewOpen(false);
            }}
          >
            Fechar
          </button>
          {preview}
        </div>
      ) : null}

      {dirty ? (
        <div className="brand-action-bar" role="status">
          <span>
            <strong>Alterações não salvas</strong>
            <small>A prévia é atualizada assim que você salvar.</small>
          </span>
          <div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setThemeOverride(null);
                setLayoutOverride(null);
                setPaletteOverride({});
              }}
            >
              Descartar
            </button>
            <button
              className="primary-button"
              disabled={save.isPending || !paletteValid}
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
