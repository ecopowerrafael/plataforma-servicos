import {
  SuccessResponseSchema,
  TenantMediaAssetSchema,
  TenantPublicSiteSchema,
  TenantWhiteLabelResponseSchema,
  UpdateTenantBrandingRequestSchema,
  UpdateTenantPublicSiteRequestSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { environment } from '../../config/environment.js';
import { httpClient } from '../../lib/http.js';

const FONT_OPTIONS = ['system-ui', 'Inter', 'Poppins', 'Montserrat'] as const;
const RADIUS_OPTIONS = ['0.25rem', '0.5rem', '0.75rem', '1rem'] as const;
const THEME_PREVIEW_OPTIONS = ['CLASSIC', 'MODERN', 'PREMIUM'] as const;
const COLOR_FIELDS = [
  ['primaryColor', 'Cor prim\u00e1ria'],
  ['secondaryColor', 'Cor secund\u00e1ria'],
  ['accentColor', 'Cor de destaque'],
  ['backgroundColor', 'Cor de fundo'],
  ['surfaceColor', 'Cor de superf\u00edcie'],
  ['textColor', 'Cor do texto'],
  ['mutedTextColor', 'Cor do texto secund\u00e1rio'],
  ['borderColor', 'Cor da borda'],
] as const;

function optionalText(value: FormDataEntryValue | undefined): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text === '' ? null : text;
}

export function WhiteLabelModule({ tenantPublicId }: { tenantPublicId: string }) {
  const client = useQueryClient();
  const [preview, setPreview] = useState(false);
  const [previewTheme, setPreviewTheme] =
    useState<(typeof THEME_PREVIEW_OPTIONS)[number]>('CLASSIC');
  const [notice, setNotice] = useState<string | null>(null);
  const settings = useQuery({
    queryKey: ['tenant', tenantPublicId, 'white-label'],
    queryFn: () =>
      httpClient.request('/tenant/white-label', {
        schema: TenantWhiteLabelResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const save = useMutation({
    mutationFn: (body: unknown) =>
      httpClient.request('/tenant/public-site', {
        method: 'PATCH',
        body,
        schema: TenantPublicSiteSchema,
        tenantPublicId,
      }),
    onSuccess: async () => {
      setNotice('Configura\u00e7\u00e3o salva.');
      await client.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'white-label'] });
    },
  });
  const saveBranding = useMutation({
    mutationFn: (body: unknown) =>
      httpClient.request('/tenant/branding', {
        method: 'PATCH',
        body,
        schema: TenantWhiteLabelResponseSchema,
        tenantPublicId,
      }),
    onSuccess: async () => {
      setNotice('Identidade visual salva.');
      await client.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'white-label'] });
    },
  });
  const upload = useMutation({
    mutationFn: ({ kind, file }: { kind: string; file: File }) => {
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
      setNotice('Imagem atualizada.');
      await client.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'white-label'] });
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
      await client.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'white-label'] });
    },
  });
  if (settings.isPending)
    return (
      <section className="sessions-panel">
        <p>{'Carregando personaliza\u00e7\u00e3o\u2026'}</p>
      </section>
    );
  if (settings.data === undefined) return null;
  const submit = (form: HTMLFormElement) => {
    const values = Object.fromEntries(new FormData(form));
    const body = UpdateTenantPublicSiteRequestSchema.parse({
      theme: values.theme,
      heroTitle: optionalText(values.heroTitle),
      heroSubtitle: optionalText(values.heroSubtitle),
      aboutText: optionalText(values.aboutText),
      primaryCallToAction: optionalText(values.primaryCallToAction),
      footerText: optionalText(values.footerText),
      seoTitle: optionalText(values.seoTitle),
      seoDescription: optionalText(values.seoDescription),
      pwaName: optionalText(values.pwaName),
      pwaShortName: optionalText(values.pwaShortName),
      pwaDescription: optionalText(values.pwaDescription),
    });
    save.mutate(body);
  };
  const submitBranding = (form: HTMLFormElement) => {
    const values = Object.fromEntries(new FormData(form));
    const body = UpdateTenantBrandingRequestSchema.parse({
      useProfileDefaults: values.useProfileDefaults === 'on',
      primaryColor: values.primaryColor,
      secondaryColor: values.secondaryColor,
      accentColor: values.accentColor,
      backgroundColor: values.backgroundColor,
      surfaceColor: values.surfaceColor,
      textColor: values.textColor,
      mutedTextColor: values.mutedTextColor,
      borderColor: values.borderColor,
      borderRadius: values.borderRadius,
      fontFamily: values.fontFamily,
    });
    saveBranding.mutate(body);
  };
  return (
    <section className="sessions-panel" aria-labelledby="white-label-title">
      <p className="eyebrow">Identidade</p>
      <h2 id="white-label-title">{'P\u00e1gina p\u00fablica e PWA'}</h2>
      {notice === null ? null : <p className="success-message">{notice}</p>}
      {save.error instanceof Error ? <p className="form-error">{save.error.message}</p> : null}
      {saveBranding.error instanceof Error ? (
        <p className="form-error">{saveBranding.error.message}</p>
      ) : null}
      {upload.error instanceof Error ? <p className="form-error">{upload.error.message}</p> : null}
      <form
        className="platform-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit(event.currentTarget);
        }}
      >
        <label>
          Tema
          <select name="theme" defaultValue={settings.data.site.theme}>
            <option value="CLASSIC">Classic</option>
            <option value="MODERN">Modern</option>
            <option value="PREMIUM">Premium</option>
          </select>
        </label>
        <label>
          {'T\u00edtulo principal'}
          <input name="heroTitle" defaultValue={settings.data.site.heroTitle ?? ''} />
        </label>
        <label>
          {'Subt\u00edtulo'}
          <input name="heroSubtitle" defaultValue={settings.data.site.heroSubtitle ?? ''} />
        </label>
        <label>
          Sobre
          <textarea name="aboutText" defaultValue={settings.data.site.aboutText ?? ''} />
        </label>
        <label>
          Chamada principal
          <input
            name="primaryCallToAction"
            defaultValue={settings.data.site.primaryCallToAction ?? ''}
          />
        </label>
        <label>
          Rodap\u00e9
          <input name="footerText" defaultValue={settings.data.site.footerText ?? ''} />
        </label>
        <label>
          {'SEO: t\u00edtulo'}
          <input name="seoTitle" maxLength={70} defaultValue={settings.data.site.seoTitle ?? ''} />
        </label>
        <label>
          {'SEO: descri\u00e7\u00e3o'}
          <textarea
            name="seoDescription"
            maxLength={160}
            defaultValue={settings.data.site.seoDescription ?? ''}
          />
        </label>
        <label>
          Nome PWA
          <input name="pwaName" maxLength={80} defaultValue={settings.data.site.pwaName ?? ''} />
        </label>
        <label>
          Nome curto PWA
          <input
            name="pwaShortName"
            maxLength={30}
            defaultValue={settings.data.site.pwaShortName ?? ''}
          />
        </label>
        <label>
          {'Descri\u00e7\u00e3o PWA'}
          <input
            name="pwaDescription"
            maxLength={160}
            defaultValue={settings.data.site.pwaDescription ?? ''}
          />
        </label>
        <div className="form-actions">
          <button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Salvando\u2026' : 'Salvar textos e tema'}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setPreview((value) => !value);
            }}
          >
            Preview
          </button>
        </div>
      </form>
      <form
        className="platform-form"
        onSubmit={(event) => {
          event.preventDefault();
          submitBranding(event.currentTarget);
        }}
      >
        <strong>Cores e fonte</strong>
        <label>
          Usar cores padr\u00e3o do perfil de neg\u00f3cio
          <input
            type="checkbox"
            name="useProfileDefaults"
            defaultChecked={settings.data.branding.useProfileDefaults}
          />
        </label>
        {COLOR_FIELDS.map(([name, label]) => (
          <label key={name}>
            {label}
            <input type="color" name={name} defaultValue={settings.data.branding[name]} />
          </label>
        ))}
        <label>
          Raio da borda
          <select name="borderRadius" defaultValue={settings.data.branding.borderRadius}>
            {RADIUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label>
          Fonte
          <select name="fontFamily" defaultValue={settings.data.branding.fontFamily}>
            {FONT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={saveBranding.isPending}>
          {saveBranding.isPending ? 'Salvando\u2026' : 'Salvar identidade visual'}
        </button>
      </form>
      <div className="platform-form">
        <strong>Biblioteca de m\u00eddia</strong>
        {(
          [
            'LOGO',
            'LOGO_COMPACT',
            'FAVICON',
            'APP_ICON',
            'SPLASH',
            'BANNER_DESKTOP',
            'BANNER_MOBILE',
            'INSTITUTIONAL',
          ] as const
        ).map((kind) => (
          <label key={kind}>
            {kind}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={upload.isPending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file !== undefined) upload.mutate({ kind, file });
              }}
            />
          </label>
        ))}
      </div>
      <div className="data-list" aria-label="Arquivos ativos">
        {settings.data.assets.map((asset) => (
          <div className="data-row" key={asset.publicId}>
            <img
              src={`${environment.apiUrl}${asset.url}`}
              alt={asset.altText ?? asset.kind}
              width="48"
              height="48"
            />
            <span>{asset.kind}</span>
            <span>{asset.originalName}</span>
            <button
              className="secondary-button"
              disabled={remove.isPending}
              onClick={() => {
                remove.mutate(asset.publicId);
              }}
              type="button"
            >
              Remover
            </button>
          </div>
        ))}
      </div>
      {preview ? (
        <div className="platform-form">
          <strong>Preview dos temas</strong>
          <div className="form-actions" role="tablist" aria-label="Selecionar tema para preview">
            {THEME_PREVIEW_OPTIONS.map((theme) => (
              <button
                key={theme}
                type="button"
                role="tab"
                aria-selected={previewTheme === theme}
                className={previewTheme === theme ? '' : 'secondary-button'}
                onClick={() => {
                  setPreviewTheme(theme);
                }}
              >
                {theme === 'CLASSIC' ? 'Classic' : theme === 'MODERN' ? 'Modern' : 'Premium'}
              </button>
            ))}
          </div>
          <iframe
            className="public-preview"
            title="Preview da p\u00e1gina p\u00fablica"
            src={`/public/${settings.data.slug}?previewTheme=${previewTheme}`}
          />
        </div>
      ) : null}
    </section>
  );
}
