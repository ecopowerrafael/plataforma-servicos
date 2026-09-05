import {
  TenantPublicSiteSchema,
  TenantWhiteLabelResponseSchema,
  UpdateTenantPublicSiteRequestSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';

interface Fields {
  heroTitle: string;
  heroSubtitle: string;
  aboutText: string;
  primaryCallToAction: string;
  footerText: string;
  seoTitle: string;
  seoDescription: string;
  pwaName: string;
  pwaShortName: string;
  pwaDescription: string;
}
const empty: Fields = {
  heroTitle: '',
  heroSubtitle: '',
  aboutText: '',
  primaryCallToAction: '',
  footerText: '',
  seoTitle: '',
  seoDescription: '',
  pwaName: '',
  pwaShortName: '',
  pwaDescription: '',
};
const nullable = (value: string) => (value.trim() === '' ? null : value.trim());

export function PublicPageSettingsModule({ tenantPublicId }: { tenantPublicId: string }) {
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
  const [fieldsOverride, setFieldsOverride] = useState<Fields | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const site = settings.data?.site;
  const persistedFields: Fields =
    site === undefined
      ? empty
      : {
          heroTitle: site.heroTitle ?? '',
          heroSubtitle: site.heroSubtitle ?? '',
          aboutText: site.aboutText ?? '',
          primaryCallToAction: site.primaryCallToAction ?? '',
          footerText: site.footerText ?? '',
          seoTitle: site.seoTitle ?? '',
          seoDescription: site.seoDescription ?? '',
          pwaName: site.pwaName ?? '',
          pwaShortName: site.pwaShortName ?? '',
          pwaDescription: site.pwaDescription ?? '',
        };
  const fields = fieldsOverride ?? persistedFields;
  const save = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/public-site', {
        method: 'PATCH',
        tenantPublicId,
        body: UpdateTenantPublicSiteRequestSchema.parse({
          heroTitle: nullable(fields.heroTitle),
          heroSubtitle: nullable(fields.heroSubtitle),
          aboutText: nullable(fields.aboutText),
          primaryCallToAction: nullable(fields.primaryCallToAction),
          footerText: nullable(fields.footerText),
          seoTitle: nullable(fields.seoTitle),
          seoDescription: nullable(fields.seoDescription),
          pwaName: nullable(fields.pwaName),
          pwaShortName: nullable(fields.pwaShortName),
          pwaDescription: nullable(fields.pwaDescription),
        }),
        schema: TenantPublicSiteSchema,
      }),
    onSuccess: async () => {
      setFieldsOverride(null);
      setNotice('Página pública atualizada.');
      await client.invalidateQueries({ queryKey });
    },
  });
  const field = (
    name: keyof Fields,
    label: string,
    kind: 'input' | 'textarea' = 'input',
    maximum?: number,
  ) => (
    <label>
      {label}
      {kind === 'textarea' ? (
        <textarea
          className="control-full"
          value={fields[name]}
          maxLength={maximum}
          onChange={(event) => {
            setFieldsOverride((current) => ({
              ...(current ?? fields),
              [name]: event.target.value,
            }));
          }}
        />
      ) : (
        <input
          className="control-lg"
          value={fields[name]}
          maxLength={maximum}
          onChange={(event) => {
            setFieldsOverride((current) => ({
              ...(current ?? fields),
              [name]: event.target.value,
            }));
          }}
        />
      )}
    </label>
  );
  if (settings.isPending)
    return <section className="module-loading">Carregando página pública…</section>;
  if (settings.error instanceof Error || settings.data === undefined)
    return (
      <section className="area-error-state">
        <h2>Não foi possível carregar a página pública.</h2>
      </section>
    );
  return (
    <section className="public-page-settings" aria-labelledby="public-page-settings-title">
      <div className="module-header">
        <div>
          <p className="eyebrow">Minha empresa</p>
          <h2 id="public-page-settings-title">Página pública</h2>
          <p>Defina os textos, apresentação nos buscadores e nome do aplicativo instalado.</p>
        </div>
        <a
          className="secondary-button"
          href={`/public/${settings.data.slug}`}
          target="_blank"
          rel="noreferrer"
        >
          Visualizar página
        </a>
      </div>
      {notice === null ? null : <p className="success-message">{notice}</p>}
      {save.error instanceof Error ? <p className="form-error">{save.error.message}</p> : null}
      <form
        className="public-page-form"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <section className="brand-settings-card">
          <h3>Apresentação</h3>
          {field('heroTitle', 'Título principal')}
          {field('heroSubtitle', 'Mensagem de apresentação', 'textarea', 500)}
          {field('primaryCallToAction', 'Texto da chamada principal', 'input', 100)}
          {field('aboutText', 'Sobre o estabelecimento', 'textarea', 4000)}
          {field('footerText', 'Texto do rodapé', 'input', 500)}
        </section>
        <section className="brand-settings-card">
          <h3>Buscadores</h3>
          <p>Esses textos ajudam clientes a reconhecer sua página em resultados de busca.</p>
          {field('seoTitle', 'Título para buscadores', 'input', 70)}
          {field('seoDescription', 'Descrição para buscadores', 'textarea', 160)}
        </section>
        <section className="brand-settings-card">
          <h3>Aplicativo PWA</h3>
          <p>Usado quando o cliente adiciona seu espaço à tela inicial.</p>
          {field('pwaName', 'Nome do aplicativo', 'input', 80)}
          {field('pwaShortName', 'Nome curto', 'input', 30)}
          {field('pwaDescription', 'Descrição do aplicativo', 'textarea', 160)}
        </section>
        <div className="brand-action-bar">
          <span>As alterações serão aplicadas sem recarregar a página.</span>
          <button className="primary-button" disabled={save.isPending} type="submit">
            {save.isPending ? 'Salvando…' : 'Salvar página pública'}
          </button>
        </div>
      </form>
    </section>
  );
}
