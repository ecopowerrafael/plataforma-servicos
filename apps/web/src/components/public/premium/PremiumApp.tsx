import {
  AppointmentListResponseSchema,
  type PublicTenantSiteResponseSchema,
} from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { type z } from 'zod';

import { PremiumBooking } from './PremiumBooking.js';
import { PremiumBottomNav, type PremiumTab } from './PremiumBottomNav.js';
import { environment } from '../../../config/environment.js';
import { httpClient } from '../../../lib/http.js';
import { DEMO_AVATAR, demoBannerFor } from '../demo-assets.js';
import { ServiceVisual } from '../ServiceVisual.js';

type Site = z.infer<typeof PublicTenantSiteResponseSchema>;

const brl = (cents: string) =>
  (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const initials = (name: string) =>
  name
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('pt-BR') ?? '')
    .join('');

type Appointment = z.infer<typeof AppointmentListResponseSchema>['items'][number];

function nextAppointmentOf(items: Appointment[]) {
  const now = Date.now();
  return items
    .filter(
      (item) =>
        new Date(item.startsAt).getTime() >= now &&
        item.status !== 'CANCELED' &&
        item.status !== 'NO_SHOW',
    )
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0];
}

/**
 * Modelo "App Premium": apresentação alternativa do mesmo site público.
 * Consome exatamente os mesmos dados do payload `/public/sites/:slug`.
 */
export function PremiumApp({
  slug,
  site,
  logoUrl,
  customerName,
  onOpenAccount,
}: {
  slug: string;
  site: Site;
  logoUrl: string | null;
  customerName: string | null;
  onOpenAccount: () => void;
}) {
  const [tab, setTab] = useState<PremiumTab>('home');
  const appointments = useQuery({
    queryKey: ['public', slug, 'customer', 'appointments', 'upcoming'],
    queryFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/appointments/upcoming`, {
        schema: AppointmentListResponseSchema,
      }),
    enabled: customerName !== null,
    retry: false,
  });
  const upcoming = nextAppointmentOf(appointments.data?.items ?? []);
  const hasBanner = site.assets.some(
    (asset) => asset.kind === 'BANNER_MOBILE' || asset.kind === 'BANNER_DESKTOP',
  );
  // Banner de exemplo enquanto o tenant não envia o próprio; se o arquivo não
  // existir, sobra apenas o gradiente do tema.
  const heroStyle = hasBanner
    ? undefined
    : { '--tenant-banner-mobile': `url(${demoBannerFor(site.businessProfile)})` };

  return (
    <div className="premium-app">
      <header className="premium-header">
        <div className="premium-brand">
          {logoUrl === null ? (
            <strong>{site.displayName}</strong>
          ) : (
            <img src={`${environment.apiUrl}${logoUrl}`} alt={site.displayName} />
          )}
        </div>
        <button
          className={`premium-account${customerName === null ? '' : ' is-logged'}`}
          type="button"
          aria-label={customerName === null ? 'Entrar ou criar conta' : `Conta de ${customerName}`}
          onClick={onOpenAccount}
        >
          {customerName === null ? (
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle cx="12" cy="8.5" r="3.6" />
              <path d="M4.6 20a7.4 7.4 0 0 1 14.8 0" />
            </svg>
          ) : (
            <span aria-hidden="true">{initials(customerName)}</span>
          )}
        </button>
      </header>

      {tab === 'home' ? (
        <main className="premium-main">
          <section className="premium-hero" style={heroStyle as React.CSSProperties | undefined}>
            <div>
              <p className="premium-eyebrow">
                {site.site.heroSubtitle ?? 'Agende em poucos toques'}
              </p>
              <h1>{site.site.heroTitle ?? site.displayName}</h1>
              <button
                className="premium-cta"
                type="button"
                onClick={() => {
                  setTab('booking');
                }}
              >
                {site.site.primaryCallToAction ?? 'Agendar agora'}
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </section>

          {site.services.length > 0 ? (
            <section className="premium-section">
              <header>
                <h2>{site.terminology.service.plural}</h2>
                <button
                  type="button"
                  onClick={() => {
                    setTab('services');
                  }}
                >
                  Ver todos
                </button>
              </header>
              <div className="premium-service-grid">
                {site.services.slice(0, 4).map((service) => (
                  <button
                    key={service.publicId}
                    className="premium-service-card"
                    type="button"
                    onClick={() => {
                      setTab('booking');
                    }}
                  >
                    <ServiceVisual
                      name={service.name}
                      imageUrl={service.imageUrl}
                      iconKey={service.iconKey}
                    />
                    <strong>{service.name}</strong>
                    <small>A partir de</small>
                    <b>{brl(service.priceCents)}</b>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {site.professionals.length > 0 ? (
            <section className="premium-section">
              <header>
                <h2>{site.terminology.professional.plural}</h2>
              </header>
              <div className="premium-professional-row">
                {site.professionals.map((professional) => (
                  <article key={professional.publicId} className="premium-professional">
                    <span className="premium-avatar">
                      <b>{initials(professional.name)}</b>
                      <img
                        alt=""
                        src={
                          professional.photoUrl === null
                            ? DEMO_AVATAR
                            : `${environment.apiUrl}${professional.photoUrl}`
                        }
                        onError={(event) => {
                          event.currentTarget.style.display = 'none';
                        }}
                      />
                    </span>
                    <strong>{professional.name}</strong>
                    {professional.bio === null ? null : <small>{professional.bio}</small>}
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {upcoming === undefined ? null : (
            <section className="premium-section">
              <header>
                <h2>Meu próximo horário</h2>
              </header>
              <article className="premium-next">
                <span className="premium-next-date">
                  <small>
                    {new Date(upcoming.startsAt).toLocaleDateString('pt-BR', { weekday: 'short' })}
                  </small>
                  <strong>{new Date(upcoming.startsAt).getDate()}</strong>
                  <small>
                    {new Date(upcoming.startsAt).toLocaleDateString('pt-BR', { month: 'short' })}
                  </small>
                </span>
                <span className="premium-next-body">
                  <strong>
                    {new Date(upcoming.startsAt).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </strong>
                  <small>{upcoming.serviceName}</small>
                  <small>com {upcoming.professionalName}</small>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setTab('appointments');
                  }}
                >
                  Ver detalhes
                </button>
              </article>
            </section>
          )}
        </main>
      ) : null}

      {tab === 'services' ? (
        <main className="premium-main">
          <section className="premium-section">
            <header>
              <h2>{site.terminology.service.plural}</h2>
            </header>
            <div className="premium-service-list">
              {site.services.map((service) => (
                <button
                  key={service.publicId}
                  className="premium-service-row"
                  type="button"
                  onClick={() => {
                    setTab('booking');
                  }}
                >
                  <ServiceVisual
                    name={service.name}
                    imageUrl={service.imageUrl}
                    iconKey={service.iconKey}
                  />
                  <span>
                    <strong>{service.name}</strong>
                    {service.description === null ? null : <small>{service.description}</small>}
                  </span>
                  <span className="premium-service-meta">
                    <b>{brl(service.priceCents)}</b>
                    <small>{service.durationMinutes} min</small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </main>
      ) : null}

      {tab === 'appointments' ? (
        <main className="premium-main">
          <section className="premium-section">
            <header>
              <h2>Meus agendamentos</h2>
            </header>
            {customerName === null ? (
              <div className="premium-empty">
                <strong>Entre para ver seus horários</strong>
                <button className="premium-cta" type="button" onClick={onOpenAccount}>
                  Entrar
                </button>
              </div>
            ) : (appointments.data?.items.length ?? 0) === 0 ? (
              <div className="premium-empty">
                <strong>Nenhum agendamento por aqui</strong>
                <button
                  className="premium-cta"
                  type="button"
                  onClick={() => {
                    setTab('booking');
                  }}
                >
                  Agendar agora
                </button>
              </div>
            ) : (
              <div className="premium-service-list">
                {appointments.data?.items.map((item) => (
                  <article key={item.publicId} className="premium-service-row is-static">
                    <span>
                      <strong>{item.serviceName}</strong>
                      <small>com {item.professionalName}</small>
                    </span>
                    <span className="premium-service-meta">
                      <b>
                        {new Date(item.startsAt).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                        })}
                      </b>
                      <small>
                        {new Date(item.startsAt).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </small>
                    </span>
                  </article>
                ))}
              </div>
            )}
          </section>
        </main>
      ) : null}

      {tab === 'booking' ? (
        <main className="premium-main premium-booking">
          <PremiumBooking
            slug={slug}
            site={site}
            onFinish={() => {
              setTab('home');
            }}
          />
        </main>
      ) : null}

      {tab === 'profile' ? (
        <main className="premium-main">
          <section className="premium-section">
            <header>
              <h2>Perfil</h2>
            </header>
            <div className="premium-empty">
              <strong>{customerName ?? 'Você ainda não entrou'}</strong>
              <button className="premium-cta" type="button" onClick={onOpenAccount}>
                {customerName === null ? 'Entrar ou criar conta' : 'Abrir minha conta'}
              </button>
            </div>
          </section>
        </main>
      ) : null}

      {/* Durante o agendamento a navegação é o próprio botão voltar do fluxo. */}
      {tab === 'booking' ? null : <PremiumBottomNav active={tab} onChange={setTab} />}
    </div>
  );
}
