import { PublicTenantSiteResponseSchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';
import { type CSSProperties, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { CustomerAuth } from '../components/CustomerAuth.js';
import { PublicBookingFlow } from '../components/PublicBookingFlow.js';
import { environment } from '../config/environment.js';
import { httpClient } from '../lib/http.js';
import { ClassicTheme } from '../themes/classic/ClassicTheme.js';
import { ModernTheme } from '../themes/modern/ModernTheme.js';
import { PremiumTheme } from '../themes/premium/PremiumTheme.js';

export function PublicTenantPage() {
  const { slug = '' } = useParams();
  const [searchParams] = useSearchParams();
  const [showSplash, setShowSplash] = useState(
    () => window.matchMedia('(display-mode: standalone)').matches,
  );
  const mediaUrl = (path: string) => `${environment.apiUrl}${path}`;
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
  if (site.data === undefined)
    return (
      <main className="app-shell">
        <h1>{'P\u00e1gina n\u00e3o encontrada'}</h1>
      </main>
    );
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
        <header className="public-header">
          {logo === undefined ? (
            <strong>{site.data.displayName}</strong>
          ) : (
            <img src={mediaUrl(logo.url)} alt={logo.altText ?? site.data.displayName} />
          )}
          <span>{site.data.terminology.service.plural}</span>
        </header>
        <CustomerAuth
          slug={slug}
          services={site.data.services}
          professionals={site.data.professionals}
        />
        <section className="public-hero">
          <h1>{site.data.site.heroTitle ?? site.data.displayName}</h1>
          <p>
            {site.data.site.heroSubtitle ?? 'Conhe\u00e7a nossos servi\u00e7os e nossa equipe.'}
          </p>
          {site.data.site.primaryCallToAction === null ? null : (
            <span className="public-cta">{site.data.site.primaryCallToAction}</span>
          )}
        </section>
        <section>
          <h2>{site.data.terminology.service.plural}</h2>
          <div className="public-cards">
            {site.data.services.map((service) => (
              <article key={service.publicId}>
                {service.imageUrl === null ? null : (
                  <img src={mediaUrl(service.imageUrl)} alt={service.name} />
                )}
                <h3>{service.name}</h3>
                <p>{service.description}</p>
                <small>{`${String(service.durationMinutes)} min`}</small>
              </article>
            ))}
          </div>
        </section>
        <section>
          <h2>{site.data.terminology.professional.plural}</h2>
          <div className="public-cards">
            {site.data.professionals.map((professional) => (
              <article key={professional.publicId}>
                {professional.photoUrl === null ? null : (
                  <img src={mediaUrl(professional.photoUrl)} alt={professional.name} />
                )}
                <h3>{professional.name}</h3>
                <p>{professional.bio}</p>
              </article>
            ))}
          </div>
        </section>
        <section>
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
