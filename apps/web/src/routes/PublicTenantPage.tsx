import { CustomerAuthResponseSchema, PublicTenantSiteResponseSchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';
import { type CSSProperties, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { contrastTextColor } from '../components/branding/brand-studio.js';
import { CustomerAccountSheet } from '../components/public/CustomerAccountSheet.js';
import { PublicHeader } from '../components/public/PublicHeader.js';
import { PublicBookingFlow } from '../components/PublicBookingFlow.js';
import { environment } from '../config/environment.js';
import { HttpError, httpClient } from '../lib/http.js';
import { ClassicTheme } from '../themes/classic/ClassicTheme.js';
import { ModernTheme } from '../themes/modern/ModernTheme.js';
import { PremiumTheme } from '../themes/premium/PremiumTheme.js';

const brl = (cents: string) =>
  (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const initials = (name: string) =>
  name
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('pt-BR') ?? '')
    .join('');

export function PublicTenantPage() {
  const { slug = '' } = useParams();
  const [searchParams] = useSearchParams();
  const [showSplash, setShowSplash] = useState(
    () => window.matchMedia('(display-mode: standalone)').matches,
  );
  const [accountOpen, setAccountOpen] = useState(false);
  const mediaUrl = (path: string) => `${environment.apiUrl}${path}`;
  const customer = useQuery({
    queryKey: ['public', slug, 'customer', 'me'],
    queryFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/me`, {
        schema: CustomerAuthResponseSchema,
      }),
    retry: false,
  });
  const site = useQuery({
    queryKey: ['public-site', slug],
    queryFn: () =>
      httpClient.request(`/public/sites/${slug}`, { schema: PublicTenantSiteResponseSchema }),
    retry: false,
  });
  useEffect(() => {
    if (site.data === undefined) return;
    document.title = site.data.site.seoTitle ?? site.data.displayName;
    let description = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description === null) {
      description = document.createElement('meta');
      description.name = 'description';
      document.head.append(description);
    }
    description.content = site.data.site.seoDescription ?? site.data.site.aboutText ?? '';
    let manifest = document.head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (manifest === null) {
      manifest = document.createElement('link');
      manifest.rel = 'manifest';
      document.head.append(manifest);
    }
    manifest.href = `${environment.apiUrl}/public/sites/${site.data.slug}/manifest.webmanifest`;
    const faviconAsset = site.data.assets.find(
      (asset) => asset.kind === 'FAVICON' || asset.kind === 'APP_ICON',
    );
    if (faviconAsset !== undefined) {
      let favicon = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (favicon === null) {
        favicon = document.createElement('link');
        favicon.rel = 'icon';
        document.head.append(favicon);
      }
      favicon.href = mediaUrl(faviconAsset.url);
    }
    if (window.matchMedia('(display-mode: standalone)').matches) {
      const timer = window.setTimeout(() => {
        setShowSplash(false);
      }, 1100);
      return () => {
        window.clearTimeout(timer);
      };
    }
    return undefined;
  }, [site.data]);
  if (site.isPending)
    return (
      <main className="app-shell">
        <p>{'Carregando estabelecimento\u2026'}</p>
      </main>
    );
  if (site.data === undefined) {
    const notFound = site.error instanceof HttpError && site.error.status === 404;
    return (
      <main className="app-shell">
        <h1>{notFound ? 'Página não encontrada' : 'Página temporariamente indisponível'}</h1>
        {!notFound ? (
          <>
            <p>Não foi possível carregar este estabelecimento agora.</p>
            <button className="primary-button" onClick={() => void site.refetch()}>
              Tentar novamente
            </button>
          </>
        ) : null}
      </main>
    );
  }
  const Theme =
    (searchParams.get('previewTheme') ?? site.data.site.theme) === 'MODERN'
      ? ModernTheme
      : (searchParams.get('previewTheme') ?? site.data.site.theme) === 'PREMIUM'
        ? PremiumTheme
        : ClassicTheme;
  const asset = (kind: string) => site.data.assets.find((item) => item.kind === kind);
  const logo = asset('LOGO');
  const banner = asset('BANNER_DESKTOP');
  const mobileBanner = asset('BANNER_MOBILE');
  const splash = asset('SPLASH') ?? logo;
  const address =
    site.data.unit === null
      ? null
      : [site.data.unit.street, site.data.unit.number, site.data.unit.city, site.data.unit.state]
          .filter(Boolean)
          .join(', ');
  return (
    <Theme>
      <div
        style={
          {
            '--tenant-primary': site.data.branding.primaryColor,
            '--tenant-on-primary': contrastTextColor(site.data.branding.primaryColor),
            '--tenant-secondary': site.data.branding.secondaryColor,
            '--tenant-accent': site.data.branding.accentColor,
            '--tenant-background': site.data.branding.backgroundColor,
            '--tenant-surface': site.data.branding.surfaceColor,
            '--tenant-text': site.data.branding.textColor,
            '--tenant-muted': site.data.branding.mutedTextColor,
            '--tenant-border': site.data.branding.borderColor,
            '--tenant-radius': site.data.branding.borderRadius,
            '--tenant-font': site.data.branding.fontFamily,
            '--tenant-banner-desktop':
              banner === undefined ? 'none' : `url(${mediaUrl(banner.url)})`,
            '--tenant-banner-mobile':
              mobileBanner === undefined
                ? banner === undefined
                  ? 'none'
                  : `url(${mediaUrl(banner.url)})`
                : `url(${mediaUrl(mobileBanner.url)})`,
          } as CSSProperties
        }
      >
        {showSplash ? (
          <div className="public-splash" aria-label="Abrindo aplicativo">
            {splash === undefined ? (
              <strong>{site.data.displayName}</strong>
            ) : (
              <img src={mediaUrl(splash.url)} alt={site.data.displayName} />
            )}
          </div>
        ) : null}
        <PublicHeader
          displayName={site.data.displayName}
          logoUrl={logo?.url ?? null}
          logoAlt={logo?.altText ?? null}
          customerName={customer.data?.customer.name ?? null}
          onOpenAccount={() => {
            setAccountOpen(true);
          }}
        />
        {accountOpen ? (
          <CustomerAccountSheet
            slug={slug}
            services={site.data.services}
            professionals={site.data.professionals}
            onClose={() => {
              setAccountOpen(false);
            }}
          />
        ) : null}
        <section className="public-hero">
          <h1>{site.data.site.heroTitle ?? site.data.displayName}</h1>
          <p>
            {site.data.site.heroSubtitle ?? 'Conhe\u00e7a nossos servi\u00e7os e nossa equipe.'}
          </p>
          {site.data.site.primaryCallToAction === null ? null : (
            <a className="public-cta" href="#agendar">
              {site.data.site.primaryCallToAction}
            </a>
          )}
        </section>
        {site.data.services.length === 0 ? null : (
          <section className="public-section">
            <h2>{site.data.terminology.service.plural}</h2>
            <div className="public-service-grid">
              {site.data.services.map((service) => (
                <article key={service.publicId} className="public-service-card">
                  <div className="public-service-media">
                    {service.imageUrl === null ? (
                      <span aria-hidden="true">{service.name.slice(0, 1)}</span>
                    ) : (
                      <img src={mediaUrl(service.imageUrl)} alt={service.name} />
                    )}
                  </div>
                  <div className="public-service-body">
                    <h3>{service.name}</h3>
                    {service.description === null ? null : <p>{service.description}</p>}
                    <div className="public-service-meta">
                      <strong>{brl(service.priceCents)}</strong>
                      <span>{`${String(service.durationMinutes)} min`}</span>
                    </div>
                    <a className="public-service-cta" href={`?service=${service.publicId}#agendar`}>
                      Agendar horário
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
        {site.data.professionals.length === 0 ? null : (
          <section className="public-section">
            <h2>{site.data.terminology.professional.plural}</h2>
            <div className="public-professional-grid">
              {site.data.professionals.map((professional) => (
                <article key={professional.publicId} className="public-professional-card">
                  <div className="public-professional-avatar">
                    {professional.photoUrl === null ? (
                      <span aria-hidden="true">{initials(professional.name)}</span>
                    ) : (
                      <img src={mediaUrl(professional.photoUrl)} alt={professional.name} />
                    )}
                  </div>
                  <h3>{professional.name}</h3>
                  {professional.bio === null ? null : <p>{professional.bio}</p>}
                  <a className="public-professional-cta" href="#agendar">
                    Agendar
                  </a>
                </article>
              ))}
            </div>
          </section>
        )}
        <section id="agendar">
          <h2>{site.data.terminology.appointment.singular}</h2>
          <PublicBookingFlow slug={slug} site={site.data} />
        </section>
        <section>
          <h2>Sobre</h2>
          <p>{site.data.site.aboutText ?? site.data.displayName}</p>
        </section>
        <section>
          <h2>Contato e localiza\u00e7\u00e3o</h2>
          {address === null ? (
            <p>Entre em contato para mais informa\u00e7\u00f5es.</p>
          ) : (
            <p>{address}</p>
          )}
          <p>{site.data.unit?.timezone}</p>
        </section>
        <footer>{site.data.site.footerText ?? site.data.displayName}</footer>
      </div>
    </Theme>
  );
}
